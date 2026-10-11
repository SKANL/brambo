import { describe, expect, it, vi } from 'vitest'
import * as api from '../src/index.ts'
import { defineStandardSchema } from '@brambodev/contracts'
import type { ControlExtension, EffectiveExecutionConfiguration, ExecutionControlContract, JsonObject, JsonValue } from '@brambodev/contracts'

const workspace = { id: 'fixture-workspace', rootPath: 'C:/fixture', capabilities: ['read'] } as never
const schema = defineStandardSchema<JsonValue>((value) => typeof value === 'string' ? { value } : { issues: [{ message: 'expected string' }] })
const build = () => (api as unknown as Record<string, (extensions?: readonly ControlExtension<JsonObject>[]) => ExecutionControlContract>)['createOpenAIControlContract']!
const envelope = (configuration: JsonObject = {}, extensions: EffectiveExecutionConfiguration['extensions'] = []): EffectiveExecutionConfiguration => ({ version: 1, providerId: 'openai', model: 'fixture-openai-model', configuration, extensions, support: [...Object.keys(configuration).map((name) => ({ id: `openai:${name}`, status: 'supported' as const, version: 'fixture-v1' })), ...extensions.map(({ id }) => ({ id, status: 'supported' as const, version: 'fixture-v1' }))] })
const fixture = (controlExtensions: readonly ControlExtension<JsonObject>[] = []) => {
  const bodies: JsonObject[] = []
  const credentialSpy = vi.fn(() => 'fixture-credential')
  const transportSpy = vi.fn(async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)))
    return new Response(JSON.stringify({ id: 'fixture-response', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }] }))
  })
  const provider = api.createOpenAIProvider({ credential: credentialSpy, transport: transportSpy, ...(controlExtensions.length ? { controlExtensions } : {}) })
  const adapter = provider.create({ selection: { providerId: 'openai', model: 'legacy-model', configuration: { reasoningEffort: 'medium' } }, credential: undefined })
  return { bodies, credentialSpy, transportSpy, provider, adapter }
}

