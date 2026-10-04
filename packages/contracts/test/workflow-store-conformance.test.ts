import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { runWorkflowStoreContractSuite } from '../src/contract-suite/index.ts'
import { nonSqliteHarness } from './helpers/non-sqlite-run-store.ts'

it('proves backend-neutral persistence and explicitly reports unfinished lease conformance', async () => {
  const report = await runWorkflowStoreContractSuite(nonSqliteHarness())
  expect(report.passed).toBe(false)
  expect(report.outcomes.filter((outcome) => outcome.passed).map((outcome) => outcome.clause)).toEqual([
    'workflow-admission', 'workflow-reopen', 'workflow-scoped-reads',
  ])
  expect(report.violations.map((violation) => violation.clause)).toEqual(['workflow-atomic-commit-and-fencing'])
  expect(report.violations[0]?.detail).toContain('lease operations are not implemented')
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
