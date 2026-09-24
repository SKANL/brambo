import { describe, expect, it } from 'vitest'
import { createAnthropicProvider } from '../src/index.ts'

const workspace = { id: 'workspace-test', rootPath: 'C:/workspace', capabilities: ['read'] } as never
const response = (content: unknown[], id = 'msg-1') => ({ id, role: 'assistant', type: 'message', stop_reason: 'end_turn', content, usage: { input_tokens: 4, output_tokens: 2, cache_read_input_tokens: 2, cache_creation_input_tokens: 1 } })

describe('Anthropic capability integration', () => {
  it('puts explicit prompt caching and adaptive thinking on Messages without exposing thinking output', async () => {
    const requests: Record<string, unknown>[] = []
    const provider = createAnthropicProvider({ credential: 'secret', capabilities: { policy: { allowedCapabilities: ['prompt-caching', 'extended-thinking'], allowEgress: true, allowRetention: true, allowDeletion: false }, promptCaching: true, extendedThinking: { type: 'adaptive' } }, transport: async (_url, init) => { requests.push(JSON.parse(String(init.body))); return new Response(JSON.stringify(response([{ type: 'thinking', thinking: 'private', signature: 'opaque' }, { type: 'text', text: 'Answer' }]))) } })
    const result = await provider.create({ selection: { providerId: 'anthropic', model: 'claude-test', capabilities: ['prompt-caching', 'extended-thinking'], configuration: { system: 'Guide' } }, credential: undefined }).run({ prompt: 'Hi', workspace })
    expect(requests[0]).toMatchObject({ thinking: { type: 'adaptive' }, system: [{ type: 'text', text: 'Guide', cache_control: { type: 'ephemeral' } }] })
    expect(result).toMatchObject({ status: 'ok', summary: 'Answer', data: { usage: { cachedInputTokens: 2, raw: { cache_creation_input_tokens: 1 } } } })
    expect(JSON.stringify(result)).not.toContain('private')
  })
  it('places a cache breakpoint on prompt content when no system or tools exist', async () => {
    let body: Record<string, unknown> = {}
    const provider = createAnthropicProvider({ credential: 'secret', capabilities: { policy: { allowedCapabilities: ['prompt-caching'], allowEgress: true, allowRetention: true, allowDeletion: false }, promptCaching: true }, transport: async (_url, init) => { body = JSON.parse(String(init.body)); return new Response(JSON.stringify(response([{ type: 'text', text: 'Done' }]))) } })
    const result = await provider.create({ selection: { providerId: 'anthropic', model: 'claude-test', capabilities: ['prompt-caching'] }, credential: undefined }).run({ prompt: 'Hi', workspace })
    expect(result.status).toBe('ok')
    expect(body.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'Hi', cache_control: { type: 'ephemeral' } }] }])
  })
  it('maps allowlisted hosted web and remote MCP only after selected egress grants', async () => {
    const requests: Array<{ body: Record<string, unknown>; headers: Headers }> = []
    const provider = createAnthropicProvider({ credential: 'secret', capabilities: { policy: { allowedCapabilities: ['hosted-web-search', 'remote-mcp'], allowEgress: true, allowRetention: false, allowDeletion: false, webSearch: { allowPaidSearch: true, maxUses: 2, allowedDomains: ['example.com'] } }, webSearch: true, remoteMcp: [{ name: 'docs', url: 'https://example.com/mcp', allowedTools: ['search'], authorizationToken: 'mcp-private' }] }, transport: async (_url, init) => { requests.push({ body: JSON.parse(String(init.body)), headers: new Headers(init.headers) }); return new Response(JSON.stringify(response([{ type: 'text', text: 'Found' }]))) } })
    const result = await provider.create({ selection: { providerId: 'anthropic', model: 'claude-test', capabilities: ['hosted-web-search', 'remote-mcp'] }, credential: undefined }).run({ prompt: 'Search', workspace })
    expect(result.status).toBe('ok')
    expect(requests[0]?.body).toMatchObject({ tools: [{ type: 'web_search_20250305', max_uses: 2, allowed_domains: ['example.com'] }, { type: 'mcp_toolset', mcp_server_name: 'docs', default_config: { enabled: false }, configs: { search: { enabled: true } } }], mcp_servers: [{ type: 'url', name: 'docs', url: 'https://example.com/mcp', authorization_token: 'mcp-private' }] })
    expect(requests[0]?.headers.get('anthropic-beta')).toBe('mcp-client-2025-11-20')
    expect(JSON.stringify(result)).not.toContain('mcp-private')
  })
  it('uploads, reads, and deletes files with ownership cleanup on dispose', async () => {
    const operations: string[] = []
    const provider = createAnthropicProvider({ credential: 'secret', capabilities: { policy: { allowedCapabilities: ['provider-files'], allowEgress: true, allowRetention: true, allowDeletion: true }, files: [{ fileId: 'host-file', mediaType: 'image/png' }] }, transport: async (url, init) => { operations.push(`${init.method} ${url}`); if (init.method === 'POST' && url.endsWith('/files')) return new Response(JSON.stringify({ id: 'owned-file' })); if (init.method === 'GET') return new Response('bytes'); if (init.method === 'DELETE') return new Response(JSON.stringify({ id: url.split('/').at(-1), type: 'file_deleted' })); return new Response(JSON.stringify(response([{ type: 'text', text: 'Done' }]))) } })
    const adapter = provider.create({ selection: { providerId: 'anthropic', model: 'claude-test', capabilities: ['provider-files'] }, credential: undefined })
    expect((await adapter.run({ prompt: 'Describe', workspace })).status).toBe('ok')
    expect(await adapter.uploadFile(new Blob(['file']), 'note.txt')).toBe('owned-file')
    expect(new TextDecoder().decode(await adapter.readFile('owned-file'))).toBe('bytes')
    await expect(adapter.readFile('unknown-file')).rejects.toThrow()
    await expect(adapter.deleteFile('host-file')).rejects.toThrow()
    await adapter.dispose()
    expect(operations).toEqual(['POST https://api.anthropic.com/v1/messages', 'POST https://api.anthropic.com/v1/files', 'GET https://api.anthropic.com/v1/files/owned-file/content', 'DELETE https://api.anthropic.com/v1/files/owned-file'])
    expect(operations.join(' ')).not.toContain('host-file')
  })
  it('rejects unselected capabilities, unsafe endpoints, and stream escalation', () => {
    expect(() => createAnthropicProvider({ credential: 'secret', endpoint: 'http://example.com' })).toThrow()
    const provider = createAnthropicProvider({ credential: 'secret' })
    expect(() => provider.create({ selection: { providerId: 'anthropic', model: 'claude-test', capabilities: ['conversation-state'] }, credential: undefined })).toThrow()
    expect(() => provider.create({ selection: { providerId: 'anthropic', model: 'claude-test', configuration: { stream: true } }, credential: undefined })).toThrow()
  })
})