describe('OpenAI API model controls', () => {
  it('controlled run maps native effort and model without changing legacy requests', async () => {
    const { adapter, bodies } = fixture()
    const low = envelope({ reasoningEffort: 'low' })
    const high = envelope({ reasoningEffort: 'high' })
    expect((await adapter.run({ prompt: 'fixture', workspace, executionConfiguration: low })).status).toBe('ok')
    expect((await adapter.run({ prompt: 'fixture', workspace, executionConfiguration: high })).status).toBe('ok')
    await adapter.run({ prompt: 'fixture', workspace })
    expect(bodies[0]?.reasoning).toEqual({ effort: 'low' })
    expect(bodies[1]?.reasoning).toEqual({ effort: 'high' })
    expect(bodies[0]?.model).toBe('fixture-openai-model')
    expect(bodies[2]).toEqual({ model: 'legacy-model', store: false, stream: false, reasoning: { effort: 'medium' }, input: [{ role: 'user', content: 'fixture' }] })
    expect(low.configuration.reasoningEffort).toBe('low')
  })

  it('controlled public contract exposes schemas for direct invocation', async () => {
    expect(build()).toBeTypeOf('function')
    const contract = build()()
    const parsed = await contract.configurationSchema['~standard'].validate({ reasoningEffort: 'high' })
    expect(parsed).toMatchObject({ value: { reasoningEffort: 'high' } })
    const effective = envelope({ reasoningEffort: 'high' })
    const { adapter, bodies, provider } = fixture()
    expect(provider.manifest.configurationControls).toBe(api.OPENAI_CONTROL_CONTRACT)
    expect((await adapter.run({ prompt: 'fixture', workspace, executionConfiguration: effective })).status).toBe('ok')
    expect(bodies[0]?.reasoning).toEqual({ effort: 'high' })
    expect(Object.isFrozen(contract.controls)).toBe(true)
  })

  it.each([
    { ...envelope(), providerId: 'foreign' },
    { ...envelope(), model: undefined },
    envelope({ reasoningEffort: 'impossible' }),
    envelope({ tools: [] }),
    { ...envelope({ reasoningEffort: 'high' }), support: [] },
    envelope({}, [{ id: 'fixture:unknown', value: 'x' }]),
  ])('control rejection performs zero credential resolution and fetch (%#)', async (executionConfiguration) => {
    const { adapter, credentialSpy, transportSpy } = fixture()
    const result = await adapter.run({ prompt: 'fixture', workspace, executionConfiguration: executionConfiguration as EffectiveExecutionConfiguration })
    expect(result.status).toBe('failed')
    expect(credentialSpy).not.toHaveBeenCalled()
    expect(transportSpy).not.toHaveBeenCalled()
  })

  it('control rejection requires supported receipts for a registered required extension', async () => {
    const { adapter, credentialSpy, transportSpy, bodies } = fixture([{ descriptor: { id: 'fixture:custom', schema }, map: () => ({ reasoning: { effort: 'low' } }) }])
    const required = { ...envelope({}, [{ id: 'fixture:custom', value: 'x', requiredSupport: true }]), support: [{ id: 'fixture:custom', status: 'unverified' as const, version: 'fixture-v1' }] }
    expect((await adapter.run({ prompt: 'fixture', workspace, executionConfiguration: required })).status).toBe('failed')
    expect(credentialSpy).not.toHaveBeenCalled()
    expect(transportSpy).not.toHaveBeenCalled()
    const optional = { ...required, extensions: [{ id: 'fixture:custom', value: 'x' }] }
    expect((await adapter.run({ prompt: 'fixture', workspace, executionConfiguration: optional })).status).toBe('ok')
    expect(bodies[0]?.reasoning).toEqual({ effort: 'low' })
  })

  it('controlled registrations own descriptors, reject collisions and advertise a frozen derived contract', async () => {
    expect(build()).toBeTypeOf('function')
    const descriptor = { id: 'fixture:custom', aliases: ['fixture:alias'], schema }
    const extension = { descriptor, map: () => ({ reasoning: { effort: 'low' } }) }
    const provider = api.createOpenAIProvider({ credential: 'fixture', transport: async () => new Response(JSON.stringify({ id: 'fixture-response', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }] })), controlExtensions: [extension] })
    descriptor.id = 'fixture:changed'; descriptor.aliases.push('fixture:late')
    expect(provider.manifest.configurationControls?.controls.some(({ id }) => id === 'fixture:custom')).toBe(true)
    expect(Object.isFrozen(provider.manifest.configurationControls?.controls)).toBe(true)
    expect(() => build()([{ descriptor: { id: 'openai:reasoningEffort', schema }, map: () => ({}) }])).toThrow()
    expect(() => build()([{ descriptor: { id: 'fixture:other', aliases: ['openai:reasoningEffort'], schema }, map: () => ({}) }])).toThrow()
    const adapter = provider.create({ selection: { providerId: 'openai', model: 'legacy-model' }, credential: undefined })
    expect((await adapter.run({ prompt: 'fixture', workspace, executionConfiguration: envelope({}, [{ id: 'fixture:custom', value: 'x' }]) })).status).toBe('ok')
  })

  it.each([{ authorization: 'bad' }, { model: 'bad' }, { tools: [] }, { unknown: 'bad' }, { reasoning: { effort: 'high', extra: true } }])('control rejection forbids extension destinations before I/O (%#)', async (destination) => {
    const credentialSpy = vi.fn(() => 'fixture')
    const transportSpy = vi.fn(async () => new Response(JSON.stringify({ id: 'fixture-response', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }] })))
    const provider = api.createOpenAIProvider({ credential: credentialSpy, transport: transportSpy, controlExtensions: [{ descriptor: { id: 'fixture:custom', schema }, map: () => destination as unknown as JsonObject }] })
    const adapter = provider.create({ selection: { providerId: 'openai', model: 'legacy-model' }, credential: undefined })
    const result = await adapter.run({ prompt: 'fixture', workspace, executionConfiguration: envelope({}, [{ id: 'fixture:custom', value: 'x' }]) })
    expect(result.status).toBe('failed')
    expect(credentialSpy).not.toHaveBeenCalled(); expect(transportSpy).not.toHaveBeenCalled()
  })
  it('controlled empty configuration does not inherit unverified legacy behavior on a new model', async () => {
    const { adapter, bodies } = fixture()
    expect((await adapter.run({ prompt: 'fixture', workspace, executionConfiguration: envelope() })).status).toBe('ok')
    expect(bodies[0]).not.toHaveProperty('reasoning')
  })

  it('control rejection prevents streaming configuration from granting host capabilities', async () => {
    const { adapter, credentialSpy, transportSpy } = fixture()
    expect((await adapter.run({ prompt: 'fixture', workspace, executionConfiguration: envelope({ stream: true }) })).status).toBe('failed')
    expect(credentialSpy).not.toHaveBeenCalled(); expect(transportSpy).not.toHaveBeenCalled()
  })

  it('controlled output limits and temperature use registered support without altering host grants', async () => {
    const { adapter, bodies } = fixture()
    const effective = envelope({ maxOutputTokens: 2048, temperature: 0.5, stream: false })
    expect((await adapter.run({ prompt: 'fixture', workspace, executionConfiguration: effective })).status).toBe('ok')
    expect(bodies[0]).toMatchObject({ max_output_tokens: 2048, temperature: 0.5, stream: false })
    expect(bodies[0]).not.toHaveProperty('reasoning')
  })

  it('controlled validation treats reordered schema objects as unchanged JSON', async () => {
    const reordered = defineStandardSchema<JsonValue>(() => ({ value: { b: 'second', a: 'first' } }))
    const bodies: JsonObject[] = []
    const provider = api.createOpenAIProvider({ credential: 'fixture', transport: async (_url, init) => { bodies.push(JSON.parse(String(init.body))); return new Response(JSON.stringify({ id: 'fixture', status: 'completed', output: [] })) }, controlExtensions: [{ descriptor: { id: 'fixture:custom', schema: reordered }, map: () => ({ reasoning: { effort: 'low' } }) }] })
    const adapter = provider.create({ selection: { providerId: 'openai', model: 'fixture-model' }, credential: undefined })
    expect((await adapter.run({ prompt: 'fixture', workspace, executionConfiguration: envelope({}, [{ id: 'fixture:custom', value: { a: 'first', b: 'second' } }]) })).status).toBe('ok')
    expect(bodies[0]?.reasoning).toEqual({ effort: 'low' })
  })

  it('control rejection refuses registrations that advertise arbitrary configuration keys', () => {
    expect(() => build()([{ descriptor: { id: 'fixture:custom', configurationKey: 'customField', schema }, map: () => ({}) }])).toThrow()
  })

  it('controlled public configuration schema retains typed legacy validation', async () => {
    const configuration: api.OpenAIConfiguration = { reasoningEffort: 'low' }
    expect(await api.OPENAI_CONFIGURATION_SCHEMA['~standard'].validate(configuration)).toMatchObject({ value: { reasoningEffort: 'low' } })
    expect(await api.OPENAI_CONFIGURATION_SCHEMA['~standard'].validate({ authorization: 'fixture' })).toHaveProperty('issues')
  })

})
