import { constants } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, open, opendir, rename, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path'
import { validateLease } from '@brambodev/contracts'
import type { ArtifactManifest, ArtifactProvider, RunStore, WorkspaceRef } from '@brambodev/contracts'
import { artifactPath, checkedManifest, digestHex, EMPTY_MANIFEST_BYTES, entryMetadataBytes, identifier, MAX_METADATA_BYTES, revisionOf } from './manifest.ts'
import type { ArtifactLimits } from './manifest.ts'

export interface LocalArtifactProviderOptions {
  readonly rootDir: string
  readonly store: RunStore
  readonly limits?: Partial<ArtifactLimits>
}

const DEFAULT_LIMITS: ArtifactLimits = {
  maxFiles: 50_000, maxFileBytes: 268_435_456, maxTotalBytes: 2_147_483_648,
  maxTraversalEntries: 100_000, maxDepth: 128,
  maxPathBytes: 4096, maxMetadataBytes: MAX_METADATA_BYTES,
}
const CHUNK_BYTES = 64 * 1024

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException)?.code
}

async function directories(path: string, create = false): Promise<void> {
  const absolute = resolve(path)
  let current = parse(absolute).root
  for (const part of absolute.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, part)
    let created = false
    if (create) {
      try { await mkdir(current, { mode: 0o700 }); created = true } catch (error) { if (errorCode(error) !== 'EEXIST') throw error }
    }
    const info = await lstat(current)
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('unsafe directory path: symlink or non-directory')
    if (created) await syncDirectory(dirname(current))
  }
}

function contains(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path === '' || (!path.startsWith('..' + sep) && path !== '..' && !isAbsolute(path))
}

async function regular(path: string): Promise<void> {
  await directories(dirname(path))
  const info = await lstat(path)
  if (info.isSymbolicLink() || !info.isFile()) throw new Error('unsafe file path: symlink or unsupported file type')
}

