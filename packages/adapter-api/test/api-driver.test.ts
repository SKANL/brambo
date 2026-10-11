import { describe, expect, it, vi } from 'vitest'
import { defineStandardSchema } from '@brambodev/contracts'
import type { DriverManifest, DriverRequest, DriverServices, EffectiveExecutionConfiguration, ExecutionControlContract, ExecutorAdapter, JsonObject, JsonValue, ToolCall } from '@brambodev/contracts'
import * as adapterApi from '../src/index.ts'
import { createApiDriverFactory } from '../src/index.ts'

const manifest: DriverManifest = {
  id: 'custom-api',
  version: '1.0.0',
  kind: 'api',
  capabilities: ['context-reconstruction'],
  configurationSchema: defineStandardSchema((value) => ({ value })),
}

const request: DriverRequest = {
  key: { namespace: 'tenant', runId: 'run-1' },
  sessionId: 'session-1',
  taskId: 'task-1',
  prompt: 'Continue the task',
  workspace: { id: 'workspace-1', rootPath: '/workspace', capabilities: ['read', 'write'] },
  context: { prior: 'durable event' },
  continuation: 'reconstructed',
  signal: new AbortController().signal,
}

describe('generic API driver composition', () => {
  it('exports the generic composition without vendor-specific branching', () => {
    expect(adapterApi).toHaveProperty('createApiDriverFactory', expect.any(Function))
  })

  it('injects durable driver services into a custom API adapter and preserves tool identity and signal', async () => {
    const call: ToolCall = { id: 'provider-call-1', toolId: 'file.read', arguments: { path: 'package.json' } }
    const dispatchTool = vi.fn(async (received: ToolCall, signal: AbortSignal) => {
      expect(signal).toBe(request.signal)
      const path = received.arguments['path']
      return { path: typeof path === 'string' ? path : null }
    })
    const services: DriverServices = { dispatchTool, resolveSecret: async () => 'secret' }
    let receivedPrompt: string | undefined
    let receivedWorkspace: DriverRequest['workspace'] | undefined
    let receivedSignal: AbortSignal | undefined
    const createAdapter = vi.fn((_configuration: unknown, injected: DriverServices): ExecutorAdapter => ({
      run: async (input) => {
        receivedPrompt = input.prompt
        receivedWorkspace = input.workspace
        receivedSignal = input.signal
        await injected.dispatchTool(call, input.signal ?? request.signal)
        return { status: 'ok', data: { callId: call.id }, summary: 'completed' }
      },
    }))
    const factory = createApiDriverFactory({ manifest, createAdapter })
    const driver = await factory.create({ profile: 'custom' }, services)

    await expect(driver.run(request)).resolves.toMatchObject({ result: { status: 'ok' } })
    expect(createAdapter).toHaveBeenCalledWith({ profile: 'custom' }, services)
    expect(receivedPrompt).toContain('Continue the task')
    expect(receivedPrompt).toContain('durable event')
    expect(receivedWorkspace).toBe(request.workspace)
    expect(receivedSignal).toBe(request.signal)
    expect(dispatchTool).toHaveBeenCalledTimes(1)
    expect(dispatchTool).toHaveBeenCalledWith(call, request.signal)
  })

  it('rejects a non-API manifest before adapter construction', () => {
    const createAdapter = vi.fn((): ExecutorAdapter => ({
      run: async () => ({ status: 'ok' as const, data: null, summary: 'ok' }),
    }))
    expect(() => createApiDriverFactory({ manifest: { ...manifest, kind: 'cli' }, createAdapter })).toThrow(/api/i)
    expect(createAdapter).not.toHaveBeenCalled()
  })

  it('does not claim native continuation without a binding-aware adapter contract', () => {
    const createAdapter = vi.fn((): ExecutorAdapter => ({ run: async () => ({ status: 'ok' as const, data: null, summary: 'ok' }) }))
    expect(() => createApiDriverFactory({ manifest: { ...manifest, capabilities: ['native-continuation'] }, createAdapter })).toThrow(/binding-aware/i)
    expect(createAdapter).not.toHaveBeenCalled()
  })

  it('snapshots advertised capabilities before exposing the registered factory', () => {
    const capabilities = ['context-reconstruction']
    const createAdapter = vi.fn((): ExecutorAdapter => ({ run: async () => ({ status: 'ok' as const, data: null, summary: 'ok' }) }))
    const factory = createApiDriverFactory({ manifest: { ...manifest, capabilities }, createAdapter })
    capabilities.push('native-continuation')

    expect(factory.manifest.capabilities).toEqual(['context-reconstruction'])
  })

  it('requires reconstruction capability before composing durable context', async () => {
    const createAdapter = vi.fn((): ExecutorAdapter => ({ run: async () => ({ status: 'ok' as const, data: null, summary: 'ok' }) }))
    const factory = createApiDriverFactory({ manifest: { ...manifest, capabilities: [] }, createAdapter })
    const driver = await factory.create({}, { dispatchTool: async () => null, resolveSecret: async () => 'secret' })

    await expect(driver.run(request)).rejects.toThrow(/context reconstruction.*unavailable/i)
    expect(createAdapter).toHaveBeenCalledTimes(1)
  })
})

