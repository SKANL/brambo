import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { fixture } from './helpers.ts'

it('provides a callable local artifact factory', async () => {
  const module = await import('../src/provider.ts').catch(() => undefined)
  expect(module?.createLocalArtifactProvider).toBeTypeOf('function')
})

it('round-trips sorted files, executable metadata and a canonical revision', async () => {
  const f = await fixture()
  await f.file('z.txt', 'old')
  await mkdir(join(f.source, 'nested'))
  await f.file('nested/a.sh', 'run')
  await chmod(join(f.source, 'nested/a.sh'), 0o700)
  const staged = await f.provider.stage('tenant', f.source)
  expect(staged.entries.map((e) => e.path)).toEqual(['nested/a.sh', 'z.txt'])
  const canonical = JSON.stringify({ entries: staged.entries.map(({ path, digest, size, executable }) => ({ path, digest, size, executable })) })
  expect(staged.revision).toBe('sha256:' + createHash('sha256').update(canonical).digest('hex'))
  expect(staged.entries[1]?.digest).toBe('sha256:cba06b5736faf67e54b07b561eae94395e774c517a7d910a54369e1263ccfbd4')
  expect(await f.provider.stage('tenant', f.source)).toEqual(staged)
  await f.provider.publish(f.ref(staged.revision), staged, f.lease)
  expect(await f.provider.manifest(f.ref(staged.revision))).toEqual(staged)
  expect(await f.provider.read(f.ref(staged.revision), 'z.txt')).toEqual(new TextEncoder().encode('old'))
  const dest = join(f.root, 'destination')
  const handle = await f.provider.materialize(f.ref(staged.revision), dest)
  expect(handle).toEqual({ id: 'ws', rootPath: dest, capabilities: ['read', 'write'] })
  expect(await readFile(join(dest, 'nested/a.sh'), 'utf8')).toBe('run')
  if (process.platform !== 'win32') {
    expect(staged.entries[0]?.executable).toBe(true)
    expect((await stat(join(dest, 'nested/a.sh'))).mode & 0o111).toBe(0o100)
  }
})

it('retains old revisions and materializes independent writable copies', async () => {
  const f = await fixture()
  await f.file('a.txt')
  const old = await f.provider.stage('tenant', f.source)
  await f.provider.publish(f.ref(old.revision), old, f.lease)
  await f.file('a.txt', 'new')
  const next = await f.provider.stage('tenant', f.source)
  await f.provider.publish(f.ref(next.revision), next, f.lease)
  expect(next.revision).not.toBe(old.revision)
  const dest = join(f.root, 'copy')
  await f.provider.materialize(f.ref(old.revision), dest)
  await writeFile(join(dest, 'a.txt'), 'changed in workspace')
  expect(await f.provider.read(f.ref(old.revision), 'a.txt')).toEqual(new TextEncoder().encode('old'))
  expect(await f.provider.read(f.ref(next.revision), 'a.txt')).toEqual(new TextEncoder().encode('new'))
})

it('refuses every existing destination, leaving its files untouched', async () => {
  const f = await fixture()
  await f.file('a.txt')
  const staged = await f.provider.stage('tenant', f.source)
  await f.provider.publish(f.ref(staged.revision), staged, f.lease)
  const dest = join(f.root, 'occupied')
  await mkdir(dest)
  await writeFile(join(dest, 'keep'), 'safe')
  await expect(f.provider.materialize(f.ref(staged.revision), dest)).rejects.toThrow(/exist|fresh/)
  expect(await readFile(join(dest, 'keep'), 'utf8')).toBe('safe')
})
