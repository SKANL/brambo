import { describe, expect, it, vi } from 'vitest'
import * as api from '../src/index.ts'

const effective = {
  version: 1, providerId: 'acme-api', model: 'custom-model', executorVersion: '1.0.0',
  configuration: { deliberation: { depth: ['deep'] } },
  extensions: [{ id: 'acme:deliberation', value: 'deep', requiredSupport: true }],
  support: [{ id: 'acme:deliberation', status: 'supported', version: 'support-v1' }],
}
const schema = api.defineStandardSchema((value) => ({ value }))
const controls = {
  providerId: 'acme-api', requiresModel: true, configurationSchema: schema,
  controls: [{ id: 'acme:deliberation', configurationKey: 'deliberation', aliases: ['acme:thinking'], schema }],
}
const driver = { id: 'acme-driver', version: '1.0.0', kind: 'custom', capabilities: [], configurationSchema: schema }
const executor = { id: 'acme-api', displayName: 'Acme', contractVersion: '1', packageName: 'acme-api', capabilities: [], configurationSchema: schema }

describe('configuration controls', () => {
  it('accepts a non-built-in provider without a core enum addition', () => {
    expect(api.validateExecutionConfigurationLayer).toBeTypeOf('function')
    const layer = { providerId: 'acme-api', extensions: [{ id: 'acme:deliberation', value: 'deep' }] }
    expect(api.validateExecutionConfigurationLayer(layer)).toEqual(layer)
    expect(api.validateEffectiveExecutionConfiguration(effective)).toEqual(effective)
    expect(api.validateDriverManifest({ ...driver, configurationControls: controls })).toHaveProperty('configurationControls', controls)
    expect(api.validateExecutorManifest({ ...executor, configurationControls: controls })).toHaveProperty('configurationControls', controls)
  })
  it('clones and freezes data, omitting absent layer values', () => {
    const input = structuredClone(effective)
    const result = api.validateEffectiveExecutionConfiguration(input)
    input.configuration.deliberation.depth.push('changed')
    input.extensions[0]!.value = 'changed'
    expect(result.configuration).toEqual({ deliberation: { depth: ['deep'] } })
    expect(result.extensions[0]!.value).toBe('deep')
    for (const value of [result, result.configuration, result.configuration['deliberation'], result.extensions, result.extensions[0], result.support, result.support[0]]) {
      expect(Object.isFrozen(value)).toBe(true)
    }
    expect(api.validateExecutionConfigurationLayer({ model: undefined, configuration: undefined })).toEqual({})
  })
  it('rejects unknown fields, duplicate IDs and malformed identity or receipts', () => {
    const badLayers = [
      { auth: 'synthetic-secret' }, { providerId: '../provider' }, { model: '' }, { configuration: [] },
      { extensions: [{ id: 'acme:deliberation', value: 1 }, { id: 'acme:deliberation', value: 2 }] },
      { extensions: [{ id: 'acme:../control', value: 1 }] },
      { extensions: [{ id: 'acme:deliberation', value: 1, requiredSupport: 'yes' }] },
      { extensions: [{ id: 'acme:deliberation', value: 1, schema }] },
    ]
    for (const value of badLayers) expect(() => api.validateExecutionConfigurationLayer(value)).toThrow(/schema violation/)
    const badEffective = [
      { ...effective, version: 2 }, { ...effective, executorVersion: '' }, { ...effective, resolver: () => null },
      { ...effective, support: [effective.support[0], effective.support[0]] },
      { ...effective, support: [{ id: 'acme:deliberation', status: 'unknown', version: 'v1' }] },
      { ...effective, support: [{ id: 'acme:deliberation', status: 'supported', version: '' }] },
      { ...effective, support: [{ id: 'acme:deliberation', status: 'supported', version: 'v1', raw: 'synthetic-secret' }] },
    ]
    for (const value of badEffective) expect(() => api.validateEffectiveExecutionConfiguration(value)).toThrow(/schema violation/)
  })
  it('rejects hostile descriptors and proxy failures without invoking getters or exposing errors', () => {
    const getter = vi.fn(() => { throw new Error('synthetic-secret') })
    const hostile = Object.defineProperty({}, 'providerId', { enumerable: true, get: getter })
    const trap = () => { throw new Error('synthetic-secret') }
    const revoked = Proxy.revocable({}, {}); revoked.revoke()
    const values = [hostile, Object.defineProperty({}, 'hidden', { value: 1 }), { [Symbol('x')]: 1 },
      new Proxy({}, { ownKeys: trap }), new Proxy({}, { getPrototypeOf: trap }),
      new Proxy({ providerId: 'acme-api' }, { getOwnPropertyDescriptor: trap }), revoked.proxy]
    for (const value of values) {
      for (const validate of [api.validateExecutionConfigurationLayer, api.validateEffectiveExecutionConfiguration]) {
        expect(() => validate(value)).toThrow(api.BramboError)
        try { validate(value) } catch (error) {
          expect((error as api.BramboError).code).toBe(api.BRAMBO_ERROR_CODES.contractEnvelopeInvalid)
          expect((error as Error).message).not.toContain('synthetic-secret')
        }
      }
    }
    expect(getter).not.toHaveBeenCalled()
    const schemaGetter = Object.defineProperty({}, '~standard', { enumerable: true, get: getter })
    for (const manifest of [{ ...driver, configurationControls: { ...controls, configurationSchema: schemaGetter } },
      { ...driver, configurationControls: Object.defineProperty({}, 'controls', { enumerable: true, get: getter }) }]) {
      expect(() => api.validateDriverManifest(manifest)).toThrow(/schema violation/)
    }
    expect(getter).not.toHaveBeenCalled()
  })
  it('rejects non-durable JSON including nested accessors without evaluating them', () => {
    const getter = vi.fn(() => 'synthetic-secret')
    const cycle: Record<string, unknown> = {}; cycle['self'] = cycle
    const hostile = Object.defineProperty({}, 'value', { enumerable: true, get: getter })
    for (const value of [undefined, Infinity, NaN, -0, BigInt(1), Symbol('x'), () => null, new Date(), cycle,
      Array(1), Object.assign([1], { extra: true }), hostile]) {
      expect(() => api.validateExecutionConfigurationLayer({ extensions: [{ id: 'acme:deliberation', value }] })).toThrow(/schema violation/)
      expect(() => api.validateEffectiveExecutionConfiguration({ ...effective, configuration: { value } })).toThrow(/schema violation/)
    }
    expect(getter).not.toHaveBeenCalled()
  })
  it('reads JSON arrays through own descriptors rather than proxy property access', () => {
    const get = vi.fn(() => { throw new Error('synthetic-secret') })
    const values = new Proxy(['deep'], { get })
    expect(api.validateExecutionConfigurationLayer({ configuration: { values } })).toEqual({ configuration: { values: ['deep'] } })
    expect(get).not.toHaveBeenCalled()
  })
  it('owns one descriptor snapshot before validating changing JSON proxies', () => {
    let reads = 0
    const changing = new Proxy({ x: 1 }, { getOwnPropertyDescriptor(target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key)!
      return key === 'x' ? { ...descriptor, value: ++reads === 1 ? 1 : () => null } : descriptor
    } })
    const result = api.validateExecutionConfigurationLayer({ configuration: changing })
    expect(result.configuration).toEqual({ x: 1 })
    expect(reads).toBe(1)
  })
  it('does not revisit an untrusted descriptor that introduces a second-read cycle', () => {
    let reads = 0
    const target = { x: 1 }
    const changing: object = new Proxy(target, { getOwnPropertyDescriptor(target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key)!
      return key === 'x' ? { ...descriptor, value: ++reads === 2 ? changing : 1 } : descriptor
    } })
    const result = api.validateEffectiveExecutionConfiguration({ ...effective, configuration: changing })
    expect(result.configuration).toEqual({ x: 1 })
    expect(reads).toBe(1)
  })
  it('rejects ambiguous declared IDs, aliases and configuration keys', () => {
    const descriptor = controls.controls[0]!
    for (const declared of [[descriptor, descriptor], [descriptor, { ...descriptor, id: 'acme:other' }],
      [descriptor, { id: 'acme:thinking', schema }], [{ ...descriptor, aliases: ['acme:thinking', 'acme:thinking'] }],
      [{ id: 'acme:../control', schema }], [{ ...descriptor, schema: {} }]]) {
      expect(() => api.validateDriverManifest({ ...driver, configurationControls: { ...controls, controls: declared } })).toThrow(/schema violation/)
      expect(() => api.validateExecutorManifest({ ...executor, configurationControls: { ...controls, controls: declared } })).toThrow()
    }
  })
  it('exposes synchronous schemas with safe issues instead of hostile exception text', () => {
    expect(api.EXECUTION_CONFIGURATION_LAYER_SCHEMA['~standard'].validate({ providerId: 'acme-api' })).toEqual({ value: { providerId: 'acme-api' } })
    expect(api.EFFECTIVE_EXECUTION_CONFIGURATION_SCHEMA['~standard'].validate(effective)).toEqual({ value: effective })
    const hostile = new Proxy({}, { ownKeys() { throw new Error('synthetic-secret') } })
    const result = api.EFFECTIVE_EXECUTION_CONFIGURATION_SCHEMA['~standard'].validate(hostile)
    expect(result).toHaveProperty('issues')
    expect(JSON.stringify(result)).not.toContain('synthetic-secret')
  })
  it('validates optional run controls while preserving the workspace port', () => {
    const request = { prompt: 'inspect', workspace: { id: 'w-1', rootPath: '/workspace', capabilities: ['read'] } }
    expect(api.validateRunRequest({ ...request, executionConfiguration: effective })).toHaveProperty('executionConfiguration', effective)
    expect(() => api.validateRunRequest({ ...request, executionConfiguration: { ...effective, version: 2 } })).toThrow()
    const getter = vi.fn(() => effective)
    expect(() => api.validateRunRequest(Object.defineProperty({ ...request }, 'executionConfiguration', { enumerable: true, get: getter }))).toThrow()
    expect(getter).not.toHaveBeenCalled()
  })
  it('rejects inherited optional controls rather than admitting unvalidated prototypes', () => {
    const request = Object.assign(Object.create({ executionConfiguration: { version: 2 } }),
      { prompt: 'inspect', workspace: { id: 'w-1', rootPath: '/workspace', capabilities: ['read'] } })
    expect(() => api.validateRunRequest(request)).toThrow()
    const manifest = Object.assign(Object.create({ configurationControls: { invalid: true } }), executor)
    expect(() => api.validateExecutorManifest(manifest)).toThrow()
  })
})

