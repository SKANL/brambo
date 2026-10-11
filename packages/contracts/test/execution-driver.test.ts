import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { validateDriverManifest, DRIVER_MANIFEST_SCHEMA } from '../src/execution-driver.ts'
import { defineStandardSchema } from '../src/standard-schema.ts'
import * as contracts from '../src/index.ts'
import * as suite from '../src/contract-suite/index.ts'
import { runDriverContractSuite, type ExecutionDriver, type DriverRequest, type DriverFactory, type DriverServices } from '../src/index.ts'

it('exports the public execution driver conformance suite from both entry points', () => {
  expect(contracts).toHaveProperty('runDriverContractSuite', expect.any(Function))
  expect(suite).toHaveProperty('runDriverContractSuite', expect.any(Function))
})

const request: DriverRequest = {
  key: { namespace: 'test', runId: 'run-1' }, sessionId: 'session-1', taskId: 'task-1', prompt: 'contract probe',
  context: null, workspace: { id: 'workspace-1', rootPath: '/contract-probe', capabilities: ['read'] },
  continuation: 'fresh', signal: new AbortController().signal,
}
function conforming(capabilities: readonly string[] = ['cancellation']): ExecutionDriver {
  return { manifest: { ...manifest, kind: 'custom', capabilities }, run: async ({ signal }) => {
    await Promise.resolve()
    return { result: signal.aborted
      ? { status: 'cancelled', data: null, summary: 'cancelled', errors: [{ message: 'aborted' }] }
      : { status: 'ok', data: { output: true }, summary: 'completed' } }
  } }
}

describe('public driver behavioral conformance', () => {
  it('accepts a custom driver with cancellation but without any CLI implementation', async () => {
    expect((await runDriverContractSuite(conforming(), request)).passed).toBe(true)
  })
  it('names a malformed result envelope violation', async () => {
    const broken = { ...conforming([]), run: async () => ({ result: { status: 'failed', data: null, summary: 'missing errors' } }) } as ExecutionDriver
    const report = await runDriverContractSuite(broken, request)
    expect(report.passed).toBe(false)
    expect(report.violations.map((entry) => entry.clause)).toContain('driver-outcome-conformance')
  })
  it('names a synchronous run violation instead of accepting a nonpromise outcome', async () => {
    const broken = { ...conforming([]), run: () => ({ result: { status: 'ok', data: null, summary: 'sync' } }) } as unknown as ExecutionDriver
    const report = await runDriverContractSuite(broken, request)
    expect(report.violations.map((entry) => entry.clause)).toContain('driver-outcome-conformance')
  })
  it('names cancellation violation when an advertised driver ignores abort', async () => {
    const broken: ExecutionDriver = { ...conforming(), run: async () => ({ result: { status: 'ok', data: null, summary: 'ignores abort' } }) }
    const report = await runDriverContractSuite(broken, request)
    expect(report.violations.map((entry) => entry.clause)).toContain('driver-cancellation')
  })
  it('accepts completion before abort while probing cancellation with a pre-aborted signal', async () => {
    const fast: ExecutionDriver = { ...conforming(), run: ({ signal }) => Promise.resolve({
      result: signal.aborted
        ? { status: 'cancelled', data: null, summary: 'cancelled before execution', errors: [{ message: 'aborted' }] }
        : { status: 'ok', data: { output: true }, summary: 'already completed' },
    }) }
    const controller = new AbortController()
    const completed = fast.run({ ...request, signal: controller.signal })
    controller.abort()
    expect((await completed).result.status).toBe('ok')

    const report = await runDriverContractSuite(fast, request)
    expect(report.violations).toEqual([])
    expect(report.passed).toBe(true)
  })
  it('does not require or probe cancellation for an undeclared capability', async () => {
    let sawAbort = false
    const limited: ExecutionDriver = { ...conforming([]), run: async ({ signal }) => {
      sawAbort ||= signal.aborted
      return { result: { status: 'ok', data: null, summary: 'limited' } }
    } }
    const report = await runDriverContractSuite(limited, request)
    expect(report.passed).toBe(true)
    expect(sawAbort).toBe(false)
    expect(report.outcomes.find((entry) => entry.clause === 'driver-cancellation')?.detail).toMatch(/not advertised/)
  })
  it('reports invalid manifests even when subsequent execution succeeds', async () => {
    const driver = { ...conforming([]), manifest: { ...manifest, kind: 'invalid' } } as unknown as ExecutionDriver
    const report = await runDriverContractSuite(driver, request)
    expect(report.violations.map((entry) => entry.clause)).toContain('driver-manifest-conformance')
  })
  it('bounds an unresolved execution with a named timeout', async () => {
    const driver: ExecutionDriver = { ...conforming([]), run: () => new Promise(() => {}) }
    const report = await runDriverContractSuite(driver, request, { timeoutMs: 5 })
    expect(report.violations.map((entry) => entry.clause)).toContain('driver-outcome-conformance (timeout)')
  })
})

