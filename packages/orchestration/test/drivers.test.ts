import { describe, expect, it } from 'vitest'
import { defineStandardSchema, type DriverFactory, type DriverManifest, type DriverRequest, type DriverServices, type StandardSchemaV1 } from '@brambodev/contracts'
import * as orchestration from '../src/index.ts'
import { createDriverRegistry, negotiateCapabilities } from '../src/index.ts'

it('exposes explicitly registered driver creation', () => {
  expect(orchestration).toHaveProperty('createDriverRegistry', expect.any(Function))
  expect(orchestration).toHaveProperty('negotiateCapabilities', expect.any(Function))
})

const services: DriverServices = {
  dispatchTool: async () => { throw new Error('not used') },
  resolveSecret: async () => { throw new Error('not used') },
}
const request: DriverRequest = {
  key: { namespace: 'test', runId: 'run-1' }, sessionId: 'session-1', taskId: 'task-1', prompt: 'custom probe',
  context: null, workspace: { id: 'workspace-1', rootPath: '/contract-probe', capabilities: ['read'] },
  continuation: 'fresh', signal: new AbortController().signal,
}
const manifest: DriverManifest = {
  id: 'acme-driver', version: '1.0.0', kind: 'custom',
  capabilities: ['structured-output', 'acme:resume'],
  configurationSchema: defineStandardSchema((value) => ({ value })),
}
function factory(schema = defineStandardSchema((value) => ({ value }))): DriverFactory {
  const declared = { ...manifest, configurationSchema: schema }
  return { manifest: declared, create: async (configuration) => ({
    manifest: declared,
    run: async () => ({ result: { status: 'ok', data: configuration, summary: 'custom output' } }),
  }) }
}

