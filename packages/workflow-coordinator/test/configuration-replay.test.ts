import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
import { defineStandardSchema } from '@brambodev/contracts'
import type { DriverFactory, EffectiveExecutionConfiguration, ExecutionRuntime, JsonObject, JsonValue, RunSnapshot } from '@brambodev/contracts'
import { openSqliteRunStore } from '@brambodev/workflow-store-sqlite'
import { createLocalArtifactProvider } from '@brambodev/workspace-artifacts-local'
import * as orchestration from '@brambodev/orchestration'
import { createWorkflowWorker } from '../src/index.ts'
import type { WorkflowWorkerOptions } from '../src/worker.ts'

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}'
}
async function fixture(executorVersion: string | undefined) {
  const root = await mkdtemp(join(tmpdir(), 'brambo-configured-replay-'))
  let store = await openSqliteRunStore({ path: join(root, 'run.sqlite') })
  let artifacts = createLocalArtifactProvider({ rootDir: join(root, 'artifacts'), store })
  const directory = join(root, 'source'); await mkdir(directory)
  const staged = await artifacts.stage('tenant', directory)
  const claimed = await store.claim('tenant', ['workspace:parent'], 'bootstrap', 10_000)
  if (claimed.status !== 'acquired') throw new Error('fixture')
  const workspace = { namespace: 'tenant', workspaceId: 'parent', revision: staged.revision }
  await artifacts.publish(workspace, staged, claimed.lease); await store.release(claimed.lease)
  const contract = { providerId: 'acme', requiresModel: true,
    configurationSchema: defineStandardSchema<JsonObject>(value => ({ value: value as JsonObject })),
    controls: [{ id: 'acme:deliberation', configurationKey: 'deliberation', schema: defineStandardSchema<JsonValue>(value => ({ value: value as JsonValue })) }] }
  const definition = { id: 'flow', version: '1', tasks: ['a', 'b'].map(id => ({ id, dependsOn: id === 'b' ? ['a'] : [],
    driverId: 'custom', configuration: null, execution: { model: 'model', configuration: { deliberation: 'deep' } }, prompt: id,
    required: [], optional: [], maxAttempts: 2 })) }
  const effective: EffectiveExecutionConfiguration = { version: 1, providerId: 'acme', model: 'model',
    ...(executorVersion === undefined ? {} : { executorVersion }), configuration: { deliberation: 'deep' }, extensions: [],
    support: [{ id: 'acme:deliberation', status: 'supported', version: 'support-1' }] }
  const snapshot: RunSnapshot = { schemaVersion: 1, key: { namespace: 'tenant', runId: 'run' }, revision: 0,
    workflowId: 'flow', workflowVersion: '1', sessionId: 'session', status: 'pending', workspace,
    tasks: definition.tasks.map(task => ({ taskId: task.id, attempt: 0, phase: 'pending' })), context: null, cancelRequested: false,
    executionConfigurations: definition.tasks.map(task => ({ taskId: task.id, driverId: 'custom', driverVersion: '1', configuration: effective })) }
  const command = { key: snapshot.key, clientId: 'client', idempotencyKey: 'start', kind: 'start' as const, payload: null }
  const actor = { namespace: 'tenant', subject: 'alice' }
  const driverRun = vi.fn<import('@brambodev/contracts').ExecutionDriver['run']>(async () => ({ result: { status: 'ok' as const, data: null, summary: 'done' } }))
  const manifest = { id: 'custom', version: '1', kind: 'custom' as const, capabilities: ['context-reconstruction'],
    configurationSchema: defineStandardSchema(value => ({ value })), configurationControls: contract }
  const create = vi.fn(async () => ({ manifest, run: driverRun }))
  const createConfigured = vi.fn<NonNullable<DriverFactory['createConfigured']>>(async () => ({ manifest, run: driverRun }))
  const factory: DriverFactory = { manifest, create, createConfigured }
  const registry = (version = '1', id = 'custom') => {
    const drivers = orchestration.createDriverRegistry(); drivers.register({ ...factory, manifest: { ...manifest, id, version } }); return drivers
  }
  const drivers = registry()
  const runtimeExecute = vi.fn<ExecutionRuntime['execute']>(async (driver, request, lease) => {
    const outcome = await driver.run({ ...request, workspace: { id: request.workspace.workspaceId, rootPath: directory, capabilities: [] } })
    return { outcome, workspace: request.workspace, staged, publicationLease: lease }
  })
  const runtime = { capabilities: ['context-reconstruction'], execute: runtimeExecute }
  const services = { authorizeReconstruction: async () => true, dispatchTool: vi.fn(), resolveSecret: vi.fn() }
  const version = vi.fn(() => executorVersion)
  const options = (): WorkflowWorkerOptions => ({ workerId: 'worker', principal: { namespace: 'tenant', subject: 'worker' },
    store, artifacts, runtime, drivers, definitions: { resolve: () => definition }, services, execute: orchestration.runDurableWorkflow,
    executorVersionForTask: version })
  const resolver = vi.fn(async () => ({ status: 'supported' as const, version: 'support-1' }))
  const defaults = vi.fn(() => ({ defaults: { model: 'model', configuration: { deliberation: 'shallow' } } }))
  const hostForTask = () => ({ contract, ...(executorVersion === undefined ? {} : { executorVersion }), resolver })
  async function checkpoint(driverId = 'custom') {
    const unconfigured = { ...snapshot }; delete unconfigured.executionConfigurations
    const admission = driverId === 'custom' ? await orchestration.admitConfiguredWorkflowRun({ store, snapshot: unconfigured,
      command, actor, definition, drivers, hostForTask, layersForTask: defaults }) :
      await store.create({ ...snapshot, executionConfigurations: snapshot.executionConfigurations!.map(entry => ({ ...entry, driverId })) }, command, actor)
    const seeded = (await store.get(snapshot.key))!
    if (admission.status !== 'accepted') throw new Error('fixture')
    const lease = await store.claim('tenant', ['run:run', 'workspace:parent'], 'seed', 30_000)
    if (lease.status !== 'acquired') throw new Error('fixture')
    const result = await store.commit({ expectedRevision: 0, lease: lease.lease, snapshot: { ...seeded, revision: 1,
      tasks: [{ taskId: 'a', attempt: 1, phase: 'succeeded', workspace, result: 'checkpoint' }, snapshot.tasks[1]!] },
      events: [{ type: 'workflow.definition', payload: { fingerprint: createHash('sha256').update(canonical({ definition, executionConfigurations: seeded.executionConfigurations })).digest('hex') } }] })
    if (result.status !== 'committed') throw new Error('fixture')
    await store.release(lease.lease); return result.snapshot.tasks[0]
  }
  async function reopen() {
    await store.close(); store = await openSqliteRunStore({ path: join(root, 'run.sqlite') })
    artifacts = createLocalArtifactProvider({ rootDir: join(root, 'artifacts'), store })
  }
  return { snapshot, command, actor, definition, contract, drivers, factory, effective, version, registry, checkpoint, reopen, options,
    create, createConfigured, runtimeExecute, driverRun, resolver, defaults, getStore: () => store,
    async close() { await store.close(); await rm(root, { recursive: true, force: true }) } }
}

