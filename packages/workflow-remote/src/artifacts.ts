import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, opendir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { validateArtifactManifest, validateCommand, validateLease } from '@brambodev/contracts'
import type { ArtifactManifest, ArtifactProvider, WorkspaceRef } from '@brambodev/contracts'
import { createClient, record } from './client.ts'
import type { RemoteClientOptions } from './client.ts'
function corrupt(): never { throw new Error('Invalid remote artifact') }
const digest = (bytes: Uint8Array) => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
function checked(value: unknown, revision?: string): ArtifactManifest {
  const manifest = validateArtifactManifest(value)
  const paths = new Set<string>()
  for (const entry of manifest.entries) {
    if (!/^sha256:[a-f0-9]{64}$/.test(entry.digest)) corrupt()
    const key = entry.path.normalize('NFC').toLowerCase()
    if (paths.has(key)) corrupt()
    paths.add(key)
  }
  if (revision !== undefined && manifest.revision !== revision) corrupt()
  return manifest
}
export function createRemoteArtifactProvider(options: RemoteClientOptions): ArtifactProvider {
  const client = createClient(options)
  async function manifest(ref: WorkspaceRef) {
    const stable = structuredClone(ref)
    return checked(await client.request('artifact.manifest', { ref: stable }), stable.revision)
  }
  async function readEntry(ref: WorkspaceRef, entry: ArtifactManifest['entries'][number]): Promise<Uint8Array> {
    const result = record(await client.request('artifact.read', { ref, path: entry.path }), ['contentBase64'])
    if (typeof result['contentBase64'] !== 'string') corrupt()
    const bytes = Buffer.from(result['contentBase64'], 'base64')
    if (bytes.toString('base64') !== result['contentBase64'] || bytes.byteLength !== entry.size || digest(bytes) !== entry.digest) corrupt()
    return bytes
  }
  return {
    manifest,
    async read(ref, path) {
      const stable = structuredClone(ref)
      const entry = (await manifest(stable)).entries.find((item) => item.path === path)
      if (!entry) corrupt()
      return readEntry(stable, entry)
    },
    async stage(namespace, directory) {
      validateCommand({ key: { namespace, runId: 'upload' }, clientId: 'upload', idempotencyKey: 'upload', kind: 'start', payload: null })
      const files: { path: string; contentBase64: string; executable: boolean }[] = []
      const entries: ArtifactManifest['entries'][number][] = []
      let total = 0
      let visited = 0
      const root = resolve(directory)
      if (!(await lstat(root)).isDirectory() || (await lstat(root)).isSymbolicLink()) corrupt()
      async function walk(relative: string, depth: number): Promise<void> {
        if (depth > 128) corrupt()
        const dir = await opendir(join(root, relative))
        for await (const item of dir) {
          if (++visited > 10_000) corrupt()
          const path = relative ? relative + '/' + item.name : item.name
          if (Buffer.byteLength(path) > 4096) corrupt()
          validateArtifactManifest({ revision: 'probe', entries: [{ path, digest: 'probe', size: 0, executable: false }] })
          const full = join(root, ...path.split('/'))
          const stat = await lstat(full)
          if (stat.isSymbolicLink()) corrupt()
          if (stat.isDirectory()) { await walk(path, depth + 1); continue }
          if (!stat.isFile() || stat.size > 768 * 1024 - total) corrupt()
          const handle = await open(full, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
          const chunks: Buffer[] = []
          let size = 0
          try {
            if (!(await handle.stat()).isFile()) corrupt()
            for await (const chunk of handle.createReadStream({ autoClose: false, highWaterMark: 16 * 1024 })) {
              const bytes = chunk as Buffer
              if (bytes.length > 768 * 1024 - total - size) corrupt()
              size += bytes.length
              chunks.push(bytes)
            }
          } finally { await handle.close() }
          total += size
          const bytes = Buffer.concat(chunks, size)
          const executable = Boolean(stat.mode & 0o111)
          files.push({ path, contentBase64: bytes.toString('base64'), executable })
          entries.push({ path, digest: digest(bytes), size, executable })
        }
      }
      await walk('', 0)
      const result = checked(await client.request('artifact.stage', { files }))
      const expected = new Map(entries.map((entry) => [entry.path, entry]))
      if (result.entries.length !== expected.size || result.entries.some((entry) => {
        const prior = expected.get(entry.path)
        return !prior || prior.digest !== entry.digest || prior.size !== entry.size || prior.executable !== entry.executable
      })) corrupt()
      // Namespace is host-authenticated, not an upload field chosen by the caller.
      return result
    },
    async materialize(ref, directory) {
      const stable = structuredClone(ref)
      const data = await manifest(stable)
      const destination = resolve(directory)
      await mkdir(destination, { mode: 0o700 })
      try {
        for (const entry of data.entries) {
          const path = join(destination, ...entry.path.split('/'))
          await mkdir(dirname(path), { recursive: true, mode: 0o700 })
          await writeFile(path, await readEntry(stable, entry), { flag: 'wx', mode: entry.executable ? 0o700 : 0o600 })
        }
        return { id: stable.workspaceId, rootPath: destination, capabilities: ['read', 'write'] }
      } catch (error) {
        await rm(destination, { recursive: true, force: true })
        throw error
      }
    },
    async publish(ref, manifest, lease) {
      checked(manifest, ref.revision); validateLease(lease)
      if (lease.namespace !== ref.namespace || !Object.hasOwn(lease.epochs, 'workspace:' + ref.workspaceId)) corrupt()
      const result = record(await client.request('artifact.publish', { ref, manifest, lease }), ['published'])
      if (result['published'] !== true) corrupt()
    },
  }
}
