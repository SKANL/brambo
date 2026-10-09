import { expect, test } from 'vitest'
import * as exports from '../src/index.ts'
import type { DurableWorkflowOptions, TaskExecutionContext } from '../src/durable-engine.ts'
import type { WorkflowDefinition } from '../src/workflow-registry.ts'
import { barrier, workflowFixture } from './helpers/workflow-fixture.ts'

const api = exports as unknown as {
  runDurableWorkflow: (options: DurableWorkflowOptions) => ReturnType<typeof import('../src/durable-engine.ts')['runDurableWorkflow']>
  createWorkflowRegistry: () => { register(definition: WorkflowDefinition): void; resolve(id: string, version: string): WorkflowDefinition }
}

test('abort during terminal CAS settles the late cancel receipt and returns stored terminal state', async () => {
  const f = await workflowFixture(), terminal = barrier(), finish = barrier()
  const store = { ...f.store, commit: async (input: Parameters<typeof f.store.commit>[0]) => {
    if (input.events[0]?.type === 'run.succeeded') { terminal.release(); await finish.promise }
    return f.store.commit(input)
  } }
  const running = api.runDurableWorkflow({ ...f.options, store, executeTask: async (context) => f.outcome(context.workspace, context.lease) })
  try {
    await terminal.promise; f.controller.abort(); finish.release()
    const result = await running
    expect(result).toEqual(await f.store.get(f.key))
    expect(result.status).toBe('succeeded')
    const page = await f.store.events(f.key, 0, 100)
    expect(page.events.at(-1)?.type).toBe('run.cancel.too-late')
    expect((await f.store.pending('tenant', 10)).some((receipt) => receipt.command.kind === 'cancel')).toBe(false)
  } finally { finish.release(); await running.catch(() => undefined); await f.close() }
})

test('parent renewal during external publication uses refreshed authority for checkpoint CAS', async () => {
  const f = await workflowFixture(), publishing = barrier(), finish = barrier()
  f.definition.tasks.splice(1)
  let parentLease = f.lease
  const artifacts = { ...f.artifacts, publish: async (...args: Parameters<typeof f.artifacts.publish>) => {
    expect(args[2].token).not.toBe(parentLease.token)
    publishing.release(); await finish.promise
    return f.artifacts.publish(...args)
  } }
  const running = api.runDurableWorkflow({ ...f.options, artifacts, currentParentLease: async () => parentLease,
    executeTask: async (context) => f.outcome(context.workspace, context.lease) })
  try {
    await publishing.promise
    const renewed = await f.store.renew(parentLease, 120_000)
    if (renewed.status !== 'acquired') throw new Error('parent renewal failed')
    parentLease = renewed.lease; finish.release()
    const result = await running
    expect(result.status).toBe('succeeded')
    expect(result.tasks[0]?.workspace?.revision).toBe('output')
    expect(await artifacts.manifest(result.tasks[0]!.workspace!)).toMatchObject({ revision: 'output' })
  } finally { finish.release(); await running.catch(() => undefined); await f.close() }
})

test('blocked artifact publication does not block competing task progress or durable cancellation', async () => {
  const f = await workflowFixture(), publishing = barrier(), finish = barrier(), bReturned = barrier()
  const artifacts = { ...f.artifacts, publish: async (...args: Parameters<typeof f.artifacts.publish>) => {
    if (args[0].workspaceId === 'a-1') { publishing.release(); await finish.promise }
    return f.artifacts.publish(...args)
  } }
  const running = api.runDurableWorkflow({ ...f.options, artifacts, executeTask: async (context) => {
    if (context.taskId === 'b') { await publishing.promise; bReturned.release() }
    return f.outcome(context.workspace, context.lease)
  } })
  try {
    await bReturned.promise
    await new Promise((resolve) => setImmediate(resolve))
    expect((await f.store.get(f.key))?.tasks[1]?.phase).toBe('succeeded')
    f.controller.abort()
    await new Promise((resolve) => setImmediate(resolve))
    expect((await f.store.get(f.key))?.cancelRequested).toBe(true)
    finish.release()
    const result = await running
    expect(result).toEqual(await f.store.get(f.key))
    expect(result.tasks[0]?.phase).not.toBe('succeeded')
    expect(result.tasks[1]?.phase).toBe('succeeded')
    expect(result.workspace).toEqual(f.snapshot.workspace)
  } finally { finish.release(); await running.catch(() => undefined); await f.close() }
})