test.each(['unchanged', 'raw-configuration', 'legacy-receipt'] as const)('first configured worker execution binds admission without a seeded definition event: %s', async reason => {
  const f = await fixture('executor-1')
  const drift = reason === 'raw-configuration'
  try {
    const snapshot = { ...f.snapshot }; delete snapshot.executionConfigurations
    const admission = reason === 'legacy-receipt' ? await f.getStore().create(f.snapshot, f.command, f.actor) :
      await orchestration.admitConfiguredWorkflowRun({ store: f.getStore(), snapshot, command: f.command, actor: f.actor,
      definition: f.definition, drivers: f.drivers, hostForTask: () => ({ contract: f.contract, executorVersion: 'executor-1', resolver: f.resolver }),
      layersForTask: () => ({}) })
    expect(admission.status).toBe('accepted')
    await f.reopen()
    expect((await f.getStore().events(snapshot.key, 0, 256)).events).toEqual([])
    f.resolver.mockClear().mockImplementation(() => { throw new Error('resolver must not execute') })
    const definition = drift ? { ...f.definition, tasks: f.definition.tasks.map(task => ({ ...task, configuration: { changed: true } })) } : f.definition
    const runtimeForTask = vi.fn(() => f.options().runtime)
    const running = createWorkflowWorker({ ...f.options(), definitions: { resolve: () => definition }, runtimeForTask }).runOnce(new AbortController().signal)
    if (drift) await expect(running).rejects.toThrow(/compatibility mismatch/)
    else expect(await running).toBe(true)
    expect((await f.getStore().get(snapshot.key))?.status).toBe(drift ? 'pending' : 'succeeded')
    expect(f.resolver).not.toHaveBeenCalled()
    if (drift) {
      if (admission.status === 'conflict') throw new Error('fixture')
      expect((await f.getStore().receipt('tenant', admission.receipt.id))?.phase).toBe('running')
      expect(f.createConfigured).not.toHaveBeenCalled(); expect(f.create).not.toHaveBeenCalled()
      expect(runtimeForTask).not.toHaveBeenCalled(); expect(f.runtimeExecute).not.toHaveBeenCalled(); expect(f.driverRun).not.toHaveBeenCalled()
      expect((await f.getStore().events(snapshot.key, 0, 256)).events.some(event => event.type === 'workflow.definition')).toBe(false)
    } else {
      expect(f.createConfigured).toHaveBeenCalledTimes(2); expect(f.driverRun).toHaveBeenCalledTimes(2)
    }
  } finally { await f.close() }
})

