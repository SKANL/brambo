import { expect, test, vi } from 'vitest'
import type { ArtifactProvider, DriverServices, ExecutionRuntime, RunSnapshot } from '@brambodev/contracts'
// Shared test-only conformance harness is intentionally not a production package export.
// eslint-disable-next-line no-restricted-imports
import { nonSqliteHarness } from '../../contracts/test/helpers/non-sqlite-run-store.ts'
import { createDriverRegistry, createWorkflowRegistry, runDurableWorkflow } from '@brambodev/orchestration'
import * as api from '../src/index.ts'
import type { WorkflowWorkerOptions } from '../src/worker.ts'

async function fixture(extra: Partial<WorkflowWorkerOptions> = {}) {
  const harness = nonSqliteHarness(), store = await harness.open()
  const principal = { namespace: 'tenant', subject: 'worker' }
  const snapshot: RunSnapshot = { schemaVersion: 1, key: { namespace: 'tenant', runId: 'run' }, revision: 0,
    workflowId: 'flow', workflowVersion: '1', sessionId: 'session', status: 'pending',
    workspace: { namespace: 'tenant', workspaceId: 'parent', revision: 'base' }, tasks: [], context: null, cancelRequested: false }
  const admission = await store.create(snapshot, { key: snapshot.key, clientId: 'a', idempotencyKey: 'start', kind: 'start', payload: null }, { namespace: 'tenant', subject: 'alice' })
  if (admission.status !== 'accepted') throw new Error('fixture')
  const definitions = createWorkflowRegistry()
  definitions.register({ id: 'flow', version: '1', tasks: ['a', 'b'].map(id => ({ id, dependsOn: id === 'b' ? ['a'] : [],
    driverId: 'custom', configuration: null, prompt: id, required: [], optional: [], maxAttempts: 2 })) })
  const drivers = createDriverRegistry(), calls: string[] = []
  const manifest = { id: 'custom', version: '1', kind: 'custom' as const, capabilities: ['context-reconstruction'],
    configurationSchema: { '~standard': { version: 1 as const, vendor: 'test', validate: (value: unknown) => ({ value }) } } }
  drivers.register({ manifest, async create(_configuration, services) { return { manifest, async run(request) {
    calls.push(request.taskId)
    await services.dispatchTool({ id: request.taskId + '-call', toolId: 'custom-tool', arguments: { actor: 'mallory' } }, request.signal)
    return { result: { status: 'ok', data: null, summary: 'done' } }
  } } } })
  const artifacts: ArtifactProvider = { stage: vi.fn(), read: vi.fn(), materialize: vi.fn(),
    manifest: async ref => ({ revision: ref.revision, entries: [] }),
    publish: async (ref, _manifest, lease) => { if (!await store.valid(lease) || !Object.hasOwn(lease.epochs, 'workspace:' + ref.workspaceId)) throw new Error('stale') } }
  const services: DriverServices = { dispatchTool: vi.fn(async () => 'result'), resolveSecret: vi.fn() }
  const runtime: ExecutionRuntime = { capabilities: ['context-reconstruction'], async execute(driver, request, lease) {
    const outcome = await driver.run({ ...request, workspace: { id: request.workspace.workspaceId, rootPath: '/test', capabilities: [] } })
    return { outcome, workspace: { ...request.workspace, revision: 'out' }, staged: { revision: 'out', entries: [] }, publicationLease: lease }
  } }
  const options = { workerId: 'worker-instance', principal, store, artifacts, runtime, definitions, drivers, services, execute: runDurableWorkflow, ...extra }
  return { harness, store, snapshot, admission, calls, services, options }
}

test('claims a durable receipt with principal-bound run/workspace scopes, executes once and completes it', async () => {
  const f = await fixture()
  expect(api.createWorkflowWorker).toBeTypeOf('function')
  const claim = vi.spyOn(f.store, 'claim')
  const worker = api.createWorkflowWorker(f.options)
  expect(await worker.runOnce(new AbortController().signal)).toBe(true)
  expect((await f.store.receipt('tenant', f.admission.receipt.id))?.phase).toBe('completed')
  expect(f.calls).toEqual(['a', 'b'])
  expect(claim.mock.calls.every(call => call[2] === 'worker')).toBe(true)
  expect(claim.mock.calls[0]?.[1]).toEqual(['run:run', 'workspace:parent'])
  expect(await worker.runOnce(new AbortController().signal)).toBe(false)
  await worker.stop()
  await f.store.close()
})

