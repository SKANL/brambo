import { expect, test, vi } from 'vitest'
import { defineStandardSchema } from '@brambodev/contracts'
import type { DriverFactory, ExecutionControlHost, JsonObject, JsonValue, RunSnapshot } from '@brambodev/contracts'
import * as api from '../src/index.ts'
import { barrier, workflowFixture } from './helpers/workflow-fixture.ts'

async function fixture() {
  const f = await workflowFixture(false)
  const contract = { providerId: 'acme', requiresModel: true,
    configurationSchema: defineStandardSchema<JsonObject>(value => ({ value: value as JsonObject })),
    controls: [{ id: 'acme:deliberation', configurationKey: 'deliberation',
      schema: defineStandardSchema<JsonValue>(value => ({ value: value as JsonValue })) }] }
  const create = vi.fn(), createConfigured = vi.fn()
  const factory: DriverFactory = { manifest: { id: 'driver', version: '1', kind: 'custom', capabilities: [],
    configurationSchema: defineStandardSchema(value => value === null ? { value } : { issues: [{ message: 'invalid' }] }),
    configurationControls: contract }, create, createConfigured }
  const drivers = api.createDriverRegistry(); drivers.register(factory)
  const definition = { ...f.definition, tasks: f.definition.tasks.map(task => ({ ...task,
    execution: { model: 'model', configuration: { deliberation: 'deep' } } })) }
  const snapshot: RunSnapshot = { ...f.snapshot, tasks: definition.tasks.map(task => ({ taskId: task.id, phase: 'pending', attempt: 0 })) }
  const host: ExecutionControlHost = { contract, resolver: vi.fn(async () => ({ status: 'supported' as const, version: 'support-1' })) }
  const options = { store: f.store, snapshot, command: { key: f.key, clientId: 'host', idempotencyKey: 'start', kind: 'start' as const, payload: null },
    actor: f.principal, definition, drivers, hostForTask: () => host, layersForTask: () => ({}) }
  return { f, options, host, factory, create, createConfigured }
}

test('configured admission persists resolved controls before any command is visible', async () => {
  const { f, options, host, createConfigured } = await fixture()
  const waiting = barrier(), entered = barrier()
  const resolver = vi.fn(async () => { entered.release(); await waiting.promise; return { status: 'supported' as const, version: 'support-1' } })
  const create = vi.spyOn(f.store, 'create'), admit = vi.spyOn(f.store, 'admit')
  try {
    const admitted = api.admitConfiguredWorkflowRun({ ...options, hostForTask: () => ({ ...host, resolver }) })
    await entered.promise
    expect(create).not.toHaveBeenCalled(); expect(await f.store.pending('tenant', 10)).toEqual([])
    waiting.release()
    expect((await admitted).status).toBe('accepted')
    const [snapshot, command] = create.mock.calls[0]!
    expect(snapshot.executionConfigurations?.[0]).toMatchObject({ taskId: 'a', driverId: 'driver', driverVersion: '1',
      configuration: { configuration: { deliberation: 'deep' }, support: [{ id: 'acme:deliberation', status: 'supported', version: 'support-1' }] } })
    expect(command.payload).toMatchObject({ intent: null, executionConfigurationFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) })
    expect(Object.isFrozen(snapshot.executionConfigurations?.[0]?.configuration.configuration)).toBe(true)
    expect(create).toHaveBeenCalledTimes(1); expect(admit).not.toHaveBeenCalled(); expect(createConfigured).not.toHaveBeenCalled()
    await f.store.close(); const reopened = await f.reopen()
    expect((await reopened.get(f.key))?.executionConfigurations).toEqual(snapshot.executionConfigurations)
    await reopened.close()
  } finally { waiting.release(); await f.close() }
})

test('first configured engine execution rejects admission definition drift before any commit', async () => {
  const { f, options } = await fixture()
  let reopened: typeof f.store | undefined
  try {
    expect((await api.admitConfiguredWorkflowRun(options)).status).toBe('accepted')
    await f.store.close(); reopened = await f.reopen()
    expect((await reopened.events(f.key, 0, 256)).events).toEqual([])
    const commit = vi.spyOn(reopened, 'commit').mockRejectedValue(new Error('Unexpected workflow mutation')), prepareTask = vi.fn(), executeTask = vi.fn()
    const definition = { ...options.definition, tasks: options.definition.tasks.map(task => ({ ...task, configuration: { changed: true } })) }
    await expect(api.runDurableWorkflow({ ...f, store: reopened, definition, prepareTask, executeTask })).rejects.toThrow(/compatibility mismatch/)
    expect(commit).not.toHaveBeenCalled(); expect(prepareTask).not.toHaveBeenCalled(); expect(executeTask).not.toHaveBeenCalled()
  } finally { await reopened?.close(); await f.close() }
})