test('registry rejects cycles, missing dependencies, duplicates and freezes registered definitions', () => {
  expect(api.createWorkflowRegistry).toBeTypeOf('function')
  const registry = api.createWorkflowRegistry()
  const task = { id: 'a', dependsOn: ['a'], driverId: 'driver', configuration: null, prompt: 'work', required: [], optional: [], maxAttempts: 1 }
  expect(() => registry.register({ id: 'workflow', version: '1', tasks: [task] })).toThrow(/cycle/)
  expect(() => registry.register({ id: 'workflow', version: '1', tasks: [{ ...task, dependsOn: ['missing'] }] })).toThrow(/dependency/)
  registry.register({ id: 'workflow', version: '1', tasks: [{ ...task, dependsOn: [] }] })
  expect(() => registry.register({ id: 'workflow', version: '1', tasks: [] })).toThrow(/registered/)
  expect(Object.isFrozen(registry.resolve('workflow', '1').tasks)).toBe(true)
})

test('failed parent transition waits for aborted children to hand back before releasing their scopes', async () => {
  const f = await workflowFixture(), entered = barrier(), finish = barrier(), aborted = barrier()
  let count = 0, settled = false
  try {
    const store = { ...f.store, commit: async (input: Parameters<typeof f.store.commit>[0]) => {
      if (input.events[0]?.type === 'task.succeeded') return { status: 'conflict' as const }
      return f.store.commit(input)
    } }
    const running = api.runDurableWorkflow({ ...f.options, store, executeTask: async (context) => {
      count++; if (count === 2) entered.release()
      await entered.promise
      if (context.taskId === 'b') {
        context.signal.addEventListener('abort', () => aborted.release())
        await finish.promise
      }
      return f.outcome(context.workspace, context.lease)
    } })
    const observed = running.then(() => { settled = true }, () => { settled = true })
    await aborted.promise
    await new Promise((resolve) => setImmediate(resolve))
    expect(settled).toBe(false)
    finish.release()
    await expect(running).rejects.toThrow('conflict')
    await observed
  } finally { finish.release(); await f.close() }
})

test('concurrent children carry isolated authority and serialize parent commits without lost progress', async () => {
  expect(api.runDurableWorkflow).toBeTypeOf('function')
  const f = await workflowFixture()
  const entered = barrier(), finish = barrier()
  const contexts: TaskExecutionContext[] = []
  try {
    const running = api.runDurableWorkflow({ ...f.options, executeTask: async (context) => {
      contexts.push(context)
      if (contexts.length === 2) entered.release()
      await finish.promise
      return f.outcome(context.workspace, context.lease)
    } })
    await entered.promise
    for (const context of contexts) {
      expect(context.lease.token).not.toBe(f.lease.token)
      expect(Object.keys(context.lease.epochs).some((key) => key.startsWith('run:'))).toBe(false)
      expect(context.snapshot.tasks.find((task) => task.taskId === context.taskId)?.phase).toBe('running')
      expect(context.events.at(-1)?.type).toBe('task.attempt.started')
      expect(context.artifacts[0]?.workspace).toEqual(f.snapshot.workspace)
    }
    finish.release()
    const result = await running
    expect(result.status).toBe('succeeded')
    expect(result.tasks.map((task) => task.phase)).toEqual(['succeeded', 'succeeded'])
    expect(result.workspace).toEqual(f.snapshot.workspace)
    expect(result.tasks.map((task) => task.workspace?.workspaceId)).toEqual(['a-1', 'b-1'])
  } finally { finish.release(); await f.close() }
})

