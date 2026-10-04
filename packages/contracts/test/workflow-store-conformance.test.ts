import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { runWorkflowStoreContractSuite } from '../src/contract-suite/index.ts'
import { nonSqliteHarness } from './helpers/non-sqlite-run-store.ts'
import type { Lease } from '../src/index.ts'

it('proves complete backend-neutral RunStore persistence and lease conformance', async () => {
  const report = await runWorkflowStoreContractSuite(nonSqliteHarness())
  expect(report.passed).toBe(true)
  expect(report.outcomes.filter((outcome) => outcome.passed).map((outcome) => outcome.clause)).toEqual([
    'workflow-admission', 'workflow-reopen', 'workflow-scoped-reads',
    'workflow-atomic-commit-and-fencing', 'workflow-lease-lifecycle',
  ])
  expect(report.violations).toEqual([])
})

it('derives the canonical run/workspace resource pair', async () => {
  const contracts = await import('../src/index.ts')
  expect(contracts.leaseResources({ namespace: 'tenant', runId: 'run-1' }, 'workspace-1'))
    .toEqual(['run:run-1', 'workspace:workspace-1'])
})

it('keeps the alternative harness test-only and independent of SQL/schema imports', () => {
  const source = readFileSync(new URL('./helpers/non-sqlite-run-store.ts', import.meta.url), 'utf8')
  expect(source).not.toMatch(/from\s+['"][^'"]*(?:sqlite|schema)|import\(['"][^'"]*(?:sqlite|schema)/)
  expect(source).toContain('local-process')
})

it('retains serialized state without aliasing caller-owned objects and rejects actor spoofing', async () => {
  const harness = nonSqliteHarness()
  const store = await harness.open()
  const snapshot = { schemaVersion: 1 as const, key: { namespace: 'tenant', runId: 'run' }, revision: 0,
    workflowId: 'workflow', workflowVersion: '1', sessionId: 'session', status: 'pending' as const,
    workspace: { namespace: 'tenant', workspaceId: 'workspace', revision: '1' }, tasks: [], context: { value: 1 }, cancelRequested: false }
  const command = { key: snapshot.key, clientId: 'client', idempotencyKey: 'key', kind: 'start' as const, payload: { value: 1 } }
  const actor = { namespace: 'tenant', subject: 'trusted' }
  await store.create(snapshot, command, actor)
  snapshot.context.value = 2
  command.payload.value = 2
  await store.close()
  const reopened = await harness.reopen()
  try {
    expect((await reopened.get(snapshot.key))?.context).toEqual({ value: 1 })
    expect((await reopened.admit({ ...command, payload: { value: 1 } }, actor)).status).toBe('duplicate')
    expect((await reopened.admit({ ...command, payload: { value: 1 } }, { ...actor, subject: 'spoofed' })).status).toBe('conflict')
    await expect(reopened.admit({ ...command, actor } as typeof command, actor)).rejects.toThrow()
    await expect(store.get(snapshot.key)).rejects.toThrow('closed')
  } finally { await reopened.close() }
})

it.each([false, true])('non-SQLite commit authenticates exact claim membership after takeover=%s', async (takeover) => {
  const harness = nonSqliteHarness()
  const store = await harness.open()
  const snapshot = { schemaVersion: 1 as const, key: { namespace: 'tenant', runId: 'run' }, revision: 0,
    workflowId: 'workflow', workflowVersion: '1', sessionId: 'session', status: 'pending' as const,
    workspace: { namespace: 'tenant', workspaceId: 'workspace', revision: '1' }, tasks: [], context: null, cancelRequested: false }
  const command = { key: snapshot.key, clientId: 'client', idempotencyKey: 'key', kind: 'start' as const, payload: null }
  const lease: Lease = { namespace: 'tenant', ownerId: 'worker', token: 'secret', expiresAt: 2000,
    epochs: { 'run:run': 1, 'workspace:workspace': 1, 'task:run:extra': 1 } }
  await store.create(snapshot, command, { namespace: 'tenant', subject: 'user' })
  harness.seedLease(lease)
  if (takeover) harness.seedLease({ ...lease, ownerId: 'other', token: 'replacement', epochs: { 'task:run:extra': 2 } })
  await store.close()
  const reopened = await harness.reopen()
  try {
    const truncated = { ...lease, epochs: { 'run:run': 1, 'workspace:workspace': 1 } }
    expect((await reopened.commit({ snapshot: { ...snapshot, revision: 1 }, expectedRevision: 0,
      lease: truncated, events: [{ type: 'must-not-write', payload: null }] })).status).toBe('stale-lease')
    expect(await reopened.get(snapshot.key)).toEqual(snapshot)
    expect((await reopened.events(snapshot.key, 0, 10)).events).toEqual([])
    if (!takeover) expect((await reopened.commit({ snapshot: { ...snapshot, revision: 1 }, expectedRevision: 0,
      lease, events: [] })).status).toBe('committed')
  } finally { await reopened.close() }
})