const manifest = { id: 'driver-1', version: '1.0.0', kind: 'custom', capabilities: ['streaming', 'acme:resume'], configurationSchema: defineStandardSchema((value) => ({ value })) }

describe('provider-agnostic driver manifests', () => {
  it('returns owned manifest controls without evaluating a proxy control get', () => {
    const configurationControls = { providerId: 'acme-api', requiresModel: false, configurationSchema: manifest.configurationSchema,
      controls: [{ id: 'acme:deliberation', schema: manifest.configurationSchema }] }
    const get = vi.fn((target: object, key: PropertyKey) => {
      if (key === 'configurationControls') throw new Error('synthetic-secret')
      return Reflect.get(target, key)
    })
    const input = new Proxy({ ...manifest, configurationControls }, { get })
    expect(validateDriverManifest(input)).toHaveProperty('configurationControls', configurationControls)
    expect(DRIVER_MANIFEST_SCHEMA['~standard'].validate(input)).toHaveProperty('value.configurationControls', configurationControls)
    expect(get.mock.calls.some(([, key]) => key === 'configurationControls')).toBe(false)
  })
  it('keeps legacy construction separate from optional effective controls', () => {
    expect(validateDriverManifest(manifest)).toBe(manifest)
    expectTypeOf<DriverFactory['create']>().toEqualTypeOf<(configuration: unknown, services: DriverServices) => Promise<ExecutionDriver>>()
    expectTypeOf<NonNullable<DriverFactory['createConfigured']>>().toEqualTypeOf<(configuration: unknown, executionConfiguration: contracts.EffectiveExecutionConfiguration, services: DriverServices) => Promise<ExecutionDriver>>()
    expectTypeOf<DriverRequest['executionConfiguration']>().toEqualTypeOf<contracts.EffectiveExecutionConfiguration | undefined>()
  })
  it('preserves core and namespaced extension capabilities and injected configuration schemas', () => {
    expect(validateDriverManifest(manifest)).toEqual(manifest)
    expect(DRIVER_MANIFEST_SCHEMA['~standard'].validate(manifest)).toEqual({ value: manifest })
  })
  it('rejects duplicate capability IDs', () => {
    expect(() => validateDriverManifest({ ...manifest, capabilities: ['streaming', 'streaming'] })).toThrow()
  })
  it.each(['', 'acme:', ':resume', 'acme:../resume', 'a/b', 'a:b:c'])('rejects unsafe capability ID %s', (capability) => {
    expect(() => validateDriverManifest({ ...manifest, capabilities: [capability] })).toThrow()
  })
  it('rejects unsupported driver kinds and malformed Standard Schema', () => {
    expect(() => validateDriverManifest({ ...manifest, kind: 'vendor' })).toThrow()
    for (const configurationSchema of [null, {}, { '~standard': { version: 2, validate: () => ({ value: null }) } }, { '~standard': { version: 1 } }]) {
      expect(() => validateDriverManifest({ ...manifest, configurationSchema })).toThrow()
    }
  })
  it('retains unfamiliar capability IDs for later required-capability negotiation', () => {
    expect(validateDriverManifest({ ...manifest, capabilities: ['future-core', 'vendor:future'] })).toHaveProperty('capabilities', ['future-core', 'vendor:future'])
  })
  it('rejects decorated capabilities rather than silently dropping JSON information', () => {
    expect(() => validateDriverManifest({ ...manifest, capabilities: Object.assign(['streaming'], { ignored: true }) })).toThrow()
  })
})
