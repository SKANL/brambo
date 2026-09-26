import { describe, expect, it, vi } from 'vitest'
import { authorizeRemoteCapability, createRemoteResourceLedger, type RemoteCapabilityPolicy } from '../src/index.ts'

const allowPolicy: RemoteCapabilityPolicy = {
  allowedCapabilities: ['conversation-state', 'prompt-caching', 'extended-thinking', 'remote-mcp', 'hosted-web-search', 'provider-files'],
  allowEgress: true,
  allowRetention: true,
  allowDeletion: true,
}

function request(capability: 'conversation-state' | 'prompt-caching' | 'extended-thinking' | 'remote-mcp' | 'hosted-web-search' | 'provider-files', policy = allowPolicy) {
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

  it('fails closed for every remote or stateful capability policy requirement', () => {
    expect(() => authorizeRemoteCapability({ ...request('conversation-state'), policy: { ...allowPolicy, allowEgress: false } })).toThrow(/egress/i)
    expect(() => authorizeRemoteCapability({ ...request('conversation-state'), policy: { ...allowPolicy, allowRetention: false } })).toThrow(/retention/i)
    expect(() => authorizeRemoteCapability({ ...request('conversation-state'), policy: { ...allowPolicy, allowDeletion: false } })).toThrow(/deletion/i)
    expect(() => authorizeRemoteCapability({ ...request('prompt-caching'), policy: { ...allowPolicy, allowEgress: false } })).toThrow(/egress/i)
    expect(() => authorizeRemoteCapability({ ...request('prompt-caching'), policy: { ...allowPolicy, allowRetention: false } })).toThrow(/retention/i)
    expect(() => authorizeRemoteCapability({ ...request('extended-thinking'), policy: { ...allowPolicy, allowEgress: false } })).toThrow(/egress/i)
    expect(() => authorizeRemoteCapability({ ...request('streaming' as never) })).toThrow(/provider-hosted/i)
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

  it('keeps distinct resources whose former delimiter keys collided', async () => {
    const ledger = createRemoteResourceLedger()
    const remove = vi.fn(async () => undefined)
    const owned = { providerId: 'openai', kind: 'file' as const, id: 'one\u0000file\u0000two', owner: 'adapter' as const }

    ledger.record(owned)
    ledger.observe({ providerId: 'openai\u0000file\u0000one', kind: 'file', id: 'two', owner: 'host' })

    await ledger.dispose(remove)

    expect(remove).toHaveBeenCalledWith(owned)
  })

  it('closes before synchronous cleanup callbacks can record resources', async () => {
    const ledger = createRemoteResourceLedger()
    const rejectedRecord = new Error('record must be rejected')
    let recordError: unknown
    const remove = vi.fn(() => {
      try {
        ledger.record({ providerId: 'openai', kind: 'file', id: 'late', owner: 'adapter' })
        throw rejectedRecord
      } catch (error) {
        recordError = error
      }
    })

    ledger.record({ providerId: 'openai', kind: 'file', id: 'owned', owner: 'adapter' })
    await ledger.dispose(remove)

    expect(recordError).toBeInstanceOf(Error)
    expect((recordError as Error).message).toMatch(/disposing/i)
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('settles every synchronous cleanup exception before aggregating failures', async () => {
    const ledger = createRemoteResourceLedger()
    const first = new Error('first synchronous cleanup failed')
    const second = new Error('second synchronous cleanup failed')
    const remove = vi.fn((resource: { readonly id: string }) => {
      throw resource.id === 'one' ? first : second
    })

    ledger.record({ providerId: 'openai', kind: 'file', id: 'one', owner: 'adapter' })
    ledger.record({ providerId: 'openai', kind: 'file', id: 'two', owner: 'adapter' })

    await expect(ledger.dispose(remove)).rejects.toMatchObject({ errors: [first, second] })
    expect(remove).toHaveBeenCalledTimes(2)
  })
})
