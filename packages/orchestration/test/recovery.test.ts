import { expect, test, vi } from 'vitest'
import * as exports from '../src/index.ts'
import type { runDurableWorkflow } from '../src/durable-engine.ts'
import { workflowFixture } from './helpers/workflow-fixture.ts'
const run = (exports as unknown as { runDurableWorkflow: typeof runDurableWorkflow }).runDurableWorkflow

test('direct engine takeover recovers admitted cancellation before its snapshot flag was persisted', async () => {
  const f = await workflowFixture()
  try {
    const original = await f.store.admit({ key: f.key, clientId: 'durable-engine',
      idempotencyKey: 'cancel:tenant:run', kind: 'cancel', payload: null }, f.principal)
    if (original.status !== 'accepted') throw new Error('fixture')
    await f.store.release(f.lease)
    const principal = { namespace: 'tenant', subject: 'worker-b' }
    const claim = await f.store.claim('tenant', Object.keys(f.lease.epochs), principal.subject, 60_000)
    if (claim.status !== 'acquired') throw new Error('fixture')
    const admit = vi.spyOn(f.store, 'admit'), executeTask = vi.fn()
    const result = await run({ ...f.options, principal, lease: claim.lease, signal: AbortSignal.abort(), executeTask })
    expect(result.status).toBe('cancelled')
    expect(await f.store.receipt('tenant', original.receipt.id)).toEqual({ ...original.receipt, phase: 'completed', outcome: { status: 'cancelled' } })
    expect(admit).not.toHaveBeenCalled()
    expect(executeTask).not.toHaveBeenCalled()
  } finally { await f.close() }
})

test.each(['missing', 'wrong-kind'])('recorded cancellation with %s receipt fails closed without readmission or child work', async fault => {
  const f = await workflowFixture()
  try {
    const start = (await f.store.pending('tenant', 256))[0]!
    const committed = await f.store.commit({ expectedRevision: 0, lease: f.lease,
      snapshot: { ...f.snapshot, revision: 1, cancelRequested: true },
      events: [{ type: 'run.cancel.requested', payload: { receiptId: fault === 'missing' ? 'missing-receipt' : start.id } }] })
    expect(committed.status).toBe('committed')
    const admit = vi.spyOn(f.store, 'admit'), prepareTask = vi.fn(f.options.prepareTask)
    const executeTask = vi.fn(), publish = vi.spyOn(f.artifacts, 'publish')
    await expect(run({ ...f.options, prepareTask, executeTask })).rejects.toThrow(
      fault === 'missing' ? 'Cancel receipt provenance unavailable' : 'Cancel receipt scope mismatch')
    expect(admit).not.toHaveBeenCalled()
    expect(prepareTask).not.toHaveBeenCalled()
    expect(executeTask).not.toHaveBeenCalled()
    expect(publish).not.toHaveBeenCalled()
    expect((await f.store.get(f.key))?.status).not.toBe('cancelled')
    expect((await f.store.receipt('tenant', start.id))?.actor).toEqual(start.actor)
  } finally { await f.close() }
})

test('earlier safe effects never authorize replay of an evidence-free later attempt', async () => {
  const f = await workflowFixture()
  f.definition.tasks.splice(1)
  f.definition.tasks[0]!.maxAttempts = 3
  const attempts: number[] = []
  try {
    const result = await run({ ...f.options, executeTask: async (context) => {
      attempts.push(context.attempt)
      if (context.attempt === 1) {
        await context.journal.begin({ id: 'read', toolId: 'read', arguments: {} }, 'read-only')
        await context.journal.finish('read', null)
      }
      throw new Error('interrupted')
    } })
    expect(result.status).toBe('blocked')
    expect(result.tasks[0]?.attempt).toBe(2)
    expect(attempts).toEqual([1, 2])
    const reopened = await f.reopen()
    try {
      const recovered = await run({ ...f.options, store: reopened, executeTask: async () => { throw new Error('evidence-free attempt replayed') } })
      expect(recovered.tasks[0]?.attempt).toBe(2)
      expect(recovered.status).toBe('blocked')
    } finally { await reopened.close() }
  } finally { await f.close() }
})

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

test('direct recovery consumes detached frozen stored configuration rather than task defaults', async () => {
  const f = await workflowFixture()
  const configuration = { version: 1 as const, providerId: 'acme', model: 'model', configuration: { deliberation: 'deep' },
    extensions: [], support: [{ id: 'acme:deliberation', status: 'supported' as const, version: 'support-1' }] }
  try {
    const current = (await f.store.get(f.key))!
    const seeded = await f.store.commit({ expectedRevision: current.revision, lease: f.lease, snapshot: { ...current, revision: current.revision + 1,
      tasks: f.definition.tasks.map(task => ({ taskId: task.id, phase: 'pending', attempt: 0 })),
      executionConfigurations: f.definition.tasks.map(task => ({ taskId: task.id, driverId: 'driver', driverVersion: '1', configuration })) }, events: [] })
    if (seeded.status !== 'committed') throw new Error('fixture')
    const definition = { ...f.definition, tasks: f.definition.tasks.map(task => ({ ...task, execution: { configuration: { deliberation: 'mutated-default' } } })) }
    const observed: unknown[] = [], frozen: boolean[] = []
    const result = await run({ ...f.options, definition, executeTask: async context => {
      observed.push(context.executionConfiguration)
      frozen.push(Object.isFrozen(context.executionConfiguration?.configuration))
      return f.outcome(context.workspace, context.lease)
    } })
    expect(result.status).toBe('succeeded')
    expect(observed).toEqual([configuration, configuration])
    expect(frozen).toEqual([true, true])
    expect(result.executionConfigurations?.every(entry => entry.configuration.configuration['deliberation'] === 'deep')).toBe(true)
  } finally { await f.close() }
})
