import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalExecutionRuntime } from '@brambodev/runtime-local'
import { expect, test, vi } from 'vitest'
// Test-only composition exercises the API loop without adding a production dependency.
// eslint-disable-next-line no-restricted-imports
import { runLocalToolLoop } from '../../adapter-api/src/tool-loop.ts'
import * as contracts from '@brambodev/contracts'
import { UncertainToolEffectError } from '@brambodev/contracts'
import type { ArtifactProvider, DriverServices, ExecutionRuntime, RunSnapshot } from '@brambodev/contracts'
// Shared test-only conformance harness is intentionally not a production package export.
// eslint-disable-next-line no-restricted-imports
import { nonSqliteHarness } from '../../contracts/test/helpers/non-sqlite-run-store.ts'
import { createDriverRegistry, createWorkflowRegistry, runDurableWorkflow } from '@brambodev/orchestration'
// Test-only host composition keeps session/API implementations out of production imports.
// eslint-disable-next-line no-restricted-imports
import { createExistingToolBridge, createWorkflowToolDispatcher } from '../../session/src/workflow-tools.ts'
// eslint-disable-next-line no-restricted-imports
import { executeTool } from '../../session/src/run-session.ts'
// eslint-disable-next-line no-restricted-imports
import { journalHarness } from '../../session/test/workflow-tools.fixture.ts'
import * as api from '../src/index.ts'
import type { WorkerAuthorizationContext, WorkerServices, WorkerTaskContext, WorkflowWorkerOptions } from '../src/worker.ts'

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
  const services: WorkerServices = { authorizeReconstruction: async () => true,
    dispatchTool: vi.fn(async () => 'result'), resolveSecret: vi.fn() }
  const runtime: ExecutionRuntime = { capabilities: ['context-reconstruction'], async execute(driver, request, lease) {
    const outcome = await driver.run({ ...request, workspace: { id: request.workspace.workspaceId, rootPath: '/test', capabilities: [] } })
    return { outcome, workspace: { ...request.workspace, revision: 'out' }, staged: { revision: 'out', entries: [] }, publicationLease: lease }
  } }
  const options = { workerId: 'worker-instance', principal, store, artifacts, runtime, definitions, drivers, services, execute: runDurableWorkflow, ...extra }
  return { harness, store, snapshot, admission, calls, services, options }
}

test.each(['denied', 'missing', 'unavailable', 'authorized'] as const)(
  'reconstruction gates snapshot and event cached results before runtime or driver disclosure with %s policy', async policy => {
    const f = await fixture()
    const claim = await f.store.claim('tenant', ['run:run', 'workspace:parent'], 'seed', 30_000)
    if (claim.status !== 'acquired') throw new Error('fixture')
    const seeded = await f.store.commit({ expectedRevision: 0, lease: claim.lease,
      snapshot: { ...f.snapshot, revision: 1, tasks: [{ taskId: 'a', phase: 'succeeded', attempt: 1,
        result: { cached: 'SNAPSHOT_RESULT_CANARY' }, workspace: f.snapshot.workspace }] },
      events: [{ type: 'task.effect.completed', payload: { taskId: 'a', attempt: 1, callId: 'charge',
        result: { cached: 'EVENT_RESULT_CANARY' } } }] })
    if (seeded.status !== 'committed') throw new Error('fixture')
    await f.store.release(claim.lease)
    const disclosed: string[] = []
    const runtimeForTask = vi.fn((context: WorkerTaskContext) => { disclosed.push(JSON.stringify(context)); return f.options.runtime })
    const factory = f.options.drivers.resolve('custom'), drivers = createDriverRegistry()
    const providerContexts: string[] = []
    const create = vi.fn(async (...args: Parameters<typeof factory.create>) => {
      const driver = await factory.create(...args)
      return { ...driver, async run(request: Parameters<typeof driver.run>[0]) {
        providerContexts.push(JSON.stringify(request.context))
        return driver.run(request)
      } }
    })
    drivers.register({ ...factory, create })
    const authorizeReconstruction = vi.fn(async (context: unknown, signal: AbortSignal, provenance: WorkerAuthorizationContext) => {
      expect(JSON.stringify(context)).toContain('SNAPSHOT_RESULT_CANARY')
      expect(JSON.stringify(context)).toContain('EVENT_RESULT_CANARY')
      expect(signal.aborted).toBe(false)
      expect(provenance).toMatchObject({ actor: { subject: 'alice' }, worker: { subject: 'worker' },
        receiptId: f.admission.receipt.id, key: f.snapshot.key, taskId: 'b' })
      expect(Object.isFrozen(provenance)).toBe(true)
      if (policy === 'unavailable') throw new Error('HOST_POLICY_SECRET')
      return policy === 'authorized'
    })
    const services = { dispatchTool: f.services.dispatchTool, resolveSecret: f.services.resolveSecret }
    const worker = api.createWorkflowWorker({ ...f.options, runtimeForTask, drivers,
      services: { ...services, ...(policy === 'missing' ? {} : { authorizeReconstruction }) } })
    try {
      expect(await worker.runOnce(new AbortController().signal)).toBe(true)
      if (policy === 'authorized') {
        expect(disclosed.join()).toContain('SNAPSHOT_RESULT_CANARY')
        expect(disclosed.join()).toContain('EVENT_RESULT_CANARY')
        expect(create).toHaveBeenCalledTimes(1)
        expect(providerContexts.join()).toContain('SNAPSHOT_RESULT_CANARY')
        expect(providerContexts.join()).toContain('EVENT_RESULT_CANARY')
        expect((await f.store.get(f.snapshot.key))?.status).toBe('succeeded')
      } else {
        expect(disclosed).toEqual([])
        expect(runtimeForTask).not.toHaveBeenCalled()
        expect(create).not.toHaveBeenCalled()
        expect(providerContexts).toEqual([])
        expect((await f.store.get(f.snapshot.key))?.status).toBe('blocked')
        expect((await f.store.get(f.snapshot.key))?.tasks.find(task => task.taskId === 'b')?.phase).toBe('blocked')
        expect((await f.store.receipt('tenant', f.admission.receipt.id))?.phase).toBe('blocked')
        expect(JSON.stringify(await f.store.get(f.snapshot.key))).not.toContain('HOST_POLICY_SECRET')
      }
      expect(authorizeReconstruction).toHaveBeenCalledTimes(policy === 'missing' ? 0 : 1)
    } finally { await worker.stop(); await f.store.close() }
  },
)

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

