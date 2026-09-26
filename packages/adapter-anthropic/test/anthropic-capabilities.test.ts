import { describe, expect, it } from 'vitest'
import { createAnthropicCapabilityHandlers } from '../src/index.ts'

const deny = { allowedCapabilities: [], allowEgress: false, allowRetention: false, allowDeletion: false } as const

describe('Anthropic hosted capabilities', () => {
  it('keeps all optional hosted features off by default', () => {
    const handlers = createAnthropicCapabilityHandlers({ selected: [], policy: deny })
    expect(handlers.requestFields()).toEqual({ tools: [], mcpServers: [], input: [], betaHeaders: [], thinking: undefined, promptCaching: false })
  })
  it('requires an explicit policy and trusted configuration for web search and MCP', () => {
    expect(() => createAnthropicCapabilityHandlers({ selected: ['hosted-web-search'], policy: deny, webSearch: true })).toThrow()
    expect(() => createAnthropicCapabilityHandlers({ selected: ['hosted-web-search'], policy: { ...deny, allowedCapabilities: ['hosted-web-search'], allowEgress: true }, webSearch: true })).toThrow(/web search policy/)
    expect(() => createAnthropicCapabilityHandlers({ selected: ['hosted-web-search'], policy: { ...deny, allowedCapabilities: ['hosted-web-search'], allowEgress: true, webSearch: { allowPaidSearch: true, maxUses: 0, allowedDomains: ['example.com'] } }, webSearch: true })).toThrow(/web search policy/)
    expect(() => createAnthropicCapabilityHandlers({ selected: ['hosted-web-search'], policy: { ...deny, allowedCapabilities: ['hosted-web-search'], allowEgress: true, webSearch: { allowPaidSearch: false, maxUses: 2, allowedDomains: ['example.com'] } as never }, webSearch: true })).toThrow(/web search policy/)
    expect(() => createAnthropicCapabilityHandlers({ selected: ['hosted-web-search'], policy: { ...deny, allowedCapabilities: ['hosted-web-search'], allowEgress: true, webSearch: { allowPaidSearch: true, maxUses: 2, allowedDomains: ['https://example.com'] } }, webSearch: true })).toThrow(/web search policy/)
    expect(() => createAnthropicCapabilityHandlers({ selected: ['remote-mcp'], policy: { ...deny, allowedCapabilities: ['remote-mcp'], allowEgress: true }, remoteMcp: [{ name: 'docs', url: 'http://untrusted', allowedTools: ['search'] }] })).toThrow()
    const handlers = createAnthropicCapabilityHandlers({ selected: ['hosted-web-search', 'remote-mcp'], policy: { ...deny, allowedCapabilities: ['hosted-web-search', 'remote-mcp'], allowEgress: true, webSearch: { allowPaidSearch: true, maxUses: 3, allowedDomains: ['example.com'] } }, webSearch: true, remoteMcp: [{ name: 'docs', url: 'https://example.com/mcp', allowedTools: ['search'] }] })
    expect(handlers.requestFields()).toMatchObject({ tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3, allowed_domains: ['example.com'] }, { type: 'mcp_toolset', mcp_server_name: 'docs' }], mcpServers: [{ type: 'url', name: 'docs', url: 'https://example.com/mcp' }], betaHeaders: ['mcp-client-2025-11-20'] })
  })
  it('requires file retention/deletion policy and removes adapter-owned files only', async () => {
    const removed: string[] = []
    const handlers = createAnthropicCapabilityHandlers({ selected: ['provider-files'], policy: { allowedCapabilities: ['provider-files'], allowEgress: true, allowRetention: true, allowDeletion: true }, files: [{ fileId: 'host-file', mediaType: 'application/pdf' }], removeOwned: async (resource) => { removed.push(resource.id) } })
    handlers.recordFile('owned-file')
    expect(handlers.requestFields().input).toEqual([{ type: 'document', source: { type: 'file', file_id: 'host-file' } }])
    await handlers.dispose()
    expect(removed).toEqual(['owned-file'])
  })
  it('gates prompt caching and thinking separately', () => {
    const policy = { allowedCapabilities: ['prompt-caching', 'extended-thinking'], allowEgress: true, allowRetention: true, allowDeletion: false } as const
    expect(() => createAnthropicCapabilityHandlers({ selected: ['extended-thinking'], policy })).toThrow()
    const handlers = createAnthropicCapabilityHandlers({ selected: ['prompt-caching', 'extended-thinking'], policy, promptCaching: true, extendedThinking: { type: 'adaptive' } })
    expect(handlers.requestFields()).toMatchObject({ promptCaching: true, thinking: { type: 'adaptive' } })
  })
})
