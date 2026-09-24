import { authorizeRemoteCapability, createRemoteResourceLedger } from '@brambodev/adapter-api'
import type { OwnedRemoteResource, RemoteCapabilityPolicy } from '@brambodev/adapter-api'
import type { ExecutorCapability } from '@brambodev/contracts'

export interface AnthropicRemoteMcpServer { readonly name: string; readonly url: string; readonly allowedTools: readonly string[]; readonly authorizationToken?: string }
export interface AnthropicFileInput { readonly fileId: string; readonly mediaType: string }
export interface AnthropicCapabilityOptions {
  readonly selected: readonly ExecutorCapability[]
  readonly policy: RemoteCapabilityPolicy
  readonly webSearch?: boolean
  readonly remoteMcp?: readonly AnthropicRemoteMcpServer[]
  readonly files?: readonly AnthropicFileInput[]
  readonly promptCaching?: boolean
  readonly extendedThinking?: { readonly type: 'adaptive' } | { readonly type: 'enabled'; readonly budgetTokens: number }
  readonly removeOwned?: (resource: OwnedRemoteResource) => Promise<void>
}
export interface AnthropicCapabilityHandlers {
  requestFields(): { readonly tools: readonly Readonly<Record<string, unknown>>[]; readonly mcpServers: readonly Readonly<Record<string, unknown>>[]; readonly input: readonly Readonly<Record<string, unknown>>[]; readonly betaHeaders: readonly string[]; readonly thinking?: Readonly<Record<string, unknown>>; readonly promptCaching: boolean }
  recordFile(id: string): void
  observeFile(id: string): void
  dispose(): Promise<void>
}

const advertised: readonly ExecutorCapability[] = ['hosted-web-search', 'remote-mcp', 'provider-files', 'prompt-caching', 'extended-thinking']
function validId(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && !/[\r\n]/.test(value) }
function validName(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value) }

export function createAnthropicCapabilityHandlers(options: AnthropicCapabilityOptions): AnthropicCapabilityHandlers {
  const grants = new Set<ExecutorCapability>()
  for (const capability of options.selected) {
    if (!advertised.includes(capability)) continue
    authorizeRemoteCapability({ capability, advertised, selected: options.selected, policy: options.policy })
    grants.add(capability)
  }
  if (options.webSearch && !grants.has('hosted-web-search')) throw new Error('Anthropic web search requires a selected host policy grant')
  if ((options.remoteMcp?.length ?? 0) > 0 && !grants.has('remote-mcp')) throw new Error('Anthropic remote MCP requires a selected host policy grant')
  if ((options.files?.length ?? 0) > 0 && !grants.has('provider-files')) throw new Error('Anthropic files require a selected host policy grant')
  if (options.promptCaching && !grants.has('prompt-caching')) throw new Error('Anthropic prompt caching requires a selected host policy grant')
  if (options.extendedThinking && !grants.has('extended-thinking')) throw new Error('Anthropic thinking requires a selected host policy grant')
  if (grants.has('hosted-web-search') && options.webSearch !== true) throw new Error('Anthropic web search requires explicit configuration')
  if (grants.has('remote-mcp') && !options.remoteMcp?.length) throw new Error('Anthropic remote MCP requires explicit server configuration')
  if (grants.has('prompt-caching') && options.promptCaching !== true) throw new Error('Anthropic prompt caching requires explicit configuration')
  if (grants.has('extended-thinking') && options.extendedThinking === undefined) throw new Error('Anthropic thinking requires explicit configuration')
  if (options.extendedThinking?.type === 'enabled' && (!Number.isSafeInteger(options.extendedThinking.budgetTokens) || options.extendedThinking.budgetTokens < 1024)) throw new Error('Anthropic thinking budget must be at least 1024')

  const tools: Readonly<Record<string, unknown>>[] = []
  const mcpServers: Readonly<Record<string, unknown>>[] = []
  const betaHeaders: string[] = []
  if (options.webSearch) tools.push({ type: 'web_search_20250305', name: 'web_search' })
  const names = new Set<string>()
  for (const server of options.remoteMcp ?? []) {
    if (!validName(server.name) || names.has(server.name)) throw new Error('invalid or duplicate Anthropic remote MCP server name')
    names.add(server.name)
    let url: URL
    try { url = new URL(server.url) } catch { throw new Error('invalid Anthropic remote MCP URL') }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Anthropic remote MCP URL must be HTTPS without embedded credentials')
    if (!Array.isArray(server.allowedTools) || server.allowedTools.length === 0 || server.allowedTools.some((name) => !validName(name)) || new Set(server.allowedTools).size !== server.allowedTools.length) throw new Error('Anthropic remote MCP requires a unique tool allowlist')
    if (server.authorizationToken !== undefined && !validId(server.authorizationToken)) throw new Error('invalid Anthropic remote MCP token')
    mcpServers.push({ type: 'url', name: server.name, url: url.toString(), ...(server.authorizationToken === undefined ? {} : { authorization_token: server.authorizationToken }) })
    tools.push({ type: 'mcp_toolset', mcp_server_name: server.name, default_config: { enabled: false }, configs: Object.fromEntries(server.allowedTools.map((name) => [name, { enabled: true }])) })
  }
  if (mcpServers.length) betaHeaders.push('mcp-client-2025-11-20')
  const input = (options.files ?? []).map((file) => {
    if (!validId(file.fileId)) throw new Error('invalid Anthropic file ID')
    if (file.mediaType === 'application/pdf' || file.mediaType === 'text/plain') return { type: 'document', source: { type: 'file', file_id: file.fileId } }
    if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mediaType)) return { type: 'image', source: { type: 'file', file_id: file.fileId } }
    throw new Error('unsupported Anthropic file media type')
  })
  const ledger = createRemoteResourceLedger()
  for (const file of options.files ?? []) ledger.observe({ providerId: 'anthropic', kind: 'file', id: file.fileId, owner: 'host' })
  return {
    requestFields: () => ({ tools: [...tools], mcpServers: [...mcpServers], input: [...input], betaHeaders: [...betaHeaders], thinking: options.extendedThinking === undefined ? undefined : options.extendedThinking.type === 'adaptive' ? { type: 'adaptive' } : { type: 'enabled', budget_tokens: options.extendedThinking.budgetTokens }, promptCaching: grants.has('prompt-caching') }),
    recordFile(id): void { if (!grants.has('provider-files') || !validId(id)) throw new Error('Anthropic provider file is not enabled or invalid'); ledger.record({ providerId: 'anthropic', kind: 'file', id, owner: 'adapter' }) },
    observeFile(id): void { if (!validId(id)) throw new Error('invalid Anthropic provider file ID'); ledger.observe({ providerId: 'anthropic', kind: 'file', id, owner: 'host' }) },
    dispose(): Promise<void> { return ledger.dispose(async (resource) => { if (options.removeOwned === undefined) throw new Error('Anthropic remote file cleanup handler is required'); await options.removeOwned(resource) }) },
  }
}