test.each(['worker', 'worker-b'].flatMap(subject => ['admission', 'intent', 'legacy-intent'].map(boundary => ({ subject, boundary }))))(
  'recovers cancellation after worker A crashes at $boundary without readmitting under $subject', async ({ subject, boundary }) => {
    const f = await fixture(), rawCommit = f.store.commit.bind(f.store)
    f.store.commit = async input => {
      if (input.events.some(event => event.type === (boundary === 'admission' ? 'run.cancel.requested' : 'run.cancelled'))) {
        throw new Error('crash before terminal cancellation')
      }
      return rawCommit(boundary === 'legacy-intent' ? { ...input, events: input.events.map(event =>
        event.type === 'run.cancel.requested' ? { ...event, payload: null } : event) } : input)
    }
    const publish = vi.spyOn(f.options.artifacts, 'publish')
    const first = api.createWorkflowWorker({ ...f.options, execute: options => runDurableWorkflow({ ...options, signal: AbortSignal.abort() }) })
    await expect(first.runOnce(new AbortController().signal)).rejects.toThrow('crash before terminal cancellation')
    await first.stop()
    expect((await f.store.get(f.snapshot.key))?.cancelRequested).toBe(boundary !== 'admission')
    const original = (await f.store.pending('tenant', 256, { key: f.snapshot.key, kind: 'cancel' }))[0]!
    expect(original).toMatchObject({ actor: { namespace: 'tenant', subject: 'worker' }, phase: boundary === 'admission' ? 'accepted' : 'running',
      command: { clientId: 'durable-engine', idempotencyKey: 'cancel:tenant:run', kind: 'cancel' } })
    const recoveredStore = await f.harness.reopen(), admit = vi.spyOn(recoveredStore, 'admit'), claim = vi.spyOn(recoveredStore, 'claim')
    const runtimeForTask = vi.fn(() => f.options.runtime)
    const second = api.createWorkflowWorker({ ...f.options, store: recoveredStore, runtimeForTask,
      workerId: subject + '-instance', principal: { namespace: 'tenant', subject } })
    try {
      expect(await second.runOnce(new AbortController().signal)).toBe(true)
      expect((await recoveredStore.get(f.snapshot.key))?.status).toBe('cancelled')
      expect(await recoveredStore.receipt('tenant', original.id)).toEqual({ ...original, phase: 'completed', outcome: { status: 'cancelled' } })
      expect((await recoveredStore.receipt('tenant', f.admission.receipt.id))?.actor).toEqual({ namespace: 'tenant', subject: 'alice' })
      expect((await recoveredStore.receipt('tenant', f.admission.receipt.id))?.phase).toBe('completed')
      expect(admit).not.toHaveBeenCalled()
      expect(runtimeForTask).not.toHaveBeenCalled()
      expect(f.calls).toEqual([])
      expect(publish).not.toHaveBeenCalled()
      expect(f.options.artifacts.stage).not.toHaveBeenCalled()
      expect(claim.mock.calls.every(call => !call[1].some(resource => resource.startsWith('task:')))).toBe(true)
      expect((await recoveredStore.events(f.snapshot.key, 0, 256)).events.some(event => event.type === 'run.succeeded' || event.type === 'task.succeeded')).toBe(false)
    } finally { await second.stop(); await recoveredStore.close(); await f.store.close() }
  },
)

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