test('host dispatch receives the frozen initiating receipt actor, not worker identity or tool payload', async () => {
  const f = await fixture()
  const dispatch = vi.fn(async () => 'result')
  const worker = api.createWorkflowWorker({ ...f.options, services: { ...f.services, dispatchTool: dispatch } })
  expect(await worker.runOnce(new AbortController().signal)).toBe(true)
  const context = (dispatch.mock.calls as unknown[][])[0]?.[2] as { actor: unknown; receiptId: string; taskId: string }
  expect(context).toMatchObject({ actor: { namespace: 'tenant', subject: 'alice' }, receiptId: f.admission.receipt.id, taskId: 'a' })
  expect(Object.isFrozen(context.actor)).toBe(true)
  expect(Object.isFrozen(context)).toBe(true)
  await worker.stop()
})

test('execution-time host policy rejects a revoked receipt actor before a new effect', async () => {
  const f = await fixture(), effects = vi.fn()
  const authorize = vi.fn((_call: unknown, _signal: AbortSignal, context?: { actor: { subject: string } }) => {
    if (context?.actor.subject !== 'alice') throw new Error('missing trusted actor')
    throw new Error('actor revoked')
  })
  const worker = api.createWorkflowWorker({ ...f.options, services: { ...f.services, dispatchTool: async (...args) => {
    authorize(...args); effects(); return 'effect'
  } } })
  await worker.runOnce(new AbortController().signal).catch(() => undefined)
  expect(authorize.mock.calls[0]?.[2]?.actor.subject).toBe('alice')
  expect(effects).not.toHaveBeenCalled()
  expect((await f.store.get(f.snapshot.key))?.status).not.toBe('succeeded')
  await worker.stop()
})

test('a contended worker cannot mark a receipt running or execute', async () => {
  const f = await fixture()
  await f.store.claim('tenant', ['run:run', 'workspace:parent'], 'other', 60_000)
  const worker = api.createWorkflowWorker(f.options)
  expect(await worker.runOnce(new AbortController().signal)).toBe(false)
  expect((await f.store.receipt('tenant', f.admission.receipt.id))?.phase).toBe('accepted')
  expect(f.calls).toEqual([])
  await worker.stop()
})

test.each([{ phase: 'pending' }, { phase: 'unknown' }, { phase: 'completed', version: 2 }])('worker refuses pending/invalid import before receipt transition %j', async patch => {
  const f = await fixture(), commit = vi.spyOn(f.store, 'commit'), execute = vi.fn()
  vi.spyOn(f.store, 'get').mockResolvedValue({ ...f.snapshot, lineage: { namespace: 'tenant', runId: 'source' },
    importState: { version: 1, id: 'import-id', sourceKey: { namespace: 'tenant', runId: 'source' }, sourceRevision: 1, fingerprint: 'a'.repeat(64), ...patch } } as unknown as RunSnapshot)
  const worker = api.createWorkflowWorker({ ...f.options, execute })
  await worker.runOnce(new AbortController().signal).catch(() => undefined)
  expect(commit).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled()
  await worker.stop()
})

test('pending cancellation is processed durably without executing a task', async () => {
  const f = await fixture()
  const cancel = await f.store.admit({ key: f.snapshot.key, clientId: 'b', idempotencyKey: 'cancel', kind: 'cancel', payload: null }, { namespace: 'tenant', subject: 'bob' })
  const worker = api.createWorkflowWorker(f.options)
  expect(await worker.runOnce(new AbortController().signal)).toBe(true)
  expect((await f.store.get(f.snapshot.key))?.cancelRequested).toBe(true)
  expect((await f.store.get(f.snapshot.key))?.status).toBe('cancelled')
  if (cancel.status === 'conflict') throw new Error('fixture')
  expect((await f.store.receipt('tenant', cancel.receipt.id))?.phase).toBe('completed')
  expect(f.calls).toEqual([])
  await worker.stop()
})

test('stop waits for settlement, aborts execution and never closes injected resources', async () => {
  const f = await fixture(), close = vi.spyOn(f.store, 'close')
  let entered!: () => void, finish!: () => void, aborted = false
  const ready = new Promise<void>(resolve => { entered = resolve })
  const done = new Promise<void>(resolve => { finish = resolve })
  const execute: typeof runDurableWorkflow = async options => {
    entered(); options.signal.addEventListener('abort', () => { aborted = true })
    await done
    return (await options.store.get(options.key))!
  }
  const worker = api.createWorkflowWorker({ ...f.options, execute })
  const running = worker.runOnce(new AbortController().signal)
  await ready
  await expect(worker.runOnce(new AbortController().signal)).rejects.toThrow('already running')
  let stopped = false
  const stopping = worker.stop().then(() => { stopped = true })
  await new Promise(resolve => setImmediate(resolve))
  expect(aborted).toBe(true); expect(stopped).toBe(false)
  finish(); await expect(running).rejects.toThrow('outcome pending'); await stopping
  expect(close).not.toHaveBeenCalled()
  expect(await worker.runOnce(new AbortController().signal)).toBe(false)
})

