import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { openSqliteRunStore } from '../src/index.ts'

it('retains atomic admission and state through reopen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workflow-reopen-'))
  const path = join(dir, 'db.sqlite')
  const snapshot = { schemaVersion: 1 as const, key: { namespace: 'tenant', runId: 'run' }, revision: 0,
    workflowId: 'workflow', workflowVersion: '1', sessionId: 'session', status: 'pending' as const,
    workspace: { namespace: 'tenant', workspaceId: 'workspace', revision: 'v1' }, tasks: [], context: null, cancelRequested: false }
  const command = { key: snapshot.key, clientId: 'client', idempotencyKey: 'key', kind: 'start' as const, payload: null }
  const actor = { namespace: 'tenant', subject: 'user' }
  try {
    const store = await openSqliteRunStore({ path })
    const receipt = await store.create(snapshot, command, actor)
    await store.close()
    const reopened = await openSqliteRunStore({ path })
    try {
      expect(await reopened.get(snapshot.key)).toEqual(snapshot)
      expect(await reopened.admit(command, actor)).toEqual({ ...receipt, status: 'duplicate' })
      expect((await reopened.admit({ ...command, payload: 'changed' }, actor)).status).toBe('conflict')
    } finally { await reopened.close() }
  } finally { await rm(dir, { recursive: true, force: true }) }
})

it('rejects unknown metadata versions without modifying the database', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workflow-version-'))
  const path = join(dir, 'db.sqlite')
  try {
    const store = await openSqliteRunStore({ path })
    await store.close()
    const db = new DatabaseSync(path)
    db.exec('UPDATE metadata SET version = 99')
    db.close()
    await expect(openSqliteRunStore({ path })).rejects.toMatchObject({ code: 'BRAMBO_WORKFLOW_SCHEMA_UNSUPPORTED' })
    const check = new DatabaseSync(path)
    expect(check.prepare('SELECT version FROM metadata').get()).toMatchObject({ version: 99 })
    check.close()
  } finally { await rm(dir, { recursive: true, force: true }) }
})

it('imports without SQLite support and reports typed unavailable only on open', () => {
  const url = new URL('../src/index.ts', import.meta.url).href
  const child = spawnSync(process.execPath, ['--conditions=brambo-source', '--input-type=module', '-e', `
    Object.defineProperty(process.versions, 'node', { value: '20.0.0' });
    const { openSqliteRunStore } = await import(${JSON.stringify(url)});
    console.log('imported');
    try { await openSqliteRunStore({ path: ':memory:' }); process.exitCode = 1; }
    catch (error) { console.log(error.code); }
  `], { encoding: 'utf8' })
  expect(child.status, child.stderr).toBe(0)
  expect(child.stdout.trim().split(/\r?\n/)).toEqual(['imported', 'BRAMBO_WORKFLOW_STORE_UNAVAILABLE'])
  expect(child.stderr).not.toContain('SQLite')
})