test('durable configuration replay does not reevaluate host defaults or resolver', async () => {
  const f = await fixture('executor-1')
  try {
    const checkpoint = await f.checkpoint(); await f.reopen()
    expect(f.resolver).toHaveBeenCalledTimes(2); expect(f.defaults).toHaveBeenCalledTimes(2)
    f.resolver.mockClear().mockImplementation(() => { throw new Error('resolver must not execute') })
    f.defaults.mockClear().mockImplementation(() => { throw new Error('defaults must not execute') })
    const worker = createWorkflowWorker(f.options())
    expect(await worker.runOnce(new AbortController().signal)).toBe(true)
    const current = (await f.getStore().get(f.snapshot.key))!
    expect(current.status).toBe('succeeded'); expect(current.tasks[0]).toEqual(checkpoint)
    expect(f.create).not.toHaveBeenCalled(); expect(f.createConfigured).toHaveBeenCalledTimes(1)
    expect(f.createConfigured.mock.calls[0]?.[1]).toEqual(f.effective)
    expect(f.runtimeExecute.mock.calls[0]?.[1].executionConfiguration).toEqual(f.effective)
    expect(f.driverRun.mock.calls[0]?.[0].executionConfiguration).toEqual(f.effective)
    expect(f.version).toHaveBeenCalledWith(f.definition.tasks[1])
    expect(f.resolver).not.toHaveBeenCalled(); expect(f.defaults).not.toHaveBeenCalled()
  } finally { await f.close() }
})

test.each(['driver-version', 'driver-id', 'executor-version', 'absent', 'invalid', 'throw'] as const)(
  'durable configuration replay refuses changed driver or executor versions: %s', async reason => {
    const f = await fixture('executor-1')
    try {
      await f.checkpoint(reason === 'driver-id' ? 'replacement' : 'custom'); await f.reopen()
      const runtimeForTask = vi.fn(() => f.options().runtime)
      const executorVersionForTask = reason === 'absent' ? undefined : reason === 'throw' ? () => { throw new Error('SECRET_CALLBACK_ERROR') } :
        reason === 'invalid' ? () => undefined : reason === 'executor-version' ? () => 'executor-2' : f.version
      const worker = createWorkflowWorker({ ...f.options(), drivers: reason === 'driver-version' ? f.registry('2') : f.drivers,
        executorVersionForTask, runtimeForTask })
      expect(await worker.runOnce(new AbortController().signal)).toBe(true)
      const snapshot = (await f.getStore().get(f.snapshot.key))!
      expect(snapshot.status).toBe('blocked'); expect(JSON.stringify(snapshot)).not.toContain('SECRET_CALLBACK_ERROR')
      expect(f.create).not.toHaveBeenCalled(); expect(f.createConfigured).not.toHaveBeenCalled()
      expect(f.runtimeExecute).not.toHaveBeenCalled(); expect(runtimeForTask).not.toHaveBeenCalled(); expect(f.driverRun).not.toHaveBeenCalled()
    } finally { await f.close() }
  })