test('renewal failure aborts active execution and leaves its receipt pending for takeover', async () => {
  const f = await fixture()
  const renew = vi.spyOn(f.store, 'renew').mockResolvedValue({ status: 'contended' })
  const execute: typeof runDurableWorkflow = async options => {
    await new Promise<void>(resolve => options.signal.addEventListener('abort', () => resolve(), { once: true }))
    throw new Error('lease lost')
  }
  const worker = api.createWorkflowWorker({ ...f.options, execute, leaseTtlMs: 100, renewalMs: 10 })
  await expect(worker.runOnce(new AbortController().signal)).rejects.toThrow()
  expect(renew).toHaveBeenCalled()
  expect((await f.store.receipt('tenant', f.admission.receipt.id))?.phase).toBe('running')
  await worker.stop()
})

test('refuses overlapping calls and invalid worker policy', async () => {
  const f = await fixture()
  expect(() => api.createWorkflowWorker({ ...f.options, renewalMs: 60_000, leaseTtlMs: 60_000 })).toThrow()
  expect(() => api.createWorkflowWorker({ ...f.options, principal: { namespace: 'tenant', subject: '../bad' } })).toThrow()
})

test('per-task runtime store orders renewal with long effect completion and retains isolated authority', async () => {
  const f = await fixture()
  const base = f.options.definitions.resolve('flow', '1')
  const scopes: import('@brambodev/contracts').Lease[] = [], stores: import('@brambodev/contracts').RunStore[] = []
  const gates = new Map<string, ReturnType<typeof gate>>()
  function gate() {
    let entered!: () => void, changed!: () => void, handback!: () => void
    return { started: new Promise<void>(resolve => { entered = resolve }), entered,
      renewed: new Promise<void>(resolve => { changed = resolve }), changed,
      finish: new Promise<void>(resolve => { handback = resolve }), handback }
  }
  for (const task of base.tasks) gates.set(task.id, gate())
  const rawRenew = f.store.renew.bind(f.store)
  f.store.renew = async (lease, duration) => {
    const result = await rawRenew(lease, duration)
    const task = Object.keys(lease.epochs).find(key => key.startsWith('task:'))!.split(':')[2]!
    const current = gates.get(task)!
    current.changed(); await current.finish
    return result
  }
  const worker = api.createWorkflowWorker({ ...f.options, concurrency: 2,
    definitions: { resolve: () => ({ ...base, tasks: base.tasks.map(task => ({ ...task, dependsOn: [] })) }) },
    runtimeForTask: context => {
      scopes.push(context.lease); stores.push(context.store)
      return { capabilities: ['context-reconstruction'], async execute(driver, request, lease) {
        const active = driver.run({ ...request, workspace: { id: request.workspace.workspaceId, rootPath: '/test', capabilities: [] } })
        void active.catch(() => undefined)
        const current = gates.get(request.taskId)!
        try {
          await Promise.race([current.started, new Promise<void>(resolve => request.signal.addEventListener('abort', () => resolve(), { once: true }))])
          if (request.signal.aborted) throw new Error('aborted')
          const renewal = context.store.renew(lease, 120_000)
          await current.renewed
          // Effect completion is now ready, but the exact-authority handoff is held.
          await new Promise(resolve => setImmediate(resolve))
          current.handback()
          const renewed = await renewal
          if (renewed.status !== 'acquired') throw new Error('renewal')
          return { outcome: await active, workspace: { ...request.workspace, revision: 'out' }, staged: { revision: 'out', entries: [] }, publicationLease: renewed.lease }
        } finally { current.changed(); current.handback(); await active.catch(() => undefined) }
      } }
    },
    services: { ...f.services, dispatchTool: async call => {
      const current = gates.get(call.id.split('-')[0]!)!
      current.entered(); await current.renewed; return 'done'
    } },
  })
  expect(await worker.runOnce(new AbortController().signal)).toBe(true)
  expect((await f.store.get(f.snapshot.key))?.status).toBe('succeeded')
  expect(scopes).toHaveLength(2); expect(scopes[0]!.token).not.toBe(scopes[1]!.token)
  expect(stores[0]).not.toBe(stores[1])
  for (const lease of scopes) {
    expect(lease.ownerId).toBe('worker')
    expect(Object.keys(lease.epochs)).toHaveLength(2)
    expect(Object.keys(lease.epochs).some(resource => resource.startsWith('run:'))).toBe(false)
  }
  await worker.stop()
})