test.each(['revoked', 'different-actor', 'unavailable', 'denied', 'authorized'] as const)(
  'completed effect recovery reauthorizes cached disclosure with %s policy without repeating the effect', async policy => {
    const f = await fixture()
    const base = f.options.definitions.resolve('flow', '1')
    const definitions = { resolve: () => ({ ...base, tasks: base.tasks.slice(0, 1) }) }
    const drivers = createDriverRegistry()
    const manifest = f.options.drivers.resolve('custom').manifest
    const disclosed: unknown[] = []
    drivers.register({ manifest, async create(_configuration, services) { return { manifest, async run(request) {
      const result = await services.dispatchTool({ id: 'charge', toolId: 'payments', arguments: { amount: 10, actor: 'mallory' } }, request.signal)
      disclosed.push(result)
      return { result: { status: 'ok', data: null, summary: 'done' } }
    } } } })
    let effects = 0
    const dispatchTool = async () => { effects++; return { paid: true } }
    const commit = f.store.commit.bind(f.store)
    f.store.commit = async input => {
      if (input.events.some(event => event.type === 'task.retry.ready')) throw new Error('host interrupted before retry')
      return commit(input)
    }
    const first = api.createWorkflowWorker({ ...f.options, definitions, drivers,
      services: { ...f.services, dispatchTool }, runtime: { ...f.options.runtime, async execute(...args) {
        await f.options.runtime.execute(...args)
        throw new Error('interrupted after durable effect completion')
      } } })
    try {
      await expect(first.runOnce(new AbortController().signal)).rejects.toThrow('host interrupted before retry')
      await first.stop()
      expect(effects).toBe(1)
      expect(disclosed).toEqual([{ paid: true }])
      expect((await f.store.get(f.snapshot.key))?.tasks[0]?.phase).toBe('running')
      // Reopen only after the completed result and interrupted attempt were durable.
      const recoveredStore = await f.harness.reopen()
      const authorizeReplay = vi.fn(async (_call: Parameters<DriverServices['dispatchTool']>[0], signal: AbortSignal, context: WorkerAuthorizationContext) => {
        if (signal.aborted) throw new Error('stopped')
        if (policy === 'revoked') throw new Error('actor revoked')
        if (policy === 'different-actor') return context.actor.subject === 'bob'
        return policy === 'authorized'
      })
      disclosed.length = 0
      const second = api.createWorkflowWorker({ ...f.options, store: recoveredStore, definitions, drivers,
        workerId: 'worker-b', principal: { namespace: 'tenant', subject: 'worker-b' },
        services: { ...f.services, dispatchTool, ...(policy === 'unavailable' ? {} : { authorizeReplay }) } })
      try {
        expect(await second.runOnce(new AbortController().signal)).toBe(true)
        expect(effects).toBe(1)
        expect(disclosed).toEqual(policy === 'authorized' ? [{ paid: true }] : [])
        expect((await recoveredStore.get(f.snapshot.key))?.status).toBe(policy === 'authorized' ? 'succeeded' : 'failed')
        if (policy !== 'unavailable') {
          expect(authorizeReplay).toHaveBeenCalledTimes(1)
          expect(authorizeReplay.mock.calls[0]?.[0]).toMatchObject({ id: 'charge', toolId: 'payments' })
          expect(authorizeReplay.mock.calls[0]?.[2]).toMatchObject({ actor: { namespace: 'tenant', subject: 'alice' },
            worker: { namespace: 'tenant', subject: 'worker-b' }, receiptId: f.admission.receipt.id,
            key: f.snapshot.key, taskId: 'a', workspace: { namespace: 'tenant' } })
          expect(Object.isFrozen(authorizeReplay.mock.calls[0]?.[2])).toBe(true)
        }
      } finally { await second.stop(); await recoveredStore.close() }
    } finally { await first.stop(); await f.store.close() }
  },
)

