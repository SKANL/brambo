import { describe, expect, it } from 'vitest'
import { validateDriverManifest, DRIVER_MANIFEST_SCHEMA } from '../src/execution-driver.ts'
import { defineStandardSchema } from '../src/standard-schema.ts'

const manifest = { id: 'driver-1', version: '1.0.0', kind: 'custom', capabilities: ['streaming', 'acme:resume'], configurationSchema: defineStandardSchema((value) => ({ value })) }

describe('provider-agnostic driver manifests', () => {
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