test('rejected child lease handoff aborts that runtime and blocks the receipt without publishing success', async () => {
  const f = await fixture()
  const renew = f.store.renew.bind(f.store), valid = f.store.valid.bind(f.store)
  const invalidTokens = new Set<string>()
  f.store.renew = async (lease, ttl) => {
    const result = await renew(lease, ttl)
    if (result.status === 'acquired') invalidTokens.add(result.lease.token)
    return result
  }
  f.store.valid = async lease => !invalidTokens.has(lease.token) && valid(lease)
  let aborted = false
  const worker = api.createWorkflowWorker({ ...f.options, runtimeForTask: context => ({
    capabilities: ['context-reconstruction'], async execute(_driver, request, lease) {
      request.signal.addEventListener('abort', () => { aborted = true })
      await context.store.renew(lease, 120_000)
      throw new Error('must not reach')
    },
  }) })
  await expect(worker.runOnce(new AbortController().signal)).rejects.toThrow('stale-lease')
  expect(aborted).toBe(true)
  expect((await f.store.get(f.snapshot.key))?.status).not.toBe('succeeded')
  expect((await f.store.receipt('tenant', f.admission.receipt.id))?.phase).toBe('running')
  expect(f.calls).toEqual([])
  await worker.stop()
})

test('active cancellation is observed on renewal and records intent before confirmed child cancellation', async () => {
  const f = await fixture()
  let entered!: () => void
  const ready = new Promise<void>(resolve => { entered = resolve })
  const runtime: ExecutionRuntime = { capabilities: ['context-reconstruction'], async execute(_driver, request, lease) {
    entered()
    await new Promise<void>(resolve => request.signal.addEventListener('abort', () => resolve(), { once: true }))
    return { outcome: { result: { status: 'cancelled', data: null, summary: 'stopped', errors: [{ message: 'cancelled' }] } },
      staged: { revision: request.workspace.revision, entries: [] }, workspace: request.workspace, publicationLease: lease }
  } }
  const worker = api.createWorkflowWorker({ ...f.options, runtime, leaseTtlMs: 1000, renewalMs: 10 })
  const running = worker.runOnce(new AbortController().signal)
  await ready
  const accepted = await f.store.admit({ key: f.snapshot.key, clientId: 'b', idempotencyKey: 'active-cancel', kind: 'cancel', payload: null }, { namespace: 'tenant', subject: 'bob' })
  expect(accepted.status).toBe('accepted')
  expect(await running).toBe(true)
  const current = await f.store.get(f.snapshot.key)
  expect(current?.cancelRequested).toBe(true); expect(current?.status).toBe('cancelled')
  expect(await f.store.pending('tenant', 256)).toEqual([])
  await worker.stop()
})

test('active cancellation behind a full global page is observed and settled', async () => {
  const f = await fixture()
  let entered!: () => void
  const ready = new Promise<void>(resolve => { entered = resolve })
  const runtime: ExecutionRuntime = { capabilities: ['context-reconstruction'], async execute(_driver, request, lease) {
    entered()
    await new Promise<void>(resolve => request.signal.addEventListener('abort', () => resolve(), { once: true }))
    return { outcome: { result: { status: 'cancelled', data: null, summary: 'stopped', errors: [{ message: 'cancelled' }] } },
      staged: { revision: request.workspace.revision, entries: [] }, workspace: request.workspace, publicationLease: lease }
  } }
  const worker = api.createWorkflowWorker({ ...f.options, runtime, leaseTtlMs: 1000, renewalMs: 10 })
  const running = worker.runOnce(new AbortController().signal)
  await ready
  // Same-run non-cancel receipts also cannot hide cancellation behind the limit.
  for (let i = 0; i < 256; i++) await f.store.admit({ key: f.snapshot.key, clientId: 'queue', idempotencyKey: 'queued-' + i, kind: 'continue', payload: null }, { namespace: 'tenant', subject: 'alice' })
  const cancel = await f.store.admit({ key: f.snapshot.key, clientId: 'b', idempotencyKey: 'late-cancel', kind: 'cancel', payload: null }, { namespace: 'tenant', subject: 'bob' })
  expect(cancel.status).toBe('accepted')
  if (cancel.status === 'conflict') throw new Error('fixture')
  try {
    await Promise.race([running, new Promise((_, reject) => setTimeout(() => reject(new Error('cancellation starved')), 1000))])
    expect((await f.store.get(f.snapshot.key))?.status).toBe('cancelled')
    expect((await f.store.receipt('tenant', cancel.receipt.id))?.phase).toBe('completed')
  } finally { await worker.stop(); await running.catch(() => undefined) }
})