test('local runtime cancellation handback settles durable run, task and receipts without success publication', async () => {
  const f = await fixture(), root = await mkdtemp(join(tmpdir(), 'brambo-worker-cancel-'))
  f.harness.advance(Date.now() - 1000)
  let entered!: () => void, aborted!: () => void, handback!: () => void, workspacePath = ''
  const started = new Promise<void>(resolve => { entered = resolve })
  const cancelled = new Promise<void>(resolve => { aborted = resolve })
  const settled = new Promise<void>(resolve => { handback = resolve })
  const controller = new AbortController()
  const factory = f.options.drivers.resolve('custom')
  const drivers = createDriverRegistry()
  drivers.register({ manifest: factory.manifest, async create() { return { manifest: factory.manifest, async run(request) {
    f.calls.push(request.taskId)
    workspacePath = request.workspace.rootPath
    await writeFile(join(workspacePath, 'unpublished.txt'), 'unfinished output')
    request.signal.addEventListener('abort', () => aborted(), { once: true })
    entered()
    await settled
    return { result: { status: 'cancelled', data: null, summary: 'trusted driver handback', errors: [{ message: 'aborted' }] } }
  } } } })
  const artifacts: ArtifactProvider = { ...f.options.artifacts, materialize: async (ref, directory) => {
    await mkdir(directory)
    return { id: ref.workspaceId, rootPath: directory, capabilities: ['read', 'write'] }
  } }
  const stage = vi.spyOn(artifacts, 'stage'), publish = vi.spyOn(artifacts, 'publish')
  const worker = api.createWorkflowWorker({ ...f.options, artifacts, drivers,
    runtimeForTask: context => createLocalExecutionRuntime({ rootDir: root, artifacts, store: context.store }) })
  const running = worker.runOnce(controller.signal)
  let finished = false
  void running.then(() => { finished = true }, () => { finished = true })
  try {
    await started
    // The worker seeds the isolated child from the base before dispatch; only
    // publication after this handback boundary would be success publication.
    publish.mockClear()
    controller.abort()
    await cancelled
    expect(finished).toBe(false)
    await access(workspacePath)
    expect((await f.store.get(f.snapshot.key))?.tasks[0]?.phase).toBe('running')
    handback()
    await expect(running).resolves.toBe(true)
    const snapshot = await f.store.get(f.snapshot.key)
    expect(snapshot).toMatchObject({ status: 'cancelled', cancelRequested: true, workspace: f.snapshot.workspace })
    expect(snapshot?.tasks.map(task => [task.taskId, task.phase])).toEqual([['a', 'cancelled'], ['b', 'pending']])
    expect(f.calls).toEqual(['a'])
    const startReceipt = await f.store.receipt('tenant', f.admission.receipt.id)
    expect(startReceipt).toMatchObject({ phase: 'completed', outcome: { status: 'cancelled' } })
    const cancel = await f.store.admit({ key: f.snapshot.key, clientId: 'durable-engine',
      idempotencyKey: 'cancel:tenant:run', kind: 'cancel', payload: null }, f.options.principal)
    expect(cancel.status).toBe('duplicate')
    if (cancel.status === 'conflict') throw new Error('fixture')
    expect(cancel.receipt).toMatchObject({ phase: 'completed', outcome: { status: 'cancelled' } })
    const events = await f.store.events(f.snapshot.key, 0, 256)
    expect(events.events.map(event => event.type)).toContain('task.cancelled')
    expect(events.events.some(event => event.type === 'task.succeeded' || event.type === 'run.succeeded')).toBe(false)
    expect(stage).not.toHaveBeenCalled()
    expect(publish).not.toHaveBeenCalled()
    await expect(access(workspacePath)).rejects.toMatchObject({ code: 'ENOENT' })
  } finally {
    controller.abort(); handback()
    await running.catch(() => undefined)
    await worker.stop(); await f.store.close()
    // root is the exact mkdtemp child created by this test, not a computed parent.
    await rm(root, { recursive: true, force: true })
  }
})

