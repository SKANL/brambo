import { mkdir, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { fixture, namespaceDirectory } from './helpers.ts'

it.each(['../secret', '/secret', 'C:/secret', 'a\\b', './a', 'con.txt', 'a/../b', 'a.', 'a//b'])('rejects unsafe read path %s', async (path) => {
  const f = await fixture()
  await expect(f.provider.read(f.ref('sha256:' + '0'.repeat(64)), path)).rejects.toThrow(/path/)
})

it('rejects case collisions in staged paths', async () => {
  const f = await fixture()
  await f.file('A.txt')
  // Case-distinct directories cannot coexist on Windows. Manifest publication
  // must reject them on every OS, regardless of the source filesystem.
  const staged = await f.provider.stage('tenant', f.source)
  const duplicate = { ...staged, entries: [...staged.entries, { ...staged.entries[0]!, path: 'a.txt' }] }
  await expect(f.provider.publish(f.ref(staged.revision), duplicate, f.lease)).rejects.toThrow(/collision|revision/)
})

it('rejects source symlinks, source-root links and provider-root links', async () => {
  const f = await fixture()
  await mkdir(join(f.root, 'outside'))
  await symlink(join(f.root, 'outside'), join(f.source, 'link'), 'junction')
  await expect(f.provider.stage('tenant', f.source)).rejects.toThrow(/symlink|link/)
  await expect(f.provider.stage('tenant', join(f.source, 'link'))).rejects.toThrow(/symlink|link/)
  await rm(join(f.root, 'artifacts'), { recursive: true, force: true })
  await symlink(join(f.root, 'outside'), join(f.root, 'artifacts'), 'junction')
  await expect(f.provider.stage('tenant', f.source)).rejects.toThrow(/symlink|link/)
})

it.each([
  [{ maxFiles: 0 }, /budget/],
  [{ maxFileBytes: 2 }, /budget/],
  [{ maxTotalBytes: 2 }, /budget/],
] as const)('enforces staging budgets %j', async (limits, error) => {
  const f = await fixture(limits)
  await f.file('a.txt')
  await expect(f.provider.stage('tenant', f.source)).rejects.toThrow(error)
})

it('enforces aggregate bytes across files, permits exact bounds and empty artifacts', async () => {
  const f = await fixture({ maxFiles: 2, maxFileBytes: 3, maxTotalBytes: 5 })
  await f.file('a', 'abc')
  await f.file('b', 'def')
  await expect(f.provider.stage('tenant', f.source)).rejects.toThrow(/budget/)
  await f.file('b', 'de')
  expect((await f.provider.stage('tenant', f.source)).entries).toHaveLength(2)
  const empty = await fixture({ maxFiles: 0, maxFileBytes: 0, maxTotalBytes: 0 })
  expect((await empty.provider.stage('tenant', empty.source)).entries).toEqual([])
})

it.each([-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid limit %s', async (limit) => {
  await expect(fixture({ maxFiles: limit })).rejects.toThrow(/limit/)
})

it('validates identifiers before filesystem lookup and isolates namespace/workspace associations', async () => {
  const f = await fixture()
  await f.file('a.txt')
  const staged = await f.provider.stage('tenant', f.source)
  await f.provider.publish(f.ref(staged.revision), staged, f.lease)
  await expect(f.provider.manifest({ ...f.ref(staged.revision), namespace: 'other' })).rejects.toThrow()
  await expect(f.provider.manifest({ ...f.ref(staged.revision), workspaceId: 'other' })).rejects.toThrow()
  for (const revision of ['../../secret', 'sha256:' + 'A'.repeat(64), 'sha256:123']) {
    await expect(f.provider.manifest(f.ref(revision))).rejects.toThrow(/identifier|revision|digest/)
  }
  await expect(f.provider.stage('../other', f.source)).rejects.toThrow(/identifier/)
})

it('does not alias case-distinct namespace or workspace identifiers on a case-insensitive filesystem', async () => {
  const f = await fixture()
  await f.file('a')
  const staged = await f.provider.stage('tenant', f.source)
  await f.provider.publish(f.ref(staged.revision), staged, f.lease)
  await expect(f.provider.manifest({ ...f.ref(staged.revision), namespace: 'Tenant' })).rejects.toThrow()
  await expect(f.provider.manifest({ ...f.ref(staged.revision), workspaceId: 'WS' })).rejects.toThrow()
  const separate = await f.provider.stage('Tenant', f.source)
  await f.provider.publish({ namespace: 'Tenant', workspaceId: 'WS', revision: separate.revision }, separate, { ...f.lease, namespace: 'Tenant', epochs: { 'workspace:WS': 1 } })
  expect(await f.provider.manifest(f.ref(staged.revision))).toEqual(staged)
})

it('rejects directory-prefix and Unicode-normalization collisions in manifests', async () => {
  const f = await fixture()
  await f.file('a')
  const staged = await f.provider.stage('tenant', f.source)
  for (const paths of [['A/y', 'a/x'], ['a', 'a/x'], ['cafe\u0301', 'caf\u00e9']]) {
    const entries = paths.map((path) => ({ ...staged.entries[0]!, path }))
    const revision = 'sha256:' + createHash('sha256').update(JSON.stringify({ entries })).digest('hex')
    await expect(f.provider.publish(f.ref(revision), { revision, entries }, f.lease)).rejects.toThrow(/collision/)
  }
})

it('rejects symlinked blob storage and destination ancestors without following them', async () => {
  const f = await fixture()
  await f.file('a')
  const staged = await f.provider.stage('tenant', f.source)
  await f.provider.publish(f.ref(staged.revision), staged, f.lease)
  const destParent = join(f.root, 'dest-link')
  await symlink(f.source, destParent, 'junction')
  await expect(f.provider.materialize(f.ref(staged.revision), join(destParent, 'copy'))).rejects.toThrow(/link/)
  const ns = namespaceDirectory(f.root)
  const blobs = join(ns, 'blobs')
  await rename(blobs, join(ns, 'held-blobs'))
  await symlink(join(ns, 'held-blobs'), blobs, 'junction')
  await expect(f.provider.read(f.ref(staged.revision), 'a')).rejects.toThrow(/link/)
})

it('detects corrupted blobs and manifests instead of returning or materializing them', async () => {
  const f = await fixture()
  await f.file('a.txt')
  const staged = await f.provider.stage('tenant', f.source)
  await f.provider.publish(f.ref(staged.revision), staged, f.lease)
  const namespace = namespaceDirectory(f.root)
  const blob = join(namespace, 'blobs', staged.entries[0]!.digest.slice(7), 'data')
  await writeFile(blob, 'bad')
  await expect(f.provider.read(f.ref(staged.revision), 'a.txt')).rejects.toThrow(/digest|integrity/)
  await expect(f.provider.materialize(f.ref(staged.revision), join(f.root, 'bad-copy'))).rejects.toThrow(/digest|integrity/)
  await expect(readFile(join(f.root, 'bad-copy', 'a.txt'))).rejects.toThrow()
  const manifest = join(namespace, 'revisions', staged.revision.slice(7), 'data')
  const json = JSON.parse(await readFile(manifest, 'utf8'))
  json.entries[0].size = 7
  await writeFile(manifest, JSON.stringify(json))
  await expect(f.provider.manifest(f.ref(staged.revision))).rejects.toThrow(/revision|integrity/)
  expect(await readdir(namespace)).not.toContain('bad-copy')
})

it('bounds metadata reads before parsing oversized JSON independently of payload budgets', async () => {
  const f = await fixture()
  await f.file('a')
  const staged = await f.provider.stage('tenant', f.source)
  await f.provider.publish(f.ref(staged.revision), staged, f.lease)
  const metadata = join(namespaceDirectory(f.root), 'revisions', staged.revision.slice(7), 'data')
  const padded = Buffer.alloc(64 * 1024 * 1024 + 1, 0x20)
  Buffer.from(JSON.stringify(staged)).copy(padded)
  await writeFile(metadata, padded)
  await expect(f.provider.manifest(f.ref(staged.revision))).rejects.toThrow(/metadata budget/)
})