async function syncDirectory(path: string): Promise<void> {
  let handle
  try {
    handle = await open(path, constants.O_RDONLY)
    await handle.sync()
  } catch (error) {
    // Windows does not expose portable directory fsync; some filesystems do not
    // support it either. Never suppress unrelated I/O failures.
    const code = errorCode(error)
    if (!['EINVAL', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS'].includes(code ?? '') &&
        !(process.platform === 'win32' && ['EISDIR', 'EPERM', 'EACCES'].includes(code ?? ''))) throw error
  } finally { await handle?.close() }
}

/** Assumes trusted ancestors; path checks are not a same-user race sandbox. */
export function createLocalArtifactProvider(options: LocalArtifactProviderOptions): ArtifactProvider {
  const limits = { ...DEFAULT_LIMITS, ...options.limits }
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) throw new Error('artifact limits must be safe non-negative integers')
  }
  if (limits.maxMetadataBytes > MAX_METADATA_BYTES) throw new Error('artifact metadata limit exceeds the local 64 MiB cap')
  const root = resolve(options.rootDir)
  // Hash scoped IDs so case-insensitive filesystems cannot alias tenant/Tenant
  // or workspace identities with different spellings. Never join raw IDs.
  const scopedKey = (value: string) => { identifier(value); return createHash('sha256').update(value).digest('hex') }
  const namespaceRoot = (namespace: string) => join(root, 'namespaces', scopedKey(namespace))
  const refPath = (ref: WorkspaceRef) => {
    return join(namespaceRoot(ref.namespace), 'workspaces', scopedKey(ref.workspaceId), digestHex(ref.revision))
  }
  const blobPath = (namespace: string, digest: string) => join(namespaceRoot(namespace), 'blobs', digestHex(digest), 'data')
  const revisionPath = (namespace: string, revision: string) => join(namespaceRoot(namespace), 'revisions', digestHex(revision), 'data')

  // Publish a fully synced private directory by rename. A populated immutable
  // destination cannot be replaced by rename, including concurrent writers.
  async function immutable(target: string, write: (path: string) => Promise<void>, verify: () => Promise<void>): Promise<void> {
    await directories(dirname(target), true)
    const temporary = join(dirname(target), '.tmp-' + randomUUID())
    await mkdir(temporary, { mode: 0o700 })
    try {
      await write(join(temporary, 'data'))
      await syncDirectory(temporary)
      await directories(dirname(target))
      try { await rename(temporary, target) } catch (error) {
        if (!['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES'].includes(errorCode(error) ?? '')) throw error
        await verify()
      }
      await verify()
      await syncDirectory(dirname(target))
    } finally { await rm(temporary, { recursive: true, force: true }) }
  }

  async function writeBytes(path: string, bytes: Uint8Array): Promise<void> {
    const handle = await open(path, 'wx', 0o600)
    try { await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
  }

  async function readMetadata(path: string): Promise<Uint8Array> {
    await regular(path)
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    const chunks: Buffer[] = []
    let total = 0
    try {
      if ((await handle.stat()).size > limits.maxMetadataBytes) throw new Error('artifact metadata budget exceeded')
      for (;;) {
        const chunk = Buffer.alloc(CHUNK_BYTES)
        const { bytesRead } = await handle.read(chunk)
        if (bytesRead === 0) break
        total += bytesRead
        if (total > limits.maxMetadataBytes) throw new Error('artifact metadata budget exceeded')
        chunks.push(chunk.subarray(0, bytesRead))
      }
      return Buffer.concat(chunks, total)
    } finally { await handle.close() }
  }

  async function loadRevision(namespace: string, revision: string): Promise<ArtifactManifest> {
    const bytes = await readMetadata(revisionPath(namespace, revision))
    const manifest = checkedManifest(JSON.parse(Buffer.from(bytes).toString('utf8')), limits)
    if (manifest.revision !== revision || !Buffer.from(bytes).equals(Buffer.from(JSON.stringify(manifest)))) throw new Error('artifact canonical revision integrity mismatch')
    return manifest
  }

  async function transfer(path: string, entry: ArtifactManifest['entries'][number], destination?: string | false): Promise<Uint8Array> {
    await regular(path)
    const input = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    let output
    const chunks: Buffer[] = []
    const hash = createHash('sha256')
    let size = 0
    try {
      if (typeof destination === 'string') output = await open(destination, 'wx', entry.executable ? 0o700 : 0o600)
      for (;;) {
        const chunk = Buffer.alloc(CHUNK_BYTES)
        const { bytesRead } = await input.read(chunk)
        if (bytesRead === 0) break
        size += bytesRead
        if (size > entry.size || size > limits.maxFileBytes) throw new Error('artifact size integrity mismatch / byte budget exceeded')
        const bytes = chunk.subarray(0, bytesRead)
        hash.update(bytes)
        if (output) await output.writeFile(bytes)
        else if (destination === undefined) chunks.push(bytes)
      }
      if (size !== entry.size || 'sha256:' + hash.digest('hex') !== entry.digest) throw new Error('artifact digest integrity mismatch')
      await output?.sync()
      return destination === undefined ? new Uint8Array(Buffer.concat(chunks, size)) : new Uint8Array()
    } finally { await input.close(); await output?.close() }
  }

  const provider: ArtifactProvider = {
    async stage(namespace, directory) {
      const ns = namespaceRoot(namespace)
      const source = resolve(directory)
      if (contains(root, source) || contains(source, root)) throw new Error('source path overlaps artifact provider root')
      await directories(source)
      await directories(ns, true)
      const entries: ArtifactManifest['entries'][number][] = []
      const paths = new Set<string>()
      let total = 0
      let traversed = 0
      let metadataBytes = EMPTY_MANIFEST_BYTES
      if (metadataBytes > limits.maxMetadataBytes) throw new Error('artifact metadata budget exceeded')
      async function walk(directory: string, prefix: string, depth: number): Promise<void> {
        await directories(directory)
        // Bounded native buffering; async iteration closes handles on failure.
        const children = await opendir(directory, { bufferSize: 1 })
        for await (const child of children) {
          if (++traversed > limits.maxTraversalEntries) throw new Error('artifact traversal-entry budget exceeded')
          if (depth + 1 > limits.maxDepth) throw new Error('artifact depth budget exceeded')
          const path = prefix + child.name
          artifactPath(path, limits)
          const collision = path.normalize('NFC').toLowerCase()
          if (paths.has(collision)) throw new Error('artifact path collision')
          paths.add(collision)
          const sourcePath = join(directory, child.name)
          const info = await lstat(sourcePath)
          if (info.isSymbolicLink()) throw new Error('unsafe source symlink')
          if (info.isDirectory()) { await walk(sourcePath, path + '/', depth + 1); continue }
          if (!info.isFile()) throw new Error('unsupported source file type')
          if (entries.length >= limits.maxFiles) throw new Error('artifact file-count budget exceeded')
          const temporaryParent = join(ns, 'blobs')
          await directories(temporaryParent, true)
          const temporary = join(temporaryParent, '.tmp-' + randomUUID())
          await mkdir(temporary, { mode: 0o700 })
          let input
          let output
          const hash = createHash('sha256')
          let size = 0
          try {
            input = await open(sourcePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
            output = await open(join(temporary, 'data'), 'wx', 0o600)
            for (;;) {
              const chunk = Buffer.alloc(CHUNK_BYTES)
              const { bytesRead } = await input.read(chunk)
              if (bytesRead === 0) break
              size += bytesRead
              total += bytesRead
              if (!Number.isSafeInteger(total) || size > limits.maxFileBytes || total > limits.maxTotalBytes) throw new Error('artifact byte budget exceeded')
              hash.update(chunk.subarray(0, bytesRead))
              await output.writeFile(chunk.subarray(0, bytesRead))
            }
            await output.sync()
            await output.close()
            output = undefined
            const entry = { path, digest: 'sha256:' + hash.digest('hex'), size, executable: (info.mode & 0o111) !== 0 }
            metadataBytes += entryMetadataBytes(entry, limits) + (entries.length === 0 ? 0 : 1)
            if (!Number.isSafeInteger(metadataBytes) || metadataBytes > limits.maxMetadataBytes) throw new Error('artifact metadata budget exceeded')
            await syncDirectory(temporary)
            const target = dirname(blobPath(namespace, entry.digest))
            try { await rename(temporary, target) } catch (error) {
              if (!['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES'].includes(errorCode(error) ?? '')) throw error
              await transfer(blobPath(namespace, entry.digest), entry, false)
            }
            await syncDirectory(temporaryParent)
            entries.push(entry)
          } finally {
            await input?.close()
            await output?.close()
            await rm(temporary, { recursive: true, force: true })
          }
        }
      }
      await walk(source, '', 0)
      const manifest = checkedManifest({ revision: revisionOf(entries, limits), entries }, limits)
      const bytes = Buffer.from(JSON.stringify(manifest))
      await immutable(dirname(revisionPath(namespace, manifest.revision)), (path) => writeBytes(path, bytes), async () => { await loadRevision(namespace, manifest.revision) })
      return manifest
    },
    async manifest(ref) {
      const association = await readMetadata(join(refPath(ref), 'data'))
      if (Buffer.from(association).toString('utf8') !== ref.revision) throw new Error('artifact association integrity mismatch')
      return loadRevision(ref.namespace, ref.revision)
    },
    async read(ref, path) {
      artifactPath(path, limits)
      const manifest = await provider.manifest(ref)
      const entry = manifest.entries.find((entry) => entry.path === path)
      if (!entry) throw new Error('artifact path not found')
      return transfer(blobPath(ref.namespace, entry.digest), entry)
    },
    async materialize(ref, directory) {
      const manifest = await provider.manifest(ref)
      const destination = resolve(directory)
      if (contains(root, destination) || contains(destination, root)) throw new Error('destination path overlaps artifact provider root')
      await directories(dirname(destination))
      // Reserve the final path exclusively; no overwrite of even an empty dir.
      await mkdir(destination, { mode: 0o700 })
      try {
        for (const entry of manifest.entries) {
          const target = join(destination, ...entry.path.split('/'))
          await directories(dirname(target), true)
          await transfer(blobPath(ref.namespace, entry.digest), entry, target)
          await syncDirectory(dirname(target))
        }
        await syncDirectory(destination)
        await syncDirectory(dirname(destination))
        return { id: ref.workspaceId, rootPath: destination, capabilities: ['read', 'write'] }
      } catch (error) { await rm(destination, { recursive: true, force: true }); throw error }
    },
    async publish(ref, staged, lease) {
      // Never retain caller-owned identity or authority across an await.
      const identity = Object.freeze({ namespace: ref.namespace, workspaceId: ref.workspaceId, revision: ref.revision })
      const target = refPath(identity)
      const manifest = checkedManifest(staged, limits)
      if (manifest.revision !== identity.revision) throw new Error('publication revision mismatch')
      const validated = validateLease(lease)
      const authority = Object.freeze({ ...validated, epochs: Object.freeze({ ...validated.epochs }) })
      if (authority.namespace !== identity.namespace || !Object.hasOwn(authority.epochs, 'workspace:' + identity.workspaceId)) throw new Error('publication lease scope mismatch')
      const persisted = await loadRevision(identity.namespace, identity.revision)
      if (JSON.stringify(persisted) !== JSON.stringify(manifest)) throw new Error('staged revision integrity mismatch')
      for (const entry of manifest.entries) await transfer(blobPath(identity.namespace, entry.digest), entry, false)
      if (!await options.store.valid(authority)) throw new Error('stale publication lease')
      await immutable(target, async (path) => {
        await writeBytes(path, Buffer.from(identity.revision))
        if (!await options.store.valid(authority)) throw new Error('stale publication lease')
      }, async () => {
        const bytes = await readMetadata(join(target, 'data'))
        if (Buffer.from(bytes).toString('utf8') !== identity.revision) throw new Error('artifact association integrity mismatch')
      })
    },
  }
  return provider
}