describe('explicit driver registration', () => {
  it('accepts a custom implementation without any CLI traits', async () => {
    const registry = createDriverRegistry()
    registry.register(factory())
    const driver = await registry.resolve('acme-driver').create({ custom: true }, services)
    expect(driver.manifest.kind).toBe('custom')
    expect((await driver.run(request)).result.data).toEqual({ custom: true })
    expect(registry.list().map((entry) => entry.id)).toEqual(['acme-driver'])
  })

  it('refuses duplicates without replacing the registered implementation', () => {
    const registry = createDriverRegistry()
    registry.register(factory())
    expect(() => registry.register(factory())).toThrow(/already registered/)
    expect(registry.list()).toHaveLength(1)
  })

  it.each(['file:///unregistered.js', './unregistered.js', 'unknown', '__proto__', 'constructor'])('refuses unregistered identifier %s without discovery', (id) => {
    const registry = createDriverRegistry()
    expect(() => registry.resolve(id)).toThrow(/registered/)
    expect(registry.list()).toEqual([])
  })

  it('refuses invalid manifests before registration', () => {
    const registry = createDriverRegistry()
    expect(() => registry.register({ ...factory(), manifest: { ...manifest, capabilities: ['bad/path'] } })).toThrow()
    expect(registry.list()).toEqual([])
  })

  it('snapshots the manifest, capabilities, validator and factory method at registration', async () => {
    const mutable = factory()
    const registry = createDriverRegistry()
    registry.register(mutable)
    const original = registry.resolve('acme-driver')
    Object.assign(mutable.manifest, { id: 'escalated', capabilities: ['tool-interception'] })
    Object.assign(mutable, { create: () => { throw new Error('replaced factory') } })
    Object.assign(mutable.manifest.configurationSchema['~standard'], { validate: () => { throw new Error('replaced validator') } })
    expect(registry.list()[0]).toMatchObject({ id: 'acme-driver', capabilities: ['structured-output', 'acme:resume'] })
    expect(Object.isFrozen(original)).toBe(true)
    expect(Object.isFrozen(original.manifest.capabilities)).toBe(true)
    expect(Object.isFrozen(original.manifest.configurationSchema['~standard'])).toBe(true)
    expect(() => Object.assign(original.manifest, { capabilities: ['tool-interception'] })).toThrow()
    // The construction returned a mutated manifest; it must not silently escalate.
    await expect(original.create({}, services)).rejects.toThrow(/manifest/)
  })

  it('awaits asynchronous validation and passes only transformed output to construction', async () => {
    let release!: (value: { value: unknown }) => void
    let constructed: unknown = 'not constructed'
    const schema: StandardSchemaV1 = { '~standard': { version: 1, validate: () => new Promise((resolve) => { release = resolve }) } }
    const registered = factory(schema)
    const registry = createDriverRegistry()
    registry.register({ ...registered, create: async (value, hostServices) => {
      expect(hostServices).toBe(services)
      constructed = value
      return registered.create(value, hostServices)
    } })
    const pending = registry.resolve('acme-driver').create({ secret: 'raw' }, services)
    expect(constructed).toBe('not constructed')
    release({ value: { safe: true } })
    await pending
    expect(constructed).toEqual({ safe: true })
  })

  it.each([
    () => ({ issues: [{ message: 'secret-canary' }] }),
    () => { throw new Error('secret-canary') },
    async () => { throw new Error('secret-canary') },
    () => null,
    () => ({}),
    () => ({ value: {}, issues: [] }),
    () => ({ value: {}, issues: 'secret-canary' }),
  ])('refuses invalid, throwing or malformed schema outcomes without construction or secrets', async (validate) => {
    let constructed = false
    const schema = { '~standard': { version: 1, validate } } as unknown as StandardSchemaV1
    const registry = createDriverRegistry()
    registry.register({ ...factory(schema), create: async () => { constructed = true; throw new Error('constructed') } })
    const pending = registry.resolve('acme-driver').create({ secret: 'secret-canary' }, services)
    await expect(pending).rejects.toThrow(/invalid driver configuration/)
    await expect(pending).rejects.not.toThrow(/secret-canary/)
    expect(constructed).toBe(false)
  })

  it('preserves schema method receiver without freezing caller-owned schema objects', async () => {
    const standard = { version: 1 as const, label: 'normalized', validate() { return { value: this.label } } }
    const registry = createDriverRegistry()
    registry.register(factory({ '~standard': standard }))
    const driver = await registry.resolve('acme-driver').create({}, services)
    expect((await driver.run(request)).result.data).toBe('normalized')
    expect(driver.manifest.configurationSchema).not.toBe(manifest.configurationSchema)
    expect(Object.isFrozen(standard)).toBe(false)
  })
})

describe('capability intersection', () => {
  const input = { driver: { ...manifest, capabilities: ['streaming', 'native-continuation', 'acme:resume'] }, runtime: ['streaming', 'acme:resume'], policy: ['acme:resume'], required: ['acme:resume'], optional: ['streaming', 'native-continuation', 'future-core'] }
  it('preserves unknown vendor support and reports each unsupported optional capability', () => {
    expect(negotiateCapabilities(input)).toEqual({ effective: ['acme:resume'], degraded: ['streaming', 'native-continuation', 'future-core'] })
  })
  it.each(['driver', 'runtime', 'policy'] as const)('refuses required support absent from %s', (source) => {
    const base = { ...input, required: ['acme:resume'] }
    const lacking = source === 'driver' ? { ...base, driver: { ...base.driver, capabilities: [] } } : { ...base, [source]: [] }
    expect(() => negotiateCapabilities(lacking)).toThrow(/unsupported required capability/)
  })
  it('deduplicates requested support and exposes the entire intersection in driver order', () => {
    expect(negotiateCapabilities({ ...input, required: ['acme:resume', 'acme:resume'], optional: ['future-core', 'future-core'], runtime: ['streaming', 'acme:resume'], policy: ['streaming', 'acme:resume'] })).toEqual({ effective: ['streaming', 'acme:resume'], degraded: ['future-core'] })
  })
})