test('persists cancellation intent before child abort and does not claim termination until a cancelled outcome', async () => {
  expect(api.runDurableWorkflow).toBeTypeOf('function')
  const f = await workflowFixture(), entered = barrier(), finish = barrier(), observed = barrier()
  let persisted = false
  try {
    const running = api.runDurableWorkflow({ ...f.options, concurrency: 1, executeTask: async (context) => {
      context.signal.addEventListener('abort', () => {
        void f.store.get(f.key).then((snapshot) => { persisted = snapshot?.cancelRequested === true; observed.release() })
      })
      entered.release(); await finish.promise
      return f.outcome(context.workspace, context.lease, 'cancelled')
    } })
    await entered.promise; f.controller.abort(); await observed.promise
    expect(persisted).toBe(true)
    const pending = await f.store.get(f.key)
    expect(pending?.status).toBe('running')
    expect(pending?.tasks[0]?.phase).toBe('running')
    expect((await f.store.pending('tenant', 10)).some((receipt) => receipt.command.kind === 'cancel')).toBe(true)
    finish.release()
    const result = await running
    expect(result.status).toBe('cancelled')
    expect(result.tasks[1]?.attempt).toBe(0)
    expect((await f.store.pending('tenant', 10)).some((receipt) => receipt.command.kind === 'cancel')).toBe(false)
  } finally { finish.release(); await f.close() }
})

test('rejects workflow incompatibility and invalid concurrency before executing', async () => {
  expect(api.runDurableWorkflow).toBeTypeOf('function')
  const f = await workflowFixture()
  try {
    const executeTask = async () => { throw new Error('must not execute') }
    await expect(api.runDurableWorkflow({ ...f.options, definition: { ...f.definition, version: 'other' }, executeTask })).rejects.toThrow(/compatib/)
    await expect(api.runDurableWorkflow({ ...f.options, concurrency: 0, executeTask })).rejects.toThrow(/concurrency/)
  } finally { await f.close() }
})

test('persists only safe provider failure metadata on the durable task snapshot', async () => {
  const f = await workflowFixture()
  const providerMessage = 'not-for-persistence'
  const providerFailure = { failurePhase: 'provider-response', status: 200, requestAccepted: true }
  const first = f.definition.tasks[0]
  if (!first) throw new Error('fixture task missing')
  const definition = { ...f.definition, tasks: [{ ...first, maxAttempts: 1 }] }
  try {
    const result = await api.runDurableWorkflow({ ...f.options, definition, executeTask: async (context) => {
      const outcome = f.outcome(context.workspace, context.lease, 'failed')
      return { ...outcome, outcome: { ...outcome.outcome, result: {
        status: 'failed', summary: 'OpenAI failed', data: { providerError: {
          category: 'protocol', providerId: 'openai', message: providerMessage, ...providerFailure,
        } }, errors: [{ message: providerMessage }],
      } } }
    } })

    expect(result.tasks[0]?.error).toMatchObject({ providerFailure })
    expect(JSON.stringify(result)).not.toContain(providerMessage)
  } finally { await f.close() }
})

test('dependency admission waits for durable predecessor publication', async () => {
  const f = await workflowFixture(), order: string[] = []
  f.definition.tasks[1]!.dependsOn = ['a']
  try {
    const result = await api.runDurableWorkflow({ ...f.options, executeTask: async (context) => {
      order.push(context.taskId)
      if (context.taskId === 'b') {
        expect(context.snapshot.tasks[0]?.phase).toBe('succeeded')
        expect(context.artifacts.map((artifact) => artifact.workspace.workspaceId)).toEqual(['parent', 'a-1'])
      }
      return f.outcome(context.workspace, context.lease)
    } })
    expect(result.status).toBe('succeeded')
    expect(order).toEqual(['a', 'b'])
  } finally { await f.close() }
})

test('already aborted input persists intent without admitting any child', async () => {
  const f = await workflowFixture()
  f.controller.abort()
  try {
    const result = await api.runDurableWorkflow({ ...f.options, executeTask: async () => { throw new Error('cancelled work admitted') } })
    expect(result.status).toBe('cancelled')
    expect(result.cancelRequested).toBe(true)
    expect(result.tasks.map((task) => task.attempt)).toEqual([0, 0])
  } finally { await f.close() }
})