describe('extension mapper', () => {
  const valueSchema = api.defineStandardSchema<api.JsonValue>((value) => ({ value: value as api.JsonValue }))
  const nativeSchema = api.defineStandardSchema<api.JsonObject>((value) => ({ value: value as api.JsonObject }))
  const registration = (id: string, field: string) => ({ descriptor: { id, schema: valueSchema }, map: (value: api.JsonValue) => ({ [field]: value }) })
  const map = (requested: readonly api.RequestedControl[], registrations: readonly api.ControlExtension<api.JsonObject>[], occupied?: readonly string[]) => {
    expect(api).toHaveProperty('mapControlExtensions', expect.any(Function))
    return api.mapControlExtensions(requested, registrations, nativeSchema, occupied)
  }
  it('extension mapper cannot overwrite reserved native fields even if its schema permits them', async () => {
    for (const field of ['model', 'messages', 'input', 'tools', 'headers', 'authorization', 'apiKey', 'baseURL', 'endpoint', 'approvals', 'storage', 'egress', 'extraArgs', 'prompt', 'system']) {
      await expect(map([{ id: 'acme:x', value: true }], [registration('acme:x', field)])).rejects.toThrow()
    }
  })
  it('extension mapper rejects built-in occupied destinations and plugin destination conflicts', async () => {
    await expect(map([{ id: 'acme:x', value: 0.7 }], [registration('acme:x', 'temperature')], ['temperature'])).rejects.toThrow()
    await expect(map([{ id: 'acme:x', value: 0.7 }, { id: 'acme:y', value: 0.3 }], [registration('acme:x', 'temperature'), registration('acme:y', 'temperature')])).rejects.toThrow()
  })
  it('extension mapper validates owned atomic output and rejects unknown or duplicate aliases', async () => {
    const output = { format: 'text' }
    const mapped = await map([{ id: 'acme:alias', value: true }], [{ descriptor: { id: 'acme:x', aliases: ['acme:alias'], schema: valueSchema }, map: () => ({ output }) }])
    output.format = 'changed'
    expect(mapped).toEqual({ output: { format: 'text' } }); expect(Object.isFrozen(mapped['output'])).toBe(true)
    await expect(map([{ id: 'acme:missing', value: true }], [])).rejects.toThrow()
    await expect(map([{ id: 'acme:x', value: true }, { id: 'acme:alias', value: true }], [{ descriptor: { id: 'acme:x', aliases: ['acme:alias'], schema: valueSchema }, map: () => ({ output }) }])).rejects.toThrow()
    const strict = api.defineStandardSchema<api.JsonObject>((value) => Object.keys(value as object).every((key) => key === 'temperature') ? { value: value as api.JsonObject } : { issues: [{ message: 'synthetic-secret' }] })
    await expect(api.mapControlExtensions([{ id: 'acme:x', value: true }], [registration('acme:x', 'unknown')], strict)).rejects.not.toThrow(/synthetic-secret/)
  })
  it('extension mapper rejects descriptor registration conflicts synchronously', () => {
    expect(api).toHaveProperty('mapControlExtensions', expect.any(Function))
    expect(() => api.mapControlExtensions([], [registration('acme:x', 'temperature'), registration('acme:x', 'output')], nativeSchema)).toThrow()
  })
})

