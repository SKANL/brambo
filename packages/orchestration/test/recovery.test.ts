import { expect, test } from 'vitest'
import * as exports from '../src/index.ts'
import type { runDurableWorkflow } from '../src/durable-engine.ts'
import { workflowFixture } from './helpers/workflow-fixture.ts'
const run = (exports as unknown as { runDurableWorkflow: typeof runDurableWorkflow }).runDurableWorkflow

test('reopened succeeded workflow never repeats completed tasks', async () => {
  expect(run).toBeTypeOf('function')
  const f = await workflowFixture()
  try {
    await run({ ...f.options, executeTask: async (context) => f.outcome(context.workspace, context.lease) })
    const reopened = await f.reopen()
    try {
      const recovered = await run({ ...f.options, store: reopened, executeTask: async () => { throw new Error('completed task repeated') } })
      expect(recovered.status).toBe('succeeded')
      expect(await f.artifacts.manifest(recovered.workspace)).toMatchObject({ revision: recovered.workspace.revision })
    } finally { await reopened.close() }
  } finally { await f.close() }
})

test('unresolved non-idempotent effects block recovery even when attempt budget remains', async () => {
  expect(run).toBeTypeOf('function')
  const f = await workflowFixture()
  f.definition.tasks.splice(1)
  try {
    let executions = 0
    const first = await run({ ...f.options, concurrency: 1, executeTask: async (context) => {
      executions++
      await context.journal.begin({ id: 'charge', toolId: 'payments', arguments: { amount: 10 } }, 'non-idempotent')
      throw new Error('connection lost after charge')
    } })
    expect(first.status).toBe('blocked')
    expect(first.tasks[0]?.error?.code).toBe('uncertain-attempt-recovery')
    expect(executions).toBe(1)
    const reopened = await f.reopen()
    try {
      const recovered = await run({ ...f.options, store: reopened, executeTask: async () => { throw new Error('uncertain tool repeated') } })
      expect(recovered.status).toBe('blocked')
    } finally { await reopened.close() }
  } finally { await f.close() }
})

test('crash after attempt admission blocks reopening when no effect evidence proves replay safe', async () => {
  const f = await workflowFixture()
  f.definition.tasks.splice(1)
  try {
    const committed = await f.store.commit({ lease: f.lease, expectedRevision: 0, snapshot: { ...f.snapshot, revision: 1, status: 'running',
      tasks: [{ taskId: 'a', phase: 'running', attempt: 1, workspace: { namespace: 'tenant', workspaceId: 'a-1', revision: 'base' } }] },
      events: [{ type: 'task.attempt.started', payload: { taskId: 'a', attempt: 1 } }],
    })
    expect(committed.status).toBe('committed')
    const reopened = await f.reopen()
    try {
      const recovered = await run({ ...f.options, store: reopened, executeTask: async () => { throw new Error('uncertain attempt repeated') } })
      expect(recovered.status).toBe('blocked')
      expect(recovered.tasks[0]?.attempt).toBe(1)
      expect(recovered.tasks[0]?.error?.code).toBe('uncertain-attempt-recovery')
    } finally { await reopened.close() }
  } finally { await f.close() }
})

test('definition changes with the same version cannot reinterpret persisted progress', async () => {
  const f = await workflowFixture()
  try {
    await run({ ...f.options, executeTask: async (context) => f.outcome(context.workspace, context.lease) })
    f.definition.tasks[0]!.prompt = 'different instructions'
    await expect(run({ ...f.options, executeTask: async () => { throw new Error('incompatible task') } })).rejects.toThrow(/compatib/)
  } finally { await f.close() }
})

test('effect payload conflicts stop execution instead of reusing another call result', async () => {
  const f = await workflowFixture()
  f.definition.tasks.splice(1)
  try {
    await expect(run({ ...f.options, executeTask: async (context) => {
      await context.journal.begin({ id: 'call', toolId: 'tool', arguments: { value: 1 } }, 'read-only')
      await context.journal.finish('call', null)
      await context.journal.begin({ id: 'call', toolId: 'tool', arguments: { value: 2 } }, 'read-only')
      return f.outcome(context.workspace, context.lease)
    } })).rejects.toThrow('Effect identity conflict')
  } finally { await f.close() }
})

test('maxAttempts bounds retries with safe durable effect evidence', async () => {
  const f = await workflowFixture()
  f.definition.tasks.splice(1)
  try {
    const result = await run({ ...f.options, executeTask: async (context) => {
      const call = { id: 'read', toolId: 'read', arguments: {} }
      if (await context.journal.begin(call, 'read-only') === 'new') await context.journal.finish(call.id, null)
      throw new Error('failed')
    } })
    expect(result.status).toBe('failed')
    expect(result.tasks[0]?.attempt).toBe(2)
  } finally { await f.close() }
})

test('completed effect evidence authorizes bounded retry and replays journal result without executing effect again', async () => {
  expect(run).toBeTypeOf('function')
  const f = await workflowFixture()
  f.definition.tasks.splice(1)
  try {
    let effects = 0
    const result = await run({ ...f.options, executeTask: async (context) => {
      const call = { id: 'charge', toolId: 'payments', arguments: { amount: 10 } }
      if (await context.journal.begin(call, 'non-idempotent') === 'new') {
        effects++; await context.journal.finish(call.id, { paid: true })
      }
      if (context.attempt === 1) throw new Error('failure after durable result')
      expect(await context.journal.result(call.id)).toEqual({ paid: true })
      return f.outcome(context.workspace, context.lease)
    } })
    expect(result.status).toBe('succeeded')
    expect(result.tasks[0]?.attempt).toBe(2)
    expect(effects).toBe(1)
  } finally { await f.close() }
})
