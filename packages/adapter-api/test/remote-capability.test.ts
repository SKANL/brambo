import { describe, expect, it, vi } from 'vitest'
import { authorizeRemoteCapability, createRemoteResourceLedger, type RemoteCapabilityPolicy } from '../src/index.ts'

const allowPolicy: RemoteCapabilityPolicy = {
  allowedCapabilities: ['remote-mcp', 'hosted-web-search', 'provider-files'],
  allowEgress: true,
  allowRetention: true,
  allowDeletion: true,
}

function request(capability: 'remote-mcp' | 'hosted-web-search' | 'provider-files', policy = allowPolicy) {
  return { capability, advertised: [capability], selected: [capability], policy }
}

describe('authorizeRemoteCapability', () => {
  it('requires a provider advertisement, host selection, and explicit policy grant', () => {
    expect(() => authorizeRemoteCapability({ ...request('remote-mcp'), advertised: [] })).toThrow(/not advertised/i)
    expect(() => authorizeRemoteCapability({ ...request('remote-mcp'), selected: [] })).toThrow(/not selected/i)
    expect(() => authorizeRemoteCapability({ ...request('remote-mcp'), policy: { ...allowPolicy, allowedCapabilities: [] } })).toThrow(/not granted/i)

    expect(authorizeRemoteCapability(request('remote-mcp'))).toEqual({ capability: 'remote-mcp' })
  })

  it('requires egress policy for hosted web search', () => {
    expect(() => authorizeRemoteCapability({ ...request('hosted-web-search'), policy: { ...allowPolicy, allowEgress: false } })).toThrow(/egress/i)

    expect(authorizeRemoteCapability(request('hosted-web-search'))).toEqual({ capability: 'hosted-web-search' })
  })

  it('requires explicit retention and deletion policy for provider files', () => {
    expect(() => authorizeRemoteCapability({ ...request('provider-files'), policy: { ...allowPolicy, allowEgress: false } })).toThrow(/egress/i)
    expect(() => authorizeRemoteCapability({ ...request('provider-files'), policy: { ...allowPolicy, allowRetention: false } })).toThrow(/retention/i)
    expect(() => authorizeRemoteCapability({ ...request('provider-files'), policy: { ...allowPolicy, allowDeletion: false } })).toThrow(/deletion/i)

    expect(authorizeRemoteCapability(request('provider-files'))).toEqual({ capability: 'provider-files' })
  })
})

describe('RemoteResourceLedger', () => {
  it('deletes only adapter-owned remote resources and is idempotent', async () => {
    const ledger = createRemoteResourceLedger()
    const remove = vi.fn(async () => undefined)

    ledger.record({ providerId: 'openai', kind: 'file', id: 'owned', owner: 'adapter' })
    ledger.observe({ providerId: 'openai', kind: 'file', id: 'host', owner: 'host' })

    await ledger.dispose(remove)
    await ledger.dispose(remove)

    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'owned' }))
    expect(remove).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'host' }))
  })

  it('remembers ownership before exposure and aggregates cleanup failures', async () => {
    const ledger = createRemoteResourceLedger()
    const first = new Error('first cleanup failed')
    const second = new Error('second cleanup failed')
    const remove = vi.fn(async (resource: { readonly id: string }) => {
      throw resource.id === 'one' ? first : second
    })

    ledger.record({ providerId: 'openai', kind: 'file', id: 'one', owner: 'adapter' })
    ledger.record({ providerId: 'openai', kind: 'file', id: 'two', owner: 'adapter' })

    await expect(ledger.dispose(remove)).rejects.toMatchObject({ errors: [first, second] })
    await expect(ledger.dispose(remove)).rejects.toMatchObject({ errors: [first, second] })

    expect(remove).toHaveBeenCalledTimes(2)
  })
})