describe('execution snapshot', () => {
  const snapshot = { schemaVersion: 1, key: { namespace: 'team', runId: 'r-1' }, revision: 0,
    workflowId: 'build', workflowVersion: '1', sessionId: 's-1', status: 'pending',
    workspace: { namespace: 'team', workspaceId: 'w-1', revision: '1' },
    tasks: [{ taskId: 't-1', phase: 'pending', attempt: 0 }], context: null, cancelRequested: false }
  const entry = { taskId: 't-1', driverId: 'acme-driver', driverVersion: '1.0.0', configuration: effective }
  it('accepts owned controls tied to an existing task and freezes their copy', () => {
    const input = { ...snapshot, executionConfigurations: [structuredClone(entry)] }
    const result = api.validateRunSnapshot(input)
    input.executionConfigurations[0]!.configuration.extensions[0]!.value = 'changed'
    expect(result.executionConfigurations?.[0]?.configuration.extensions[0]?.value).toBe('deep')
    expect(Object.isFrozen(result.executionConfigurations)).toBe(true)
    expect(Object.isFrozen(result.executionConfigurations?.[0])).toBe(true)
  })
  it('rejects duplicate or foreign task controls and invalid driver identities before I/O', () => {
    for (const entries of [[entry, entry], [{ ...entry, taskId: 'foreign' }], [{ ...entry, driverId: '../driver' }],
      [{ ...entry, driverVersion: '' }], [{ ...entry, configuration: { ...effective, version: 2 } }]]) {
      expect(() => api.validateRunSnapshot({ ...snapshot, executionConfigurations: entries })).toThrow(/schema violation/)
    }
  })
})