test('durable configuration replay without an executor version needs no host version port', async () => {
  const f = await fixture(undefined)
  try {
    await f.checkpoint(); await f.reopen()
    expect(await createWorkflowWorker({ ...f.options(), executorVersionForTask: undefined }).runOnce(new AbortController().signal)).toBe(true)
    expect((await f.getStore().get(f.snapshot.key))?.status).toBe('succeeded')
    expect(f.createConfigured).toHaveBeenCalledTimes(1)
  } finally { await f.close() }
})

test.each(['controls', 'raw-configuration'] as const)('duplicate admission preserves configuration identity and changed %s conflict', async reason => {
  const f = await fixture('executor-1')
  const options = { store: f.getStore(), snapshot: { ...f.snapshot, executionConfigurations: undefined }, command: f.command, actor: f.actor,
    definition: f.definition, drivers: f.drivers, hostForTask: () => ({ contract: f.contract, executorVersion: 'executor-1',
      resolver: async () => ({ status: 'supported' as const, version: 'support-1' }) }), layersForTask: () => ({}) }
  delete options.snapshot.executionConfigurations
  try {
    expect((await orchestration.admitConfiguredWorkflowRun(options)).status).toBe('accepted')
    const admitted = (await f.getStore().get(f.snapshot.key))!
    expect((await orchestration.admitConfiguredWorkflowRun(options)).status).toBe('duplicate')
    const changed = reason === 'controls' ? { ...options, layersForTask: () => ({ run: { configuration: { deliberation: 'shallow' } } }) } :
      { ...options, definition: { ...f.definition, tasks: f.definition.tasks.map(task => ({ ...task, configuration: { changed: true } })) } }
    expect((await orchestration.admitConfiguredWorkflowRun(changed)).status).toBe('conflict')
    await f.reopen(); expect((await f.getStore().get(f.snapshot.key))?.executionConfigurations).toEqual(admitted.executionConfigurations)
  } finally { await f.close() }
})

test('duplicate admission treats omitted and undefined task controls as the same durable identity', async () => {
  const f = await fixture('executor-1')
  const snapshot = { ...f.snapshot }; delete snapshot.executionConfigurations
  const definition = { ...f.definition, tasks: f.definition.tasks.map(task => ({ ...task, execution: { model: 'model', configuration: {} } })) }
  const options = { store: f.getStore(), snapshot, command: f.command, actor: f.actor, definition, drivers: f.drivers,
    hostForTask: () => ({ contract: f.contract, executorVersion: 'executor-1', resolver: f.resolver }),
    layersForTask: () => ({ defaults: { configuration: { deliberation: 'deep' } } }) }
  try {
    const admitted = await orchestration.admitConfiguredWorkflowRun(options)
    expect(admitted.status).toBe('accepted')
    const explicit = { ...definition, tasks: definition.tasks.map(task => ({ ...task,
      execution: { providerId: undefined, model: 'model', extensions: undefined, configuration: { deliberation: undefined } } })) }
    const duplicate = await orchestration.admitConfiguredWorkflowRun({ ...options, definition: explicit as unknown as orchestration.WorkflowDefinition })
    expect(duplicate.status).toBe('duplicate')
    if (admitted.status === 'conflict' || duplicate.status === 'conflict') throw new Error('fixture')
    expect(duplicate.receipt).toEqual(admitted.receipt)
    await f.reopen()
    f.resolver.mockClear().mockImplementation(() => { throw new Error('replay must not resolve support') })
    const stored = (await f.getStore().get(f.snapshot.key))!
    expect(stored.executionConfigurations?.every(entry => entry.configuration.configuration['deliberation'] === 'deep')).toBe(true)
    // Worker consumes a normalized immutable definition, never the undefined-bearing input layer.
    expect(await createWorkflowWorker({ ...f.options(), definitions: { resolve: () => definition } }).runOnce(new AbortController().signal)).toBe(true)
    expect((await f.getStore().get(f.snapshot.key))?.status).toBe('succeeded')
    expect(f.resolver).not.toHaveBeenCalled()
  } finally { await f.close() }
})