test('abort during initial replay loading is not lost before the listener is installed', async () => {
  const f = await workflowFixture()
  try {
    const store = { ...f.store, events: async (...args: Parameters<typeof f.store.events>) => {
      f.controller.abort()
      return f.store.events(...args)
    } }
    const result = await api.runDurableWorkflow({ ...f.options, store, executeTask: async () => { throw new Error('cancelled work admitted') } })
    expect(result.status).toBe('cancelled')
    expect(result.tasks.every((task) => task.attempt === 0)).toBe(true)
  } finally { await f.close() }
})

test('parent CAS conflict fails closed without dispatching a child', async () => {
  const f = await workflowFixture()
  try {
    const conflict = { ...f.store, commit: async () => ({ status: 'conflict' as const }) }
    await expect(api.runDurableWorkflow({ ...f.options, store: conflict, executeTask: async () => { throw new Error('must not run') } })).rejects.toThrow('conflict')
    expect((await f.store.get(f.key))?.revision).toBe(0)
  } finally { await f.close() }
})

test('host returning the parent workspace fails before child execution', async () => {
  const f = await workflowFixture()
  try {
    await expect(api.runDurableWorkflow({ ...f.options, prepareTask: async () => f.snapshot.workspace,
      executeTask: async () => { throw new Error('must not run') } })).rejects.toThrow('Workspace isolation required')
  } finally { await f.close() }
})

test('cancellation can persist and abort while host workspace preparation is awaiting handback', async () => {
  const f = await workflowFixture(), entered = barrier(), finish = barrier()
  let preparationSignal: AbortSignal | undefined
  const running = api.runDurableWorkflow({ ...f.options, concurrency: 1, prepareTask: async (context) => {
    preparationSignal = context.signal; entered.release(); await finish.promise
    return { namespace: 'tenant', workspaceId: 'child', revision: 'base' }
  }, executeTask: async () => { throw new Error('cancelled task dispatched') } })
  try {
    await entered.promise; f.controller.abort()
    await new Promise((resolve) => setImmediate(resolve))
    expect((await f.store.get(f.key))?.cancelRequested).toBe(true)
    expect(preparationSignal?.aborted).toBe(true)
    finish.release()
    expect((await running).status).toBe('cancelled')
  } finally { finish.release(); await running.catch(() => undefined); await f.close() }
})

test('host hands renewed child authority back before subsequent journal boundaries', async () => {
  const f = await workflowFixture()
  f.definition.tasks.splice(1)
  try {
    const result = await api.runDurableWorkflow({ ...f.options, executeTask: async (context) => {
      const renewed = await f.store.renew(context.lease, 120_000)
      if (renewed.status !== 'acquired') throw new Error('renewal failed')
      await context.acceptRenewedLease(renewed.lease)
      await context.journal.begin({ id: 'read', toolId: 'read', arguments: {} }, 'read-only')
      await context.journal.finish('read', null)
      return f.outcome(context.workspace, renewed.lease)
    } })
    expect(result.status).toBe('succeeded')
    const reclaimed = await f.store.claim('tenant', ['task:run:a', 'workspace:a-1'], 'next', 1000)
    expect(reclaimed.status).toBe('acquired')
  } finally { await f.close() }
})

test('host refreshes parent authority privately without handing it to children', async () => {
  const f = await workflowFixture()
  try {
    const renewed = await f.store.renew(f.lease, 120_000)
    if (renewed.status !== 'acquired') throw new Error('renewal failed')
    const options = { ...f.options, currentParentLease: async () => renewed.lease, executeTask: async (context: TaskExecutionContext) => {
      expect(context.lease.token).not.toBe(renewed.lease.token)
      return f.outcome(context.workspace, context.lease)
    } }
    expect((await api.runDurableWorkflow(options)).status).toBe('succeeded')
  } finally { await f.close() }
})