describe('controlled invocation validation', () => {
  const valueSchema = api.defineStandardSchema<api.JsonValue>((value) => ({ value: value as api.JsonValue }))
  const configurationSchema = api.defineStandardSchema<api.JsonObject>((value) => ({ value: value as api.JsonObject }))
  const contract = api.validateExecutionControlContract({ providerId: 'fixture-api', requiresModel: true, configurationSchema,
    controls: [{ id: 'fixture:depth', configurationKey: 'depth', schema: valueSchema }, { id: 'fixture:custom', aliases: ['fixture:alias'], schema: valueSchema }] })
  const input: api.EffectiveExecutionConfiguration = { version: 1, providerId: 'fixture-api', model: 'fixture-model',
    configuration: { depth: 'low' }, extensions: [{ id: 'fixture:custom', value: { a: 1, b: [2] }, requiredSupport: true }],
    support: [{ id: 'fixture:depth', status: 'supported', version: 'fixture-v1' }, { id: 'fixture:custom', status: 'supported', version: 'fixture-v1' }] }

  it('snapshots a trusted schema callback with its original receiver and frozen port', async () => {
    const original = { '~standard': { version: 1 as const, validate(value: unknown) {
      expect(this).toBe(original['~standard'])
      return { value: value as api.JsonValue }
    } } }
    const captured = api.snapshotExecutionControlSchema(original)
    original['~standard'].validate = () => ({ value: 'changed' })
    expect(await captured['~standard'].validate('original')).toEqual({ value: 'original' })
    expect(Object.isFrozen(captured)).toBe(true)
    expect(Object.isFrozen(captured['~standard'])).toBe(true)
  })

  it('owns admitted values and allows unverified receipts only when support is optional', async () => {
    const mutable = structuredClone(input)
    const result = await api.validateExecutionConfigurationForContract(mutable, contract)
    Object.assign(mutable.configuration, { depth: 'changed' })
    expect(result.configuration['depth']).toBe('low')
    expect(Object.isFrozen(result.configuration)).toBe(true)
    const optional = { ...input, extensions: [{ id: 'fixture:custom', value: { a: 1, b: [2] } }],
      support: [input.support[0]!, { id: 'fixture:custom', status: 'unverified' as const, version: 'fixture-v1' }] }
    await expect(api.validateExecutionConfigurationForContract(optional, contract)).resolves.toEqual(optional)
    await expect(api.validateExecutionConfigurationForContract({ ...input, model: undefined }, { ...contract, requiresModel: false })).resolves.not.toHaveProperty('model')
  })

  it('rejects foreign identities, unknown controls, noncanonical extensions and incomplete support', async () => {
    const invalid = [
      { ...input, providerId: 'foreign' }, { ...input, model: undefined },
      { ...input, configuration: { unknown: 'low' } },
      { ...input, extensions: [{ id: 'fixture:alias', value: 'low' }] },
      { ...input, extensions: [{ id: 'fixture:depth', value: 'low' }] },
      { ...input, support: [] },
      { ...input, support: [input.support[0]!, { id: 'fixture:unknown', status: 'supported' as const, version: 'fixture-v1' }] },
      { ...input, support: [input.support[0]!, { id: 'fixture:custom', status: 'unverified' as const, version: 'fixture-v1' }] },
    ]
    for (const value of invalid) await expect(api.validateExecutionConfigurationForContract(value, contract)).rejects.toThrow()
  })

  it('compares schema output structurally while rejecting transformations and schema issues', async () => {
    const reordered = api.defineStandardSchema<api.JsonValue>(() => ({ value: { b: [2], a: 1 } }))
    const controls = [contract.controls[0]!, { ...contract.controls[1]!, schema: reordered }]
    await expect(api.validateExecutionConfigurationForContract(input, { ...contract, controls })).resolves.toEqual(input)
    const changed = api.defineStandardSchema<api.JsonValue>(() => ({ value: { a: 1, b: [3] } }))
    const rejected = api.defineStandardSchema<api.JsonValue>(() => ({ issues: [{ message: 'invalid' }] }))
    for (const schema of [changed, rejected]) {
      await expect(api.validateExecutionConfigurationForContract(input, { ...contract, controls: [contract.controls[0]!, { ...contract.controls[1]!, schema }] })).rejects.toThrow()
    }
    const changedConfiguration = api.defineStandardSchema<api.JsonObject>(() => ({ value: { depth: 'high' } }))
    await expect(api.validateExecutionConfigurationForContract(input, { ...contract, configurationSchema: changedConfiguration })).rejects.toThrow()
  })

  it.each(['control', 'configuration'] as const)('accepts explicit undefined issues in a successful %s schema', async kind => {
    const valueSchema = api.defineStandardSchema<api.JsonValue>(value => ({ value: value as api.JsonValue, issues: undefined }))
    const configurationSchema = api.defineStandardSchema<api.JsonObject>(value => ({ value: value as api.JsonObject, issues: undefined }))
    const compatible = kind === 'control' ? { ...contract, controls: contract.controls.map(control => ({ ...control, schema: valueSchema })) } :
      { ...contract, configurationSchema }
    await expect(api.validateExecutionConfigurationForContract(input, compatible)).resolves.toEqual(input)
  })

  it.each(['control', 'configuration'] as const)('rejects malformed and accessor %s schema successes without evaluating them', async kind => {
    for (const field of ['value', 'issues'] as const) {
      const getter = vi.fn(() => { throw new Error('synthetic-secret') })
      const schema = api.defineStandardSchema<api.JsonValue>(value => Object.defineProperty({ value: value as api.JsonValue }, field, { enumerable: true, get: getter }))
      const compatible = kind === 'control' ? { ...contract, controls: contract.controls.map(control => ({ ...control, schema })) } :
        { ...contract, configurationSchema: schema as api.StandardSchemaV1<api.JsonObject> }
      await expect(api.validateExecutionConfigurationForContract(input, compatible)).rejects.toThrow()
      expect(getter).not.toHaveBeenCalled()
    }
    const schema = api.defineStandardSchema<api.JsonValue>(() => ({ issues: undefined }) as unknown as api.StandardSchemaResult<api.JsonValue>)
    const compatible = kind === 'control' ? { ...contract, controls: contract.controls.map(control => ({ ...control, schema })) } :
      { ...contract, configurationSchema: schema as api.StandardSchemaV1<api.JsonObject> }
    await expect(api.validateExecutionConfigurationForContract(input, compatible)).rejects.toThrow()
  })
})