test('parent validity orders a copied authority after its own renewal without widening identity', async () => {
  const f = await fixture(), rawRenew = f.store.renew.bind(f.store)
  let renewed!: () => void
  const changed = new Promise<void>(resolve => { renewed = resolve })
  f.store.renew = async (lease, ttl) => { const result = await rawRenew(lease, ttl); renewed(); return result }
  const execute: typeof runDurableWorkflow = async options => {
    const earlier = await options.currentParentLease!()
    f.harness.advance(1)
    await changed
    expect(await f.store.valid(earlier)).toBe(false) // Exact expiry changed in authority.
    expect(await options.store.valid(earlier)).toBe(true)
    for (const mismatch of [ { ...earlier, ownerId: 'other' }, { ...earlier, token: 'other' },
      { ...earlier, epochs: { ...earlier.epochs, 'workspace:extra': 1 } },
      { ...earlier, epochs: { 'workspace:parent': 1 } },
      { ...earlier, epochs: Object.fromEntries(Object.entries(earlier.epochs).map(([key, epoch]) => [key, epoch + 1])) } ]) {
      expect(await options.store.valid(mismatch)).toBe(false)
    }
    const child = await f.store.claim('tenant', ['task:run:a', 'workspace:child'], 'worker', 1000)
    if (child.status !== 'acquired') throw new Error('fixture')
    expect(await options.store.valid(child.lease)).toBe(true)
    const rawValid = vi.spyOn(f.store, 'valid')
    expect(await options.store.valid({ ...child.lease, epochs: { ...child.lease.epochs, 'run:run': 1 } })).toBe(false)
    expect(rawValid.mock.calls.at(-1)?.[0]).toMatchObject({ token: child.lease.token, epochs: { 'task:run:a': 1, 'workspace:child': 1, 'run:run': 1 } })
    const current = (await options.store.get(options.key))!
    const result = await options.store.commit({ snapshot: { ...current, revision: current.revision + 1, status: 'succeeded' },
      expectedRevision: current.revision, lease: earlier, events: [] })
    if (result.status !== 'committed') throw new Error(result.status)
    return result.snapshot
  }
  const worker = api.createWorkflowWorker({ ...f.options, execute, leaseTtlMs: 1000, renewalMs: 10 })
  expect(await worker.runOnce(new AbortController().signal)).toBe(true)
  await worker.stop()
})

test('parent validity cannot resurrect a copied lease after another owner takes over', async () => {
  const f = await fixture()
  const execute: typeof runDurableWorkflow = async options => {
    const earlier = await options.currentParentLease!()
    f.harness.advance(1001)
    expect((await f.store.claim('tenant', ['run:run', 'workspace:parent'], 'other', 2000)).status).toBe('acquired')
    expect(await options.store.valid(earlier)).toBe(false)
    const current = (await options.store.get(options.key))!
    expect((await options.store.commit({ snapshot: { ...current, revision: current.revision + 1, status: 'succeeded' },
      expectedRevision: current.revision, lease: earlier, events: [] })).status).toBe('stale-lease')
    throw new Error('takeover remains denied')
  }
  const worker = api.createWorkflowWorker({ ...f.options, execute, leaseTtlMs: 1000, renewalMs: 100 })
  await expect(worker.runOnce(new AbortController().signal)).rejects.toThrow('takeover remains denied')
  expect((await f.store.get(f.snapshot.key))?.status).not.toBe('succeeded')
  await worker.stop()
})

test('a prototype-backed RunStore remains usable without closing its host resource', async () => {
  const f = await fixture(), close = vi.spyOn(f.store, 'close')
  const store: import('@brambodev/contracts').RunStore = Object.create(f.store)
  const worker = api.createWorkflowWorker({ ...f.options, store })
  expect(await worker.runOnce(new AbortController().signal)).toBe(true)
  expect((await f.store.get(f.snapshot.key))?.status).toBe('succeeded')
  expect(close).not.toHaveBeenCalled()
  await worker.stop()
})