test.each(['unsupported', 'legacy', 'snapshot', 'legacy-schema', 'provider', 'driver'] as const)(
  'configured admission rejection performs zero store mutation or driver creation: %s', async reason => {
    const { f, options, host, factory, create, createConfigured } = await fixture()
    const createStore = vi.spyOn(f.store, 'create'), admit = vi.spyOn(f.store, 'admit')
    const drivers = api.createDriverRegistry()
    drivers.register(reason === 'legacy' ? { manifest: factory.manifest, create } : factory)
    const definition = reason === 'legacy-schema' ? { ...options.definition, tasks: options.definition.tasks.map(task => ({ ...task, configuration: 9 })) } : options.definition
    try {
      await expect(api.admitConfiguredWorkflowRun({ ...options, drivers: reason === 'driver' ? { ...drivers, resolve: () => ({ ...drivers.resolve('driver'), manifest: { ...factory.manifest, id: 'wrong-driver' } }) } : drivers, definition,
        snapshot: reason === 'snapshot' ? { ...options.snapshot, revision: -1 } : options.snapshot,
        hostForTask: () => reason === 'unsupported' ? { ...host, resolver: async () => ({ status: 'unsupported', version: '1' }) } :
          reason === 'provider' ? { ...host, contract: { ...host.contract, providerId: 'other' } } : host })).rejects.toThrow()
      expect(createStore).not.toHaveBeenCalled(); expect(admit).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled(); expect(createConfigured).not.toHaveBeenCalled()
    } finally { await f.close() }
  })

test('configured admission leaves legacy tasks and command payloads unchanged', async () => {
  const { f, options } = await fixture()
  const definition = f.definition, hostForTask = vi.fn(), layersForTask = vi.fn(), create = vi.spyOn(f.store, 'create')
  try {
    expect((await api.admitConfiguredWorkflowRun({ ...options, definition, hostForTask, layersForTask })).status).toBe('accepted')
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('executionConfigurations')
    expect(create.mock.calls[0]?.[1]).toEqual(options.command)
    expect(hostForTask).not.toHaveBeenCalled(); expect(layersForTask).not.toHaveBeenCalled()
  } finally { await f.close() }
})

test.each(['configuration', 'empty', 'task'] as const)(
  'configured admission omits optional undefined before durable validation: %s', async mode => {
    const { f, options, host } = await fixture()
    const create = vi.spyOn(f.store, 'create'), waiting = barrier(), entered = barrier()
    const omitted = mode === 'task' ? f.definition : { ...options.definition, tasks: options.definition.tasks.map(task => ({ ...task,
      execution: mode === 'empty' ? {} : { model: 'model', configuration: {} } })) }
    const explicit = { ...omitted, tasks: omitted.tasks.map(task => ({ ...task, execution: mode === 'task' ? undefined :
      mode === 'empty' ? { providerId: undefined, model: undefined, configuration: undefined, extensions: undefined } :
        { providerId: undefined, model: 'model', extensions: undefined, configuration: { deliberation: undefined } } })) }
    const layersForTask = () => ({ defaults: { model: 'model', configuration: { deliberation: 'deep' } } })
    try {
      expect((await api.admitConfiguredWorkflowRun({ ...options, definition: omitted, layersForTask })).status).toBe('accepted')
      const resolver = vi.fn(async () => { entered.release(); await waiting.promise; return { status: 'supported' as const, version: 'support-1' } })
      const admitted = api.admitConfiguredWorkflowRun({ ...options, definition: explicit as unknown as api.WorkflowDefinition, layersForTask,
        hostForTask: () => ({ ...host, resolver }) })
      if (mode !== 'task') {
        // Race rejection against the resolver-entry barrier: fail directly rather than hang on a missing normalization.
        expect(await Promise.race([entered.promise.then(() => 'entered'), admitted.then(() => 'resolved', () => 'rejected')])).toBe('entered')
        expect(create).toHaveBeenCalledTimes(1)
      }
      waiting.release()
      expect((await admitted).status).toBe('conflict') // The private single-run file fixture always conflicts on a second create.
      expect(create.mock.calls[1]?.[1]).toEqual(create.mock.calls[0]?.[1])
      expect(create.mock.calls[1]?.[0]).toEqual(create.mock.calls[0]?.[0])
    } finally { waiting.release(); await f.close() }
  })

test.each(['unknown', 'accessor', 'nested'] as const)(
  'configured admission rejects invalid undefined data without reading accessors: %s', async mode => {
    const { f, options } = await fixture(), getter = vi.fn(() => undefined)
    const configuration = mode === 'unknown' ? { unknown: undefined } : mode === 'nested' ? { deliberation: { nested: undefined } } :
      Object.defineProperty({}, 'deliberation', { enumerable: true, get: getter })
    const definition = { ...options.definition, tasks: options.definition.tasks.map(task => ({ ...task,
      execution: { model: 'model', configuration } })) }
    const create = vi.spyOn(f.store, 'create'), admit = vi.spyOn(f.store, 'admit')
    try {
      await expect(api.admitConfiguredWorkflowRun({ ...options, definition })).rejects.toThrow()
      expect(getter).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled(); expect(admit).not.toHaveBeenCalled()
    } finally { await f.close() }
  })
