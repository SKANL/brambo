import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { createRemoteArtifactProvider } from '../src/artifacts.ts'
import { ok, options, snapshot } from './fixtures.ts'
const bytes = Buffer.from('hello')
const manifest = { revision: '1', entries: [{ path: 'a.txt', digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex'), size: bytes.length, executable: false }] }
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
