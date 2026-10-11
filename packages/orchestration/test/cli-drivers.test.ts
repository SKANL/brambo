import { describe, expect, it, vi } from 'vitest'
import type { DriverRequest, DriverServices, EffectiveExecutionConfiguration, ExecutionControlContract, ExecutorAdapter, JsonObject, JsonValue, RunRequest } from '@brambodev/contracts'
import { defineStandardSchema, runExecutorContractSuite } from '@brambodev/contracts'
import * as orchestration from '../src/index.ts'
import { createCliDriverFactory, createDriverRegistry, negotiateCapabilities } from '../src/index.ts'

it('exposes injected CLI driver creation', () => {
  expect(orchestration).toHaveProperty('createCliDriverFactory', expect.any(Function))
})

const services: DriverServices = {
  dispatchTool: async () => { throw new Error('not used') },
  resolveSecret: async () => { throw new Error('not used') },
}
const request: DriverRequest = {
  key: { namespace: 'test', runId: 'run-1' }, sessionId: 'session-1', taskId: 'task-1',
  prompt: 'already reconstructed authorized prompt', context: { private: 'must not append' },
  workspace: { id: 'workspace-1', rootPath: '/private-workspace', capabilities: ['read', 'write'] },
  continuation: 'fresh', signal: new AbortController().signal,
}
const cancelled = { status: 'cancelled' as const, data: null, summary: 'cancelled', errors: [{ message: 'aborted' }] }
function cancellableAdapter(): ExecutorAdapter {
  return { run: async ({ signal }) => {
    await Promise.resolve()
    return signal?.aborted ? cancelled : { status: 'ok', data: { nativeId: 'not-a-binding' }, summary: 'completed' }
  } }
}
async function registeredDriver(id: 'claude-code' | 'codex' | 'opencode', createAdapter = cancellableAdapter) {
  const registry = createDriverRegistry()
  registry.register(createCliDriverFactory({ id, createAdapter }))
  return registry.resolve(id).create({}, services)
}

describe('injected CLI drivers', () => {
  it.each(['claude-code', 'codex', 'opencode'] as const)('forwards a fresh prompt to %s without context, argv or identity invention', async (id) => {
    let received: RunRequest | undefined
    const driver = await registeredDriver(id, () => ({ run: async (input) => {
      received = input
      return { status: 'ok', data: { nativeId: 'provider-session' }, summary: 'completed' }
    } }))
    const outcome = await driver.run(request)
    expect(received).toEqual({ prompt: 'already reconstructed authorized prompt', workspace: request.workspace, signal: request.signal })
    expect(outcome).toEqual({ result: { status: 'ok', data: { nativeId: 'provider-session' }, summary: 'completed' } })
    expect(driver.manifest.kind).toBe('cli')
  })

  it('does not infer interception, streaming or native continuation from a CLI identity', async () => {
    const driver = await registeredDriver('codex')
    expect(negotiateCapabilities({ driver: driver.manifest, runtime: ['streaming', 'tool-interception', 'native-continuation', 'context-reconstruction'], policy: ['streaming', 'tool-interception', 'native-continuation', 'context-reconstruction'], required: [], optional: ['streaming', 'tool-interception', 'native-continuation', 'context-reconstruction'] })).toEqual({ effective: ['context-reconstruction'], degraded: ['streaming', 'tool-interception', 'native-continuation'] })
  })

  it('refuses unsupported native continuation without invoking the adapter', async () => {
    let executions = 0
    const driver = await registeredDriver('claude-code', () => ({ run: async () => { executions++; return cancelled } }))
    await expect(driver.run({ ...request, continuation: 'native' })).rejects.toThrow(/native continuation.*unsupported/)
    expect(executions).toBe(0)
  })

  it('returns cancellation for an already aborted request without invoking the adapter', async () => {
    let executions = 0
    const driver = await registeredDriver('opencode', () => ({ run: async () => { executions++; return cancelled } }))
    const controller = new AbortController()
    controller.abort('secret-canary')
    expect((await driver.run({ ...request, signal: controller.signal })).result.status).toBe('cancelled')
    expect(executions).toBe(0)
  })

  it('propagates live abort and preserves the adapter cancellation envelope', async () => {
    const driver = await registeredDriver('codex')
    const controller = new AbortController()
    const pending = driver.run({ ...request, signal: controller.signal })
    controller.abort()
    expect((await pending).result).toEqual(cancelled)
  })

  it('does not turn an aborted signal into fabricated termination proof', async () => {
    const driver = await registeredDriver('codex', () => ({ run: async () => { await Promise.resolve(); return { status: 'ok', data: null, summary: 'already completed' } } }))
    const controller = new AbortController()
    const pending = driver.run({ ...request, signal: controller.signal })
    controller.abort()
    expect((await pending).result.status).toBe('ok')
  })

  it('refuses malformed adapter results', async () => {
    const driver = await registeredDriver('codex', () => ({ run: async () => ({ status: 'cancelled', summary: 'missing required fields' }) } as unknown as ExecutorAdapter))
    await expect(driver.run(request)).rejects.toThrow(/schema violation/)
  })

  it('refuses nonempty configuration before constructing the injected adapter', async () => {
    let constructions = 0
    const registry = createDriverRegistry()
    registry.register(createCliDriverFactory({ id: 'codex', createAdapter: () => { constructions++; return cancellableAdapter() } }))
    await expect(registry.resolve('codex').create({ secret: 'secret-canary' }, services)).rejects.toThrow(/invalid driver configuration/)
    expect(constructions).toBe(0)
  })

  it('keeps the existing executor contract unchanged', async () => {
    expect((await runExecutorContractSuite(cancellableAdapter())).passed).toBe(true)
  })
})

