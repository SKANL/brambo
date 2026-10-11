import { describe, expect, it, vi } from 'vitest'
import { defineStandardSchema, type ExecutionControlContract, type ExecutionControlHost, type ExecutionConfigurationLayers, type JsonObject, type JsonValue } from '@brambodev/contracts'
import * as api from '../src/index.ts'

const jsonSchema = defineStandardSchema<JsonValue>((value) => ({ value: value as JsonValue }))
const configurationSchema = defineStandardSchema<JsonObject>((value) => ({ value: value as JsonObject }))
const contract: ExecutionControlContract = {
  providerId: 'acme-api', requiresModel: true, configurationSchema,
  controls: [
    { id: 'acme:deliberation', configurationKey: 'effort', aliases: ['acme:thinking'], schema: jsonSchema },
    ...['temperature', 'output', 'stops'].map((key) => ({ id: `acme:${key}`, configurationKey: key, schema: jsonSchema })),
    { id: 'acme:custom', schema: jsonSchema },
  ],
}
const host: ExecutionControlHost = { contract, executorVersion: 'executor-v1', resolver: async () => ({ status: 'supported', version: 'fixture-v1' }) }
const base = { defaults: { providerId: 'acme-api', model: 'supported-model' } }
const resolve = (layers: ExecutionConfigurationLayers, controlHost = host) => {
  expect(api).toHaveProperty('resolveExecutionConfiguration', expect.any(Function))
  return api.resolveExecutionConfiguration(layers, controlHost)
}

// This synthetic boundary is reached only after real host resolution succeeds.
function invocation(controlHost: ExecutionControlHost) {
  const fetch = vi.fn(), spawn = vi.fn()
  const create = vi.fn(async () => { fetch(); spawn() })
  return { fetch, spawn, create, run: async (layers: ExecutionConfigurationLayers) => {
    await resolve(layers, controlHost)
    await create()
  } }
}