const controls: ExecutionControlContract = {
  providerId: 'acme-api', requiresModel: true,
  configurationSchema: defineStandardSchema<JsonObject>(value => ({ value: value as JsonObject })),
  controls: [{ id: 'acme:deliberation', configurationKey: 'deliberation', schema: defineStandardSchema<JsonValue>(value => ({ value: value as JsonValue })) }],
}
const effective: EffectiveExecutionConfiguration = { version: 1, providerId: 'acme-api', model: 'fixture-model', configuration: { deliberation: 'deep' }, extensions: [], support: [{ id: 'acme:deliberation', status: 'supported', version: 'fixture-v1' }] }
const services: DriverServices = { dispatchTool: async () => null, resolveSecret: async () => 'fixture' }

describe('configured API driver', () => {
  it('binds validated legacy configuration and forwards frozen controls without a run override', async () => {
    let received: import('@brambodev/contracts').RunRequest | undefined
    const run = vi.fn(async (input) => { received = input; return { status: 'ok' as const, data: null, summary: 'ok' } })
    const configuredAdapter = vi.fn(async () => ({ run }))
    const factory = createApiDriverFactory({ manifest: { ...manifest, configurationSchema: defineStandardSchema(() => ({ value: { normalized: true } })) }, createAdapter: () => ({ run }), configurationControls: controls, createConfiguredAdapter: configuredAdapter })
    expect(factory.createConfigured).toBeTypeOf('function')
    expect(factory.manifest.configurationControls?.providerId).toBe('acme-api')
    const driver = await factory.createConfigured!({ raw: true }, effective, services)
    await driver.run(request)
    expect(configuredAdapter).toHaveBeenCalledWith({ normalized: true }, effective, services)
    expect(received?.executionConfiguration).toEqual(effective)
    expect(Object.isFrozen(received?.executionConfiguration?.configuration)).toBe(true)
    await driver.run({ ...request, executionConfiguration: { ...effective, configuration: { deliberation: 'deep' } } })
    await expect(driver.run({ ...request, executionConfiguration: { ...effective, model: 'different' } })).rejects.toThrow()
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('rejects configured option pairs and conflicting manifest contracts before construction', () => {
    const createAdapter = vi.fn(() => ({ run: async () => ({ status: 'ok' as const, data: null, summary: 'ok' }) }))
    expect(() => createApiDriverFactory({ manifest, createAdapter, configurationControls: controls })).toThrow()
    expect(() => createApiDriverFactory({ manifest, createAdapter, createConfiguredAdapter: createAdapter })).toThrow()
    expect(() => createApiDriverFactory({ manifest: { ...manifest, configurationControls: { ...controls, providerId: 'foreign' } }, createAdapter, configurationControls: controls, createConfiguredAdapter: createAdapter })).toThrow()
    expect(createAdapter).not.toHaveBeenCalled()
    expect(createApiDriverFactory({ manifest, createAdapter }).createConfigured).toBeUndefined()
  })

  it('rejects configured schema normalization and invalid legacy configuration before adapter creation', async () => {
    const createAdapter = vi.fn(() => ({ run: async () => ({ status: 'ok' as const, data: null, summary: 'ok' }) }))
    const factory = createApiDriverFactory({ manifest, createAdapter, configurationControls: { ...controls, configurationSchema: defineStandardSchema(() => ({ value: { deliberation: 'changed' } })) }, createConfiguredAdapter: createAdapter })
    expect(factory.createConfigured).toBeTypeOf('function')
    await expect(factory.createConfigured!({}, effective, services)).rejects.toThrow()
    const invalid = createApiDriverFactory({ manifest: { ...manifest, configurationSchema: defineStandardSchema(() => ({ issues: [{ message: 'invalid' }] })) }, createAdapter, configurationControls: controls, createConfiguredAdapter: createAdapter })
    await expect(invalid.createConfigured!({}, effective, services)).rejects.toThrow()
    expect(createAdapter).not.toHaveBeenCalled()
  })
})

it('configured request rejects control accessors without evaluating or dispatching them', async () => {
  const run = vi.fn(async () => ({ status: 'ok' as const, data: null, summary: 'ok' }))
  const createAdapter = () => ({ run })
  const factory = createApiDriverFactory({ manifest, createAdapter, configurationControls: controls, createConfiguredAdapter: createAdapter })
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

it.each([false, true])('legacy API construction rejects run controls even when configured-capable: %s', async capable => {
  const run = vi.fn(async () => ({ status: 'ok' as const, data: null, summary: 'ok' }))
  const createAdapter = () => ({ run })
  const factory = createApiDriverFactory({ manifest, createAdapter,
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
