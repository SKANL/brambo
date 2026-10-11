import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { createRemoteArtifactProvider } from '../src/artifacts.ts'
import { ok, options, snapshot } from './fixtures.ts'
const bytes = Buffer.from('hello')
const manifest = { revision: '1', entries: [{ path: 'a.txt', digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex'), size: bytes.length, executable: false }] }
it.each([['Dir/a.txt', 'dir/b.txt'], ['caf\u00e9/a.txt', 'cafe\u0301/b.txt'], ['file', 'file/child']])('refuses portable directory/prefix aliases %j before materialization', async (first, second) => {
  const root = await mkdtemp(join(tmpdir(), 'remote-alias-'))
  try {
    const wire = vi.fn(async (_url, init) => {
      const { operation } = JSON.parse(init!.body as string)
      return ok(operation === 'artifact.manifest' ? { revision: '1', entries: [first, second].map((path) => ({ ...manifest.entries[0], path })) }
        : { contentBase64: bytes.toString('base64') })
    })
    const provider = createRemoteArtifactProvider(options(wire as typeof fetch))
    const destination = join(root, 'private')
    await expect(provider.materialize(snapshot.workspace, destination)).rejects.toThrow('Invalid remote artifact')
    await expect(stat(destination)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(wire).toHaveBeenCalledOnce()
  } finally { await rm(root, { recursive: true, force: true }) }
})
it('rehashes reads and refuses corrupt bytes', async () => {
  const provider = createRemoteArtifactProvider(options((async (_url, init) => {
    const { operation } = JSON.parse(init!.body as string)
    return ok(operation === 'artifact.manifest' ? manifest : { contentBase64: Buffer.from('wrong').toString('base64') })
  }) as typeof fetch))
  await expect(provider.read(snapshot.workspace, 'a.txt')).rejects.toThrow('Invalid remote artifact')
})
it('uploads bounded files, checks returned manifest and materializes independent verified copies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'remote-test-'))
  try {
    await writeFile(join(root, 'a.txt'), bytes)
    const wire = vi.fn(async (_url, init) => {
      const { operation, payload } = JSON.parse(init!.body as string)
      if (operation === 'artifact.stage') expect(payload.files[0].contentBase64).toBe(bytes.toString('base64'))
      return ok(operation === 'artifact.read' ? { contentBase64: bytes.toString('base64') } : manifest)
    })
    const provider = createRemoteArtifactProvider(options(wire as typeof fetch))
    expect(await provider.stage('tenant', root)).toEqual(manifest)
    const handle = await provider.materialize(snapshot.workspace, join(root, 'private'))
    expect(await readFile(join(handle.rootPath, 'a.txt'))).toEqual(bytes)
    await expect(provider.materialize(snapshot.workspace, root)).rejects.toThrow()
  } finally { await rm(root, { recursive: true, force: true }) }
})
