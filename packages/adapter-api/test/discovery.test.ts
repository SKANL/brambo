import { describe, expect, it, vi } from 'vitest'
import { defineStandardSchema } from '@brambodev/contracts'
import type { ExecutorProvider } from '@brambodev/contracts'
import { createExecutorRegistry, discoverExecutorProviders } from '../src/index.ts'

const configurationSchema = defineStandardSchema((value) => ({ value }))

function provider(packageName: string, id: string): ExecutorProvider {
  return {
    manifest: { id, displayName: id, contractVersion: '1', packageName, capabilities: [], configurationSchema },
    create: () => ({ run: async () => ({ status: 'ok', data: null, summary: 'done' }) }),
  }
}

function installed(packageName: string, id: string) {
  const loadedProvider = provider(packageName, id)
  return { packageJson: { name: packageName, brambo: { executor: loadedProvider.manifest } }, provider: loadedProvider }
}

describe('installed executor provider discovery', () => {
  it('never loads a candidate outside the host allowlist', async () => {
    const load = vi.fn(async () => installed('@attacker/arbitrary', 'attacker'))
    const registry = createExecutorRegistry()

    const result = await discoverExecutorProviders({ allowlist: ['@acme/known'], candidates: ['@attacker/arbitrary'], load, registry })

    expect(load).not.toHaveBeenCalled()
    expect(result.accepted).toEqual([])
    expect(result.rejected).toEqual([{ packageName: '@attacker/arbitrary', reason: 'not-allowlisted' }])
    expect(registry.list()).toEqual([])
  })

  it('rejects an incompatible manifest before registry mutation', async () => {
    const registry = createExecutorRegistry()
    const invalid = installed('@acme/known', 'known')
    const load = vi.fn(async () => ({ ...invalid, packageJson: { ...invalid.packageJson, brambo: { executor: { ...invalid.provider.manifest, contractVersion: '2' } } } }))

    const result = await discoverExecutorProviders({ allowlist: ['@acme/known'], candidates: ['@acme/known'], load, registry })

    expect(result.rejected).toEqual([{ packageName: '@acme/known', reason: 'invalid-manifest' }])
    expect(registry.list()).toEqual([])
  })

  it('rejects malformed module exports and mismatched package identities', async () => {
    const registry = createExecutorRegistry()
    const load = vi.fn(async (packageName: string) =>
      packageName === '@acme/malformed' ? { packageJson: installed('@acme/malformed', 'malformed').packageJson } : installed('@acme/other', 'other'))

    const result = await discoverExecutorProviders({
      allowlist: ['@acme/malformed', '@acme/mismatch'], candidates: ['@acme/malformed', '@acme/mismatch'], load, registry,
    })

    expect(result.rejected).toEqual([
      { packageName: '@acme/malformed', reason: 'invalid-module' },
      { packageName: '@acme/mismatch', reason: 'package-mismatch' },
    ])
    expect(registry.list()).toEqual([])
  })

  it('preserves explicit registration when a discovered provider has the same ID', async () => {
    const registry = createExecutorRegistry()
    const explicit = provider('@acme/explicit', 'shared')
    registry.register(explicit)
    const load = vi.fn(async () => installed('@acme/discovered', 'shared'))

    const result = await discoverExecutorProviders({
      allowlist: ['@acme/discovered'], candidates: ['@acme/discovered'], load, registry,
    })

    expect(result.rejected).toEqual([{ packageName: '@acme/discovered', reason: 'duplicate-provider-id' }])
    expect(registry.resolve('shared').manifest.packageName).toBe('@acme/explicit')
  })

  it('continues in candidate order after a loader failure without exposing its error', async () => {
    const registry = createExecutorRegistry()
    const load = vi.fn(async (packageName: string) => {
      if (packageName === '@acme/bad') throw new Error('secret credential')
      return installed(packageName, 'good')
    })

    const result = await discoverExecutorProviders({
      allowlist: ['@acme/bad', '@acme/good'], candidates: ['@acme/bad', '@acme/good'], load, registry,
    })

    expect(load.mock.calls.map(([name]) => name)).toEqual(['@acme/bad', '@acme/good'])
    expect(result.diagnostics).toEqual([
      { packageName: '@acme/bad', reason: 'load-failed' },
      { packageName: '@acme/good', providerId: 'good', reason: 'accepted' },
    ])
    expect(JSON.stringify(result)).not.toContain('secret credential')
    expect(registry.resolve('good').manifest.packageName).toBe('@acme/good')
  })

  it('accepts compatible providers in candidate order and rejects repeated IDs', async () => {
    const registry = createExecutorRegistry()
    const packages = ['@acme/first', '@acme/second', '@acme/repeated']
    const load = vi.fn(async (packageName: string) => installed(packageName, packageName === '@acme/repeated' ? 'first' : packageName.split('/')[1]!))

    const result = await discoverExecutorProviders({ allowlist: packages, candidates: packages, load, registry })

    expect(result.diagnostics).toEqual([
      { packageName: '@acme/first', providerId: 'first', reason: 'accepted' },
      { packageName: '@acme/second', providerId: 'second', reason: 'accepted' },
      { packageName: '@acme/repeated', reason: 'duplicate-provider-id' },
    ])
    expect(registry.list().map((manifest) => manifest.id)).toEqual(['first', 'second'])
  })

  it('rejects a provider without versioned brambo.executor package metadata', async () => {
    const registry = createExecutorRegistry()
    const load = vi.fn(async () => provider('@acme/legacy', 'legacy'))

    const result = await discoverExecutorProviders({ allowlist: ['@acme/legacy'], candidates: ['@acme/legacy'], load, registry })

    expect(result.rejected).toEqual([{ packageName: '@acme/legacy', reason: 'invalid-module' }])
    expect(registry.list()).toEqual([])
  })

  it('rejects package metadata that disagrees with the provider capabilities', async () => {
    const registry = createExecutorRegistry()
    const loaded = installed('@acme/incompatible', 'incompatible')
    const load = vi.fn(async () => ({ ...loaded, packageJson: {
      ...loaded.packageJson, brambo: { executor: { ...loaded.provider.manifest, capabilities: ['local-tools'] } },
    } }))

    const result = await discoverExecutorProviders({ allowlist: ['@acme/incompatible'], candidates: ['@acme/incompatible'], load, registry })

    expect(result.rejected).toEqual([{ packageName: '@acme/incompatible', reason: 'invalid-manifest' }])
    expect(registry.list()).toEqual([])
  })

  it('registers the validated identity despite a stateful provider manifest getter', async () => {
    const registry = createExecutorRegistry()
    const valid = installed('@acme/stable', 'stable')
    let reads = 0
    const shiftingManifest = {
      ...valid.provider.manifest,
      get id() { return ++reads === 1 ? 'stable' : 'changed' },
    }
    const load = vi.fn(async () => ({ ...valid, provider: { ...valid.provider, manifest: shiftingManifest } }))

    const result = await discoverExecutorProviders({ allowlist: ['@acme/stable'], candidates: ['@acme/stable'], load, registry })

    expect(result.accepted).toEqual([{ packageName: '@acme/stable', providerId: 'stable', reason: 'accepted' }])
    expect(registry.resolve('stable').manifest.id).toBe('stable')
    expect(() => registry.resolve('changed')).toThrow(/unknown/)
    expect(reads).toBe(1)
  })

  it('turns throwing manifest getters into ordered rejection diagnostics', async () => {
    const registry = createExecutorRegistry()
    const broken = installed('@acme/broken', 'broken')
    const load = vi.fn(async (packageName: string) => packageName === '@acme/broken'
      ? { ...broken, packageJson: { ...broken.packageJson, brambo: { executor: { ...broken.provider.manifest, get packageName(): string { throw new Error('secret') } } } } }
      : installed('@acme/good', 'good'))

    const result = await discoverExecutorProviders({ allowlist: ['@acme/broken', '@acme/good'], candidates: ['@acme/broken', '@acme/good'], load, registry })

    expect(result.diagnostics).toEqual([
      { packageName: '@acme/broken', reason: 'invalid-manifest' },
      { packageName: '@acme/good', providerId: 'good', reason: 'accepted' },
    ])
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(registry.list().map((manifest) => manifest.id)).toEqual(['good'])
  })
})
