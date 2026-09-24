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

describe('installed executor provider discovery', () => {
  it('never loads a candidate outside the host allowlist', async () => {
    const load = vi.fn(async () => provider('@attacker/arbitrary', 'attacker'))
    const registry = createExecutorRegistry()

    const result = await discoverExecutorProviders({ allowlist: ['@acme/known'], candidates: ['@attacker/arbitrary'], load, registry })

    expect(load).not.toHaveBeenCalled()
    expect(result.accepted).toEqual([])
    expect(result.rejected).toEqual([{ packageName: '@attacker/arbitrary', reason: 'not-allowlisted' }])
    expect(registry.list()).toEqual([])
  })

  it('rejects an incompatible manifest before registry mutation', async () => {
    const registry = createExecutorRegistry()
    const invalid = provider('@acme/known', 'known')
    const load = vi.fn(async () => ({ ...invalid, manifest: { ...invalid.manifest, contractVersion: '2' } }))

    const result = await discoverExecutorProviders({ allowlist: ['@acme/known'], candidates: ['@acme/known'], load, registry })

    expect(result.rejected).toEqual([{ packageName: '@acme/known', reason: 'invalid-manifest' }])
    expect(registry.list()).toEqual([])
  })

  it('rejects malformed module exports and mismatched package identities', async () => {
    const registry = createExecutorRegistry()
    const load = vi.fn(async (packageName: string) =>
      packageName === '@acme/malformed' ? { manifest: provider('@acme/malformed', 'malformed').manifest } : provider('@acme/other', 'other'))

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
    const load = vi.fn(async () => provider('@acme/discovered', 'shared'))

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
      return provider(packageName, 'good')
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
    const load = vi.fn(async (packageName: string) => provider(packageName, packageName === '@acme/repeated' ? 'first' : packageName.split('/')[1]!))

    const result = await discoverExecutorProviders({ allowlist: packages, candidates: packages, load, registry })

    expect(result.diagnostics).toEqual([
      { packageName: '@acme/first', providerId: 'first', reason: 'accepted' },
      { packageName: '@acme/second', providerId: 'second', reason: 'accepted' },
      { packageName: '@acme/repeated', reason: 'duplicate-provider-id' },
    ])
    expect(registry.list().map((manifest) => manifest.id)).toEqual(['first', 'second'])
  })
})
