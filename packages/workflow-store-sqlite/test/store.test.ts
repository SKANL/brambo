import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Command, Lease, RunSnapshot, RunStore } from '@brambodev/contracts'
import { runWorkflowStoreContractSuite } from '@brambodev/contracts'
import { openSqliteRunStore } from '../src/index.ts'
import { seedLease } from './helpers/seed-lease.ts'

export const snapshot: RunSnapshot = {
  schemaVersion: 1, key: { namespace: 'tenant', runId: 'run' }, revision: 0,
  workflowId: 'workflow', workflowVersion: '1', sessionId: 'session', status: 'pending',
  workspace: { namespace: 'tenant', workspaceId: 'workspace', revision: 'v1' },
  tasks: [], context: null, cancelRequested: false,
}
export const command: Command = {
  key: snapshot.key, clientId: 'client', idempotencyKey: 'request', kind: 'start', payload: { b: 2, a: 1 },
}
export const actor = { namespace: 'tenant', subject: 'trusted-user' }
const lease: Lease = {
  namespace: 'tenant', ownerId: 'worker', token: 'transient-secret', expiresAt: 2000,
  epochs: { 'run:run': 1, 'workspace:workspace': 1 },
}

describe('atomic workflow persistence', () => {
  let dir: string
  let path: string
  let now = 1000
  let store: RunStore
  const connections: RunStore[] = []
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'workflow-store-'))
    path = join(dir, 'store.sqlite')
    now = 1000
    store = await openSqliteRunStore({ path, now: () => now })
    connections.push(store)
  })
  afterEach(async () => {
    await Promise.all(connections.splice(0).map((connection) => connection.close()))
    if (dir) await rm(dir, { recursive: true, force: true })
  })
  it('creates state and admission together and deduplicates canonical payloads', async () => {
    const first = await store.create(snapshot, command, actor)
    expect(first.status).toBe('accepted')
    const duplicate = await store.admit({ ...command, payload: { a: 1, b: 2 } }, actor)
    expect(duplicate).toEqual({ ...first, status: 'duplicate' })
    expect(await store.get(snapshot.key)).toEqual(snapshot)
    if (first.status === 'conflict') throw new Error('missing receipt')
    expect(await store.receipt('tenant', first.receipt.id)).toEqual(first.receipt)
    expect(await store.receipt('other', first.receipt.id)).toBeUndefined()
    expect(await store.pending('other', 10)).toEqual([])
    expect(await store.pending('tenant', 1)).toEqual([first.receipt])
  })
  it('rejects changed kind, payload, run and actor under the same namespace/client/key', async () => {
    await store.create(snapshot, command, actor)
    for (const change of [
      { kind: 'cancel' as const }, { payload: 'changed' }, { key: { ...command.key, runId: 'other' } },
    ]) expect((await store.admit({ ...command, ...change }, actor)).status).toBe('conflict')
    expect((await store.admit(command, { ...actor, subject: 'other-user' })).status).toBe('conflict')
    const other = { ...snapshot, key: { ...snapshot.key, namespace: 'other' }, workspace: { ...snapshot.workspace, namespace: 'other' } }
    expect((await store.create(other, { ...command, key: other.key }, { ...actor, namespace: 'other' })).status).toBe('accepted')
  })
  it('does not create a second run on a conflicting command or admit into a missing run', async () => {
    await store.create(snapshot, command, actor)
    const other = { ...snapshot, key: { ...snapshot.key, runId: 'other' } }
    expect((await store.create(other, { ...command, key: other.key }, actor)).status).toBe('conflict')
    expect(await store.get(other.key)).toBeUndefined()
    expect((await store.admit({ ...command, key: other.key, idempotencyKey: 'fresh' }, actor)).status).toBe('conflict')
  })
  it('rejects invalid envelopes and caller-asserted identity before writes', async () => {
    await expect(store.create(snapshot, { ...command, actor } as Command, actor)).rejects.toThrow()
    await expect(store.create(snapshot, command, { ...actor, namespace: 'other' })).rejects.toThrow()
    await expect(store.create({ ...snapshot, revision: 1 }, command, actor)).rejects.toThrow()
    expect(await store.get(snapshot.key)).toBeUndefined()
  })
  it('serializes two connections racing expectedRevision and orders scoped pages', async () => {
    const admitted = await store.create(snapshot, command, actor)
    if (admitted.status === 'conflict') throw new Error('missing receipt')
    seedLease(path, lease)
    const second = await openSqliteRunStore({ path, now: () => now })
    connections.push(second)
    const input = { snapshot: { ...snapshot, revision: 1, status: 'running' as const }, expectedRevision: 0, lease,
      events: [{ type: 'started', payload: null }, { type: 'progress', payload: 1 }],
      receipt: { ...admitted.receipt, phase: 'completed' as const, outcome: 'done' } }
    const results = await Promise.all([store.commit(input), second.commit(input)])
    expect(results.map((r) => r.status).sort()).toEqual(['committed', 'conflict'])
    const firstPage = await store.events(snapshot.key, 0, 1)
    expect(firstPage).toMatchObject({ status: 'ok', latestCursor: 2, nextCursor: 1 })
    expect(firstPage.events.map((event) => event.cursor)).toEqual([1])
    expect((await second.events(snapshot.key, firstPage.nextCursor, 10)).events.map((event) => event.cursor)).toEqual([2])
    expect(await store.events({ ...snapshot.key, namespace: 'other' }, 0, 10)).toMatchObject({ status: 'empty', events: [] })
    expect(await store.pending('tenant', 10)).toEqual([])
  })
  it('rolls back snapshot, event and receipt if an event insert fails', async () => {
    const admitted = await store.create(snapshot, command, actor)
    if (admitted.status === 'conflict') throw new Error('missing receipt')
    seedLease(path, lease)
    const db = new DatabaseSync(path)
    db.exec("CREATE TRIGGER fail_event BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT, 'injected failure'); END")
    db.close()
    await expect(store.commit({ snapshot: { ...snapshot, revision: 1 }, expectedRevision: 0, lease,
      events: [{ type: 'event', payload: null }], receipt: { ...admitted.receipt, phase: 'completed' } })).rejects.toThrow()
    expect(await store.get(snapshot.key)).toEqual(snapshot)
    expect((await store.events(snapshot.key, 0, 10)).events).toEqual([])
    expect(await store.receipt('tenant', admitted.receipt.id)).toEqual(admitted.receipt)
  })
  it('rolls back creation if receipt admission fails and preserves ordered replay after reopen', async () => {
    const db = new DatabaseSync(path)
    db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT, 'injected failure'); END")
    await expect(store.create(snapshot, command, actor)).rejects.toThrow()
    expect(await store.get(snapshot.key)).toBeUndefined()
    expect(await store.pending('tenant', 10)).toEqual([])
    db.exec('DROP TRIGGER fail_receipt'); db.close()
    const admitted = await store.create(snapshot, command, actor)
    if (admitted.status === 'conflict') throw new Error('missing receipt')
    seedLease(path, lease)
    await store.commit({ snapshot: { ...snapshot, revision: 1 }, expectedRevision: 0, lease,
      events: [{ type: 'saved', payload: { durable: true } }], receipt: { ...admitted.receipt, phase: 'completed' } })
    await store.close()
    const reopened = await openSqliteRunStore({ path })
    connections.push(reopened)
    expect((await reopened.get(snapshot.key))?.revision).toBe(1)
    expect((await reopened.events(snapshot.key, 0, 10)).events).toMatchObject([{ cursor: 1, type: 'saved', payload: { durable: true } }])
    expect((await reopened.receipt('tenant', admitted.receipt.id))?.phase).toBe('completed')
    expect((await reopened.admit(command, actor)).status).toBe('duplicate')
  })
  it('rejects malformed pagination and closes idempotently', async () => {
    await expect(store.events(snapshot.key, -1, 10)).rejects.toThrow()
    await expect(store.events(snapshot.key, 0, 0)).rejects.toThrow()
    await expect(store.pending('tenant', 0)).rejects.toThrow()
    await store.close(); await store.close()
    await expect(store.get(snapshot.key)).rejects.toThrow('closed')
  })
  it('refuses corrupted persisted event envelopes instead of replaying unknown schemas', async () => {
    await store.create(snapshot, command, actor)
    seedLease(path, lease)
    await store.commit({ snapshot: { ...snapshot, revision: 1 }, expectedRevision: 0, lease,
      events: [{ type: 'event', payload: null }] })
    const db = new DatabaseSync(path)
    const event = { schemaVersion: 99, key: snapshot.key, cursor: 1, type: 'event', payload: null, occurredAt: new Date(now).toISOString() }
    db.prepare('UPDATE events SET event = ?').run(JSON.stringify(event))
    db.close()
    await expect(store.events(snapshot.key, 0, 10)).rejects.toMatchObject({ code: 'BRAMBO_WORKFLOW_STORE_INVALID' })
  })
  it('rejects stale token, owner, exact resources, epochs, namespace and expiration', async () => {
    await store.create(snapshot, command, actor)
    seedLease(path, lease)
    const changes: Partial<Lease>[] = [
      { token: 'wrong' }, { ownerId: 'other' }, { namespace: 'other' }, { expiresAt: 2001 },
      { epochs: { 'run:run': 1 } }, { epochs: { 'run:run': 2, 'workspace:workspace': 1 } },
      { epochs: { ...lease.epochs, 'workspace:unclaimed': 1 } },
    ]
    for (const change of changes) expect((await store.commit({ snapshot: { ...snapshot, revision: 1 }, expectedRevision: 0,
      lease: { ...lease, ...change }, events: [] })).status).toBe('stale-lease')
    now = lease.expiresAt
    expect((await store.commit({ snapshot: { ...snapshot, revision: 1 }, expectedRevision: 0, lease, events: [] })).status).toBe('stale-lease')
    const db = new DatabaseSync(path)
    expect(JSON.stringify(db.prepare('SELECT * FROM resource_epochs').all())).not.toContain(lease.token)
    db.close()
  })
  it('refuses receipt identity/actor substitution and unclaimed new workspace', async () => {
    const admitted = await store.create(snapshot, command, actor)
    if (admitted.status === 'conflict') throw new Error('missing receipt')
    seedLease(path, lease)
    await expect(store.commit({ snapshot: { ...snapshot, revision: 1 }, expectedRevision: 0, lease, events: [],
      receipt: { ...admitted.receipt, actor: { ...actor, subject: 'spoofed' } } })).rejects.toThrow()
    expect((await store.commit({ snapshot: { ...snapshot, revision: 1, workspace: { ...snapshot.workspace, workspaceId: 'new' } },
      expectedRevision: 0, lease, events: [] })).status).toBe('stale-lease')
    expect(await store.get(snapshot.key)).toEqual(snapshot)
  })
  it('reports bounded busy contention without partial state', async () => {
    const db = new DatabaseSync(path)
    db.exec('BEGIN IMMEDIATE')
    try { await expect(store.create(snapshot, command, actor)).rejects.toMatchObject({ code: 'BRAMBO_WORKFLOW_STORE_BUSY' }) }
    finally { db.exec('ROLLBACK'); db.close() }
    expect(await store.get(snapshot.key)).toBeUndefined()
  })
  it.each([false, true])('rejects omitted claim membership even after additional-resource takeover=%s', async (takeover) => {
    await store.create(snapshot, command, actor)
    const complete = { ...lease, epochs: { ...lease.epochs, 'task:run:extra': 1 } }
    seedLease(path, complete)
    if (takeover) seedLease(path, { ...lease, token: 'replacement', ownerId: 'other', epochs: { 'task:run:extra': 2 } })
    await store.close()
    store = await openSqliteRunStore({ path, now: () => now })
    connections.push(store)
    expect((await store.commit({ snapshot: { ...snapshot, revision: 1 }, expectedRevision: 0,
      lease, events: [{ type: 'must-not-write', payload: null }] })).status).toBe('stale-lease')
    expect(await store.get(snapshot.key)).toEqual(snapshot)
    expect((await store.events(snapshot.key, 0, 10)).events).toEqual([])
    if (!takeover) expect((await store.commit({ snapshot: { ...snapshot, revision: 1 }, expectedRevision: 0,
      lease: complete, events: [] })).status).toBe('committed')
  })
  it.each(['get', 'receipt', 'pending', 'events'] as const)('translates exclusive-lock %s contention and leaves connection usable', async (operation) => {
    const admitted = await store.create(snapshot, command, actor)
    if (admitted.status === 'conflict') throw new Error('missing receipt')
    const read = () => ({
      get: () => store.get(snapshot.key), receipt: () => store.receipt('tenant', admitted.receipt.id),
      pending: () => store.pending('tenant', 10), events: () => store.events(snapshot.key, 0, 10),
    })[operation]()
    const db = new DatabaseSync(path)
    db.exec('BEGIN EXCLUSIVE')
    try { await expect(read()).rejects.toMatchObject({ code: 'BRAMBO_WORKFLOW_STORE_BUSY' }) }
    finally { db.exec('ROLLBACK'); db.close() }
    await expect(read()).resolves.toBeDefined()
    expect(await store.get(snapshot.key)).toEqual(snapshot)
  })
  it('leaves public lease operations explicitly unavailable until Task 3', async () => {
    await expect(store.claim('tenant', ['run:run'], 'worker', 1000)).rejects.toMatchObject({ code: 'BRAMBO_WORKFLOW_LEASE_UNAVAILABLE' })
    await expect(store.renew(lease, 1000)).rejects.toThrow()
    await expect(store.release(lease)).rejects.toThrow()
    await expect(store.valid(lease)).rejects.toThrow()
  })
  it('passes the same neutral persistence clauses without claiming complete lease conformance', async () => {
    let sequence = 0
    let currentPath = path
    const connect = async (): Promise<RunStore> => {
      const connection = await openSqliteRunStore({ path: currentPath, now: () => now })
      connections.push(connection)
      return connection
    }
    const report = await runWorkflowStoreContractSuite({
      async open() { currentPath = join(dir, `conformance-${++sequence}.sqlite`); now = 1000; return connect() },
      reopen: connect,
      advance(milliseconds) { now += milliseconds },
    })
    expect(report.passed).toBe(false)
    expect(report.outcomes.filter((outcome) => outcome.passed).map((outcome) => outcome.clause)).toEqual([
      'workflow-admission', 'workflow-reopen', 'workflow-scoped-reads',
    ])
    expect(report.violations.map((violation) => violation.clause)).toEqual(['workflow-atomic-commit-and-fencing'])
  })
})