describe('execution configuration resolution', () => {
  it('control resolver distinguishes supported unsupported and unknown', async () => {
    const layers = { ...base, task: { configuration: { effort: 'deep' } } }
    const supported = await resolve(layers)
    expect(supported.support).toEqual([{ id: 'acme:deliberation', status: 'supported', version: 'fixture-v1' }])
    const unknown: ExecutionControlHost = { contract, allowUnverified: () => true }
    expect((await resolve(layers, unknown)).support).toEqual([{ id: 'acme:deliberation', status: 'unverified', version: 'unresolved' }])
    for (const controlHost of [
      { contract },
      { ...unknown, resolver: async () => ({ status: 'unsupported' as const, version: 'fixture-v1' }) },
    ]) {
      const boundary = invocation(controlHost)
      await expect(boundary.run(layers)).rejects.toThrow()
      expect(boundary.create).not.toHaveBeenCalled(); expect(boundary.fetch).not.toHaveBeenCalled(); expect(boundary.spawn).not.toHaveBeenCalled()
    }
    const required = invocation(unknown)
    await expect(required.run({ ...base, task: { extensions: [{ id: 'acme:deliberation', value: 'deep', requiredSupport: true }] } })).rejects.toThrow()
    expect(required.create).not.toHaveBeenCalled(); expect(required.fetch).not.toHaveBeenCalled(); expect(required.spawn).not.toHaveBeenCalled()
  })
  it('configuration precedence replaces objects arrays and schema-cleared null', async () => {
    const effective = await resolve({
      defaults: { ...base.defaults, configuration: { temperature: 0.1, output: { format: 'json', detail: true }, stops: ['default'] } },
      profile: { configuration: { temperature: 0.3, stops: ['profile'] } },
      task: { configuration: { temperature: 0.5, output: { format: 'text' } } },
      run: { configuration: { temperature: 0.7, stops: ['run'] } },
    })
    expect(effective.configuration).toEqual({ temperature: 0.7, output: { format: 'text' }, stops: ['run'] })
    expect(effective.extensions).toEqual([])
    expect(effective.executorVersion).toBe('executor-v1')
    expect(Object.isFrozen(effective.configuration)).toBe(true)
    expect(Object.isFrozen(effective.configuration['output'])).toBe(true)
    expect(JSON.parse(JSON.stringify(effective))).toEqual(effective)
    expect((await resolve({ ...base, task: { configuration: { output: null } } })).configuration).toEqual({ output: null })
    const nonNullable = { ...host, contract: { ...contract, controls: [{ id: 'acme:output', configurationKey: 'output', schema: defineStandardSchema<JsonValue>((value) => value === null ? { issues: [{ message: 'no clear' }] } : { value: value as JsonValue }) }] } }
    await expect(resolve({ ...base, task: { configuration: { output: null } } }, nonNullable)).rejects.toThrow()
  })
  it('provider switch discards foreign inherited controls', async () => {
    const result = await resolve({ defaults: { providerId: 'foreign', model: 'foreign-model', configuration: { foreignKey: true }, extensions: [{ id: 'foreign:x', value: true }] }, run: { providerId: 'acme-api', model: 'supported-model', configuration: { effort: 'deep' } } })
    expect(result.configuration).toEqual({ effort: 'deep' })
    expect(result.extensions).toEqual([])
    await expect(resolve({ defaults: base.defaults, task: { providerId: 'foreign', configuration: { effort: 'deep' } }, run: base.defaults })).rejects.toThrow()
    await expect(resolve({ ...base, run: { configuration: { foreignKey: true } } })).rejects.toThrow()
  })
  it('model switch revalidates retained controls before construction', async () => {
    const query = vi.fn(async (query) => ({ status: query.model === 'unsupported-model' ? 'unsupported' as const : 'supported' as const, version: 'fixture-v1' }))
    const boundary = invocation({ contract, resolver: query })
    await expect(boundary.run({ defaults: { ...base.defaults, configuration: { effort: 'deep' } }, run: { model: 'unsupported-model' } })).rejects.toThrow()
    expect(query).toHaveBeenCalledWith({ providerId: 'acme-api', model: 'unsupported-model', controlId: 'acme:deliberation' })
    expect(boundary.create).not.toHaveBeenCalled(); expect(boundary.fetch).not.toHaveBeenCalled(); expect(boundary.spawn).not.toHaveBeenCalled()
  })
  it('aliases conflict independently of insertion order', async () => {
    for (const extensions of [[{ id: 'acme:deliberation', value: 'deep' }, { id: 'acme:thinking', value: 'shallow' }], [{ id: 'acme:thinking', value: 'shallow' }, { id: 'acme:deliberation', value: 'deep' }]]) {
      await expect(resolve({ ...base, task: { extensions } })).rejects.toThrow()
    }
    await expect(resolve({ ...base, task: { configuration: { effort: 'deep' }, extensions: [{ id: 'acme:thinking', value: 'deep' }] } })).rejects.toThrow()
    const result = await resolve({ defaults: { ...base.defaults, extensions: [{ id: 'acme:thinking', value: 'deep' }] }, run: { configuration: { effort: 'shallow' } } })
    expect(result.configuration).toEqual({ effort: 'shallow' }); expect(result.extensions).toEqual([])
  })
  it('validator failures never echo synthetic secrets', async () => {
    for (const resolver of [async () => { throw new Error('synthetic-secret') }, async () => ({ status: 'supported' as const, version: '', raw: 'synthetic-secret' }), async () => ({ status: 'supported' as const, version: 'v1', valueSchema: defineStandardSchema<JsonValue>(() => ({ issues: [{ message: 'synthetic-secret' }] })) })]) {
      const boundary = invocation({ contract, resolver })
      const pending = boundary.run({ ...base, task: { configuration: { effort: 'deep' } } })
      await expect(pending).rejects.toThrow(); await expect(pending).rejects.not.toThrow(/synthetic-secret/)
      expect(boundary.create).not.toHaveBeenCalled()
    }
  })
  it('configuration precedence omits optional undefined without omitting invalid JSON', async () => {
    const layers = { defaults: { ...base.defaults, configuration: { temperature: 0.3 } }, task: { configuration: { temperature: undefined, output: undefined } } } as unknown as ExecutionConfigurationLayers
    expect((await resolve(layers)).configuration).toEqual({ temperature: 0.3 })
    for (const value of [Array(1), [undefined], { nested: undefined }, Infinity, () => null]) {
      await expect(resolve({ ...base, task: { configuration: { output: value } } } as unknown as ExecutionConfigurationLayers)).rejects.toThrow()
    }
  })
  it('control resolver rejects invalid model-schema transformations and normalizes owned values', async () => {
    const normalize = defineStandardSchema<JsonValue>((value) => typeof value === 'string' ? { value: value.toLowerCase() } : { issues: [{ message: 'synthetic-secret' }] })
    const strictHost = { ...host, contract: { ...contract, controls: [{ ...contract.controls[0]!, schema: normalize }] } }
    expect((await resolve({ ...base, task: { configuration: { effort: 'DEEP' } } }, strictHost)).configuration).toEqual({ effort: 'deep' })
    for (const transformed of [() => null, Infinity, undefined, { nested: undefined }, 123]) {
      const boundary = invocation({ ...strictHost, resolver: async () => ({ status: 'supported', version: 'v1', valueSchema: defineStandardSchema<JsonValue>(() => ({ value: transformed as JsonValue })) }) })
      const pending = boundary.run({ ...base, task: { configuration: { effort: 'deep' } } })
      await expect(pending).rejects.toThrow(); await expect(pending).rejects.not.toThrow(/synthetic-secret/)
      expect(boundary.create).not.toHaveBeenCalled()
    }
  })
  it('control resolver cannot invalidate model proof through provider-schema transformation', async () => {
    const modelSchema = defineStandardSchema<JsonValue>((value) => value === 'deep' ? { value } : { issues: [{ message: 'unsupported' }] })
    const providerSchema = defineStandardSchema<JsonObject>(() => ({ value: { effort: 'unsupported' } }))
    const boundary = invocation({ ...host, contract: { ...contract, configurationSchema: providerSchema },
      resolver: async () => ({ status: 'supported', version: 'v1', valueSchema: modelSchema }) })
    await expect(boundary.run({ ...base, task: { configuration: { effort: 'deep' } } })).rejects.toThrow()
    expect(boundary.create).not.toHaveBeenCalled(); expect(boundary.fetch).not.toHaveBeenCalled(); expect(boundary.spawn).not.toHaveBeenCalled()
  })
  it('validator failures reject host contract accessors without evaluating them', async () => {
    const getter = vi.fn(() => configurationSchema)
    const hostile = Object.defineProperty({ ...contract }, 'configurationSchema', { enumerable: true, get: getter })
    await expect(resolve(base, { ...host, contract: hostile })).rejects.toThrow()
    expect(getter).not.toHaveBeenCalled()
  })
  it('configuration precedence rejects unknown undefined fields and nonrecord layer wrappers', async () => {
    await expect(resolve({ ...base, task: { configuration: { unknown: undefined } } } as unknown as ExecutionConfigurationLayers)).rejects.toThrow()
    const optionalModel = { contract: { ...contract, requiresModel: false }, allowUnverified: () => true }
    for (const layers of [[], new Date(), Object.create({ task: { configuration: { effort: 'deep' } } })]) {
      await expect(resolve(layers, optionalModel)).rejects.toThrow()
    }
  })
  it('control resolver owns host ports and versions before asynchronous validation', async () => {
    const controlHost: ExecutionControlHost = { contract, executorVersion: 'original-v1', resolver: async () => {
      Object.assign(controlHost, { executorVersion: 'changed-v2', resolver: async () => ({ status: 'unsupported', version: 'changed-v2' }) })
      return { status: 'supported', version: 'original-v1' }
    } }
    const result = await resolve({ ...base, task: { configuration: { effort: 'deep', temperature: 0.7 } } }, controlHost)
    expect(result.executorVersion).toBe('original-v1')
    expect(result.support).toEqual([{ id: 'acme:deliberation', status: 'supported', version: 'original-v1' }, { id: 'acme:temperature', status: 'supported', version: 'original-v1' }])
  })
  it('control resolver cannot invalidate model proof through in-place provider normalization', async () => {
    let calls = 0
    const providerSchema = defineStandardSchema<JsonObject>((value) => {
      if (calls++ === 0) (value as Record<string, JsonValue>)['effort'] = 'unsupported'
      return { value: value as JsonObject }
    })
    const boundary = invocation({ ...host, contract: { ...contract, configurationSchema: providerSchema } })
    await expect(boundary.run({ ...base, task: { configuration: { effort: 'deep' } } })).rejects.toThrow()
    expect(boundary.create).not.toHaveBeenCalled()
  })
  it('control resolver rejects provider and model normalizers that disagree', async () => {
    const providerSchema = defineStandardSchema<JsonValue>(() => ({ value: 'shallow' }))
    const modelSchema = defineStandardSchema<JsonValue>(() => ({ value: 'deep' }))
    const boundary = invocation({ ...host, contract: { ...contract, controls: [{ ...contract.controls[0]!, schema: providerSchema }] },
      resolver: async () => ({ status: 'supported', version: 'v1', valueSchema: modelSchema }) })
    await expect(boundary.run({ ...base, task: { configuration: { effort: 'deep' } } })).rejects.toThrow()
    expect(boundary.create).not.toHaveBeenCalled()
  })
})
