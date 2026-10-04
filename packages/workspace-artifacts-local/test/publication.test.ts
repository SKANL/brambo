import { mkdir, readdir, symlink, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { fixture, namespaceDirectory } from './helpers.ts'

it('rejects stale publication without an association or run-state advancement', async () => {
  const f = await fixture()
  await f.file('a')
  const staged = await f.provider.stage('tenant', f.source)
  f.invalidate()
  await expect(f.provider.publish(f.ref(staged.revision), staged, f.lease)).rejects.toThrow(/lease/)
  await expect(f.provider.manifest(f.ref(staged.revision))).rejects.toThrow()
})

it('requires the exact namespace, workspace resource and matching revision', async () => {
  const f = await fixture()
  await f.file('a')
  const staged = await f.provider.stage('tenant', f.source)
  for (const lease of [
    { ...f.lease, namespace: 'other' },
    { ...f.lease, epochs: { 'workspace:other': 1 } },
    { ...f.lease, expiresAt: 0 },
    { ...f.lease, token: 'stale-secret' },
  ]) await expect(f.provider.publish(f.ref(staged.revision), staged, lease)).rejects.toThrow(/lease/)
  await expect(f.provider.publish(f.ref('sha256:' + '0'.repeat(64)), staged, f.lease)).rejects.toThrow(/revision/)
  await expect(f.provider.publish({ ...f.ref(staged.revision), namespace: 'other' }, staged, { ...f.lease, namespace: 'other' })).rejects.toThrow()
})

it('publishes idempotently and concurrently without changing immutable bytes', async () => {
  const f = await fixture()
  await f.file('a')
  const [a, b] = await Promise.all([f.provider.stage('tenant', f.source), f.provider.stage('tenant', f.source)])
  expect(a).toEqual(b)
  await Promise.all([f.provider.publish(f.ref(a.revision), a, f.lease), f.provider.publish(f.ref(b.revision), b, f.lease)])
  expect(await f.provider.manifest(f.ref(a.revision))).toEqual(a)
})

it('an interrupted stage cannot expose a revision or damage a prior publication', async () => {
  const f = await fixture()
  await f.file('a')
  const old = await f.provider.stage('tenant', f.source)
  await f.provider.publish(f.ref(old.revision), old, f.lease)
  await f.file('a', 'new')
  await mkdir(join(f.root, 'outside'))
  await symlink(join(f.root, 'outside'), join(f.source, 'z-link'), 'junction')
  await expect(f.provider.stage('tenant', f.source)).rejects.toThrow(/link/)
  expect(await f.provider.read(f.ref(old.revision), 'a')).toEqual(new TextEncoder().encode('old'))
  const ns = namespaceDirectory(f.root)
  expect(await readdir(join(ns, 'revisions'))).toEqual([old.revision.slice(7)])
  expect((await readdir(join(ns, 'blobs'))).some((path) => path.startsWith('.tmp-'))).toBe(false)
})

it('refuses a lease that expires during publication preparation', async () => {
  const f = await fixture()
  await f.file('a')
  const staged = await f.provider.stage('tenant', f.source)
  let checks = 0
  f.store.valid = async () => ++checks === 1
  await expect(f.provider.publish(f.ref(staged.revision), staged, f.lease)).rejects.toThrow(/lease/)
  await expect(f.provider.manifest(f.ref(staged.revision))).rejects.toThrow()
})

it('process termination during staging exposes no new revision and preserves old published bytes', async () => {
  const f = await fixture()
  await f.file('a')
  const old = await f.provider.stage('tenant', f.source)
  await f.provider.publish(f.ref(old.revision), old, f.lease)
  await writeFile(join(f.source, 'large'), Buffer.alloc(64 * 1024 * 1024, 0x61))
  const child = spawn(process.execPath, ['--conditions=brambo-source', '--input-type=module', '--eval', `
    import { createLocalArtifactProvider } from ${JSON.stringify(new URL('../src/provider.ts', import.meta.url).href)};
    const artifacts = createLocalArtifactProvider({ rootDir: process.argv[1], store: { valid: async () => true } });
    await artifacts.stage('tenant', process.argv[2]);
  `, join(f.root, 'artifacts'), f.source], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += String(chunk) })
  const exit = once(child, 'exit')
  const blobs = join(namespaceDirectory(f.root), 'blobs')
  let interrupted = false
  try {
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline && child.exitCode === null) {
      if ((await readdir(blobs)).some((path) => path.startsWith('.tmp-'))) {
        interrupted = child.kill('SIGKILL')
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    if (!interrupted) throw new Error('could not observe staging before process exit: ' + stderr)
    await exit
    expect(await readdir(join(namespaceDirectory(f.root), 'revisions'))).toEqual([old.revision.slice(7)])
    expect(await f.provider.read(f.ref(old.revision), 'a')).toEqual(new TextEncoder().encode('old'))
    // Orphan temporary data is never a revision. Reclamation stays disabled.
    expect(await f.provider.manifest(f.ref(old.revision))).toEqual(old)
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await exit
  }
})