it('delivers authorized reconstructed context through CLI prompt composition', async () => {
  let received: RunRequest | undefined
  const driver = await registeredDriver('codex', () => ({ run: async input => { received = input; return { status: 'ok', data: null, summary: 'done' } } }))
  await driver.run({ ...request, continuation: 'reconstructed', prompt: 'current task', context: { ref: { revision: 'durable-revision' }, events: ['prior-task-completed'] } })
  expect(received?.prompt).toContain('current task')
  expect(received?.prompt).toContain('durable-revision')
  expect(received?.prompt).toContain('prior-task-completed')
  expect(received?.prompt).not.toContain('nativeSessionId')
})

const controls: ExecutionControlContract = { providerId: 'fixture-cli', requiresModel: false,
  configurationSchema: defineStandardSchema<JsonObject>(value => ({ value: value as JsonObject })),
  controls: [{ id: 'fixture:deliberation', configurationKey: 'deliberation', schema: defineStandardSchema<JsonValue>(value => ({ value: value as JsonValue })) }],
}
const effective: EffectiveExecutionConfiguration = { version: 1, providerId: 'fixture-cli', configuration: { deliberation: 'deep' }, extensions: [], support: [{ id: 'fixture:deliberation', status: 'supported', version: 'fixture-v1' }] }

it('configured CLI factory preserves zero-argument legacy path and binds controls through registration', async () => {
  const run = vi.fn<ExecutorAdapter['run']>(async () => ({ status: 'ok' as const, data: null, summary: 'ok' }))
  const legacyAdapter = vi.fn(() => ({ run })), configuredAdapter = vi.fn(async () => ({ run }))
  const registry = createDriverRegistry()
  registry.register(createCliDriverFactory({ id: 'codex', createAdapter: legacyAdapter, configurationControls: controls, createConfiguredAdapter: configuredAdapter }))
  const factory = registry.resolve('codex')
  await factory.create({}, services)
  expect(legacyAdapter).toHaveBeenCalledWith()
  expect(factory.createConfigured).toBeTypeOf('function')
  const driver = await factory.createConfigured!({}, effective, services)
  expect(configuredAdapter).toHaveBeenCalledWith({}, effective, services)
  await driver.run(request)
  expect(run).toHaveBeenCalledWith(expect.objectContaining({ executionConfiguration: effective }))
  run.mockClear()
  await expect(driver.run({ ...request, executionConfiguration: { ...effective, providerId: 'foreign' } })).rejects.toThrow()
  expect(run).not.toHaveBeenCalled()
  await expect(factory.createConfigured!({ unsafe: true }, effective, services)).rejects.toThrow()
  expect(configuredAdapter).toHaveBeenCalledTimes(1)
})

it('configured CLI options require a pair and reject control schema transformations before construction', async () => {
  const createAdapter = vi.fn(cancellableAdapter)
  expect(() => createCliDriverFactory({ id: 'codex', createAdapter, configurationControls: controls })).toThrow()
  expect(() => createCliDriverFactory({ id: 'codex', createAdapter, createConfiguredAdapter: createAdapter })).toThrow()
  const factory = createCliDriverFactory({ id: 'codex', createAdapter, configurationControls: { ...controls, configurationSchema: defineStandardSchema(() => ({ value: { deliberation: 'changed' } })) }, createConfiguredAdapter: createAdapter })
  expect(factory.createConfigured).toBeTypeOf('function')
  await expect(factory.createConfigured!({}, effective, services)).rejects.toThrow()
  expect(createAdapter).not.toHaveBeenCalled()
})

it('configured request rejects control accessors without evaluating or dispatching them', async () => {
  const run = vi.fn(async () => ({ status: 'ok' as const, data: null, summary: 'ok' }))
  const createAdapter = () => ({ run })
  const factory = createCliDriverFactory({ id: 'codex', createAdapter, configurationControls: controls, createConfiguredAdapter: createAdapter })
  const driver = await factory.createConfigured!({}, effective, services)
  await driver.run(request)
  expect(run).toHaveBeenCalledTimes(1)
  run.mockClear()
  const getter = vi.fn(() => { throw new Error('synthetic-secret') })
  const input = Object.defineProperty({ ...request }, 'executionConfiguration', { enumerable: true, get: getter })
  const pending = driver.run(input)
  await expect(pending).rejects.toThrow()
  await expect(pending).rejects.not.toThrow(/synthetic-secret/)
  expect(getter).not.toHaveBeenCalled()
  expect(run).not.toHaveBeenCalled()
})

it.each([false, true])('legacy CLI construction rejects run controls even when configured-capable: %s', async capable => {
  const run = vi.fn(async () => ({ status: 'ok' as const, data: null, summary: 'ok' }))
  const createAdapter = () => ({ run })
  const factory = createCliDriverFactory({ id: 'codex', createAdapter,
    ...(capable ? { configurationControls: controls, createConfiguredAdapter: createAdapter } : {}) })
  const driver = await factory.create({}, services)
  await driver.run(request)
  expect(run).toHaveBeenCalledTimes(1)
  run.mockClear()
  await expect(driver.run({ ...request, executionConfiguration: effective })).rejects.toThrow()
  await driver.run({ ...request, executionConfiguration: undefined })
  expect(run).toHaveBeenCalledTimes(1)
  run.mockClear()
  const getter = vi.fn(() => { throw new Error('synthetic-secret') })
  await expect(driver.run(Object.defineProperty({ ...request }, 'executionConfiguration', { enumerable: true, get: getter }))).rejects.toThrow()
  expect(getter).not.toHaveBeenCalled()
  expect(run).not.toHaveBeenCalled()
})