test.each(['post-dispatch', 'uncertain-admission', 'settlement', 'settlement-marker', 'typed', 'spoofed-safe', 'session-after-execution', 'session-settlement-marker', 'session-reauthorize-marker'] as const)('worker %s uncertainty stops replacement provider turns', async mode => {
  const f = await fixture(), base = f.options.definitions.resolve('flow', '1')
  const definitions = { resolve: () => ({ ...base, tasks: base.tasks.slice(0, 1) }) }
  const drivers = createDriverRegistry(), manifest = f.options.drivers.resolve('custom').manifest
  let turns = 0, effects = 0
  const failures: unknown[] = [], typed = new UncertainToolEffectError()
  let allowed = true
  const sessionJournal = journalHarness().journal
  if (mode === 'session-settlement-marker') sessionJournal.finish = async () => { throw new contracts.ToolEffectNotStartedError() }
  const sessionDispatch = createWorkflowToolDispatcher({ principal: { namespace: 'tenant', subject: 'alice' },
    key: f.snapshot.key, taskId: 'a', authorize: async () => {
      if (mode === 'session-reauthorize-marker' && effects > 0) {
        throw Object.assign(new contracts.ToolEffectNotStartedError('secret-policy-canary'), { cause: new Error('secret-cause-canary') })
      }
      return allowed
    }, resolveSecret: async () => 'unused',
    journal: sessionJournal, tools: [{ id: 'charge', effect: mode === 'session-settlement-marker' || mode === 'session-reauthorize-marker' ? 'non-idempotent' : 'idempotent',
      inputSchema: contracts.defineStandardSchema<contracts.JsonObject>(value => ({ value: value as contracts.JsonObject })),
      async execute() { effects++; if (mode === 'session-after-execution') allowed = false; return { paid: true } },
      ...(mode === 'session-reauthorize-marker' ? { secretBinding: { references: {},
        async execute(_args: contracts.JsonObject, _secrets: Readonly<Record<string, string>>, _signal: AbortSignal, reauthorize: () => Promise<void>) {
          effects++
          await reauthorize()
          return { paid: true }
        },
      } } : {}),
    }] })
  if (mode === 'settlement' || mode === 'settlement-marker') {
    const commit = f.store.commit.bind(f.store)
    f.store.commit = async input => {
      if (input.events.some(event => event.type === 'task.effect.completed')) {
        if (mode === 'settlement-marker') throw new contracts.ToolEffectNotStartedError()
        throw new Error('settlement unavailable')
      }
      return commit(input)
    }
  }
  drivers.register({ manifest, async create(_configuration, services) { return { manifest, async run(request) {
    if (mode === 'uncertain-admission') {
      // Leave a real admitted effect without settlement, then request that exact call again.
      await services.dispatchTool({ id: 'original', toolId: 'charge', arguments: {} }, request.signal).catch(() => undefined)
    }
    try {
      await runLocalToolLoop({ state: null, signal: request.signal, limits: { maxSteps: 2, maxConcurrentCalls: 1 },
        dispatchTool: services.dispatchTool,
        next: async () => {
          turns++
          return turns > 2 ? { state: null, complete: true } : { state: null, calls: [{
            id: turns === 1 ? 'original' : 'replacement', toolId: 'charge', arguments: {}, concurrencySafe: false,
            validateArguments: () => undefined,
            correlation: { sessionId: request.sessionId, turnId: 'turn', workspaceId: request.workspace.id, attempt: 1, step: turns },
          }] }
        },
        encodeResult: (call, outcome) => ({ callId: call.id, output: outcome.kind === 'error' ? 'failed' : 'ok' }),
      })
    } catch (error) { failures.push(error); throw error }
    return { result: { status: 'ok', data: null, summary: 'done' } }
  } } } })
  const worker = api.createWorkflowWorker({ ...f.options, definitions, drivers, services: { ...f.services,
    dispatchTool: async (call, signal) => {
      if (mode === 'session-after-execution' || mode === 'session-settlement-marker' || mode === 'session-reauthorize-marker') return sessionDispatch(call, signal)
      effects++
      if (mode === 'settlement' || mode === 'settlement-marker') return { paid: true }
      if (mode === 'spoofed-safe') throw Object.assign(new Error('failed after charge'), { name: 'ToolEffectNotStartedError' })
      if (mode === 'typed') throw typed
      throw new Error('host failed after charge')
    } } })
  try {
    const running = worker.runOnce(new AbortController().signal)
    if (mode === 'settlement') await expect(running).rejects.toThrow('settlement unavailable')
    else if (mode === 'settlement-marker') await expect(running).rejects.toBeInstanceOf(contracts.ToolEffectNotStartedError)
    else await expect(running).resolves.toBe(true)
    expect(effects).toBe(1)
    expect(turns).toBe(1)
    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatchObject({ name: 'UncertainToolEffectError' })
    if (mode === 'typed') expect(failures[0]).toBe(typed)
    if (mode === 'session-reauthorize-marker') {
      expect(String(failures[0])).not.toContain('secret-policy-canary')
      expect(failures[0]).not.toHaveProperty('cause')
    }
    if (mode !== 'settlement' && mode !== 'settlement-marker') expect((await f.store.get(f.snapshot.key))?.status).toBe('blocked')
  } finally { await worker.stop(); await f.store.close() }
})

test.each(['direct-marker', 'session-bridge', 'session-authorization', 'session-authorization-marker'] as const)('worker proven pre-dispatch %s refusal remains a retryable provider error', async mode => {
  const f = await fixture(), base = f.options.definitions.resolve('flow', '1')
  const definitions = { resolve: () => ({ ...base, tasks: base.tasks.slice(0, 1) }) }
  const drivers = createDriverRegistry(), manifest = f.options.drivers.resolve('custom').manifest
  let turns = 0, effects = 0
  const outputs: unknown[] = []
  drivers.register({ manifest, async create(_configuration, services) { return { manifest, async run(request) {
    await runLocalToolLoop({ state: null, signal: request.signal, limits: { maxSteps: 2, maxConcurrentCalls: 1 },
      dispatchTool: services.dispatchTool,
      next: async (_state, prior) => {
        turns++
        outputs.push(...prior.map(item => item.output))
        return turns > 1 ? { state: null, complete: true } : { state: null, calls: [{
          id: 'safe-refusal', toolId: 'charge', arguments: mode === 'direct-marker' ? { approved: false } : { argv: [] }, concurrencySafe: false,
          validateArguments: () => undefined,
          correlation: { sessionId: request.sessionId, turnId: 'turn', workspaceId: request.workspace.id, attempt: 1, step: turns },
        }] }
      },
      encodeResult: (call, outcome) => ({ callId: call.id, output: outcome.kind === 'error' ? 'safe refusal' : 'ok' }),
    })
    return { result: { status: 'ok', data: null, summary: 'no charge needed' } }
  } } } })
  const policy = { version: 1 as const, mode: 'read-only' as const, workspaceRoot: 'C:/workspace',
    requiredCapabilities: { filesystem: 'full' as const } }
  const bridge = createExistingToolBridge({ id: 'charge',
    invocation: { tool: { kind: 'local', argv: ['node'] }, arguments: [] },
    context: { cwd: 'C:/workspace', environment: {}, policy },
    toolPolicy: { ...policy, workspaceRoot: 'C:/different-workspace' },
    toolExecutor: { async execute() {
      effects++
      return { status: 'ok', stdout: 'written', stderr: '', exitCode: 0,
        enforcement: { version: 1, providerId: 'fixture', enforcement: 'simulated',
          controls: { filesystem: 'full', network: 'none', process: 'none', resources: 'none' } } }
    } },
    approveTool: async () => true, execute: executeTool,
  })
  const dispatch = createWorkflowToolDispatcher({ principal: { namespace: 'tenant', subject: 'alice' },
    key: f.snapshot.key, taskId: 'a', tools: [bridge], authorize: async () => {
      if (mode === 'session-authorization-marker') throw new contracts.ToolEffectNotStartedError('private-policy-detail')
      return mode !== 'session-authorization'
    },
    resolveSecret: async () => 'unused', journal: journalHarness().journal })
  const worker = api.createWorkflowWorker({ ...f.options, definitions, drivers, services: { ...f.services,
    dispatchTool: async (call, signal) => {
      if (mode !== 'direct-marker') return dispatch(call, signal)
      // Trusted host policy positively proves this callback refused before execution.
      if (call.arguments.approved !== true) throw new contracts.ToolEffectNotStartedError()
      effects++
      return { paid: true }
    } } })
  try {
    expect(await worker.runOnce(new AbortController().signal)).toBe(true)
    expect(effects).toBe(0)
    expect(turns).toBe(2)
    expect(outputs).toEqual(['safe refusal'])
    expect((await f.store.get(f.snapshot.key))?.status).toBe('succeeded')
  } finally { await worker.stop(); await f.store.close() }
})
