import { authorizeRemoteCapability, createRemoteResourceLedger } from '@brambodev/adapter-api'
import type { OwnedRemoteResource, RemoteCapabilityPolicy } from '@brambodev/adapter-api'
import type { ExecutorCapability } from '@brambodev/contracts'

export interface OpenAIRemoteMcpServer {
  readonly serverLabel: string
  readonly serverUrl: string
  readonly allowedTools?: readonly string[]
  readonly authorization?: string
}

export interface OpenAIFileInput { readonly fileId: string }

export interface OpenAICapabilityOptions {
  readonly selected: readonly ExecutorCapability[]
  readonly policy: RemoteCapabilityPolicy
  readonly webSearch?: boolean
  readonly remoteMcp?: readonly OpenAIRemoteMcpServer[]
  readonly files?: readonly OpenAIFileInput[]
  readonly removeOwned?: (resource: OwnedRemoteResource) => Promise<void>
}

export interface OpenAICapabilityHandlers {
  requestFields(): { readonly store: boolean; readonly tools: readonly Readonly<Record<string, unknown>>[]; readonly input: readonly Readonly<Record<string, unknown>>[] }
  recordResponse(id: string): void
  observeResponse(id: string): void
  recordFile(id: string): void
  observeFile(id: string): void
  recordRemoteMcp(id: string): void
  dispose(): Promise<void>
}

const advertised: readonly ExecutorCapability[] = ['conversation-state', 'prompt-caching', 'provider-files', 'remote-mcp', 'hosted-web-search']

function validId(value: string): boolean { return typeof value === 'string' && value.length > 0 && !/[\r\n]/.test(value) }

export function createOpenAICapabilityHandlers(options: OpenAICapabilityOptions): OpenAICapabilityHandlers {
  const grants = new Set<ExecutorCapability>()
  for (const capability of options.selected) {
    if (!advertised.includes(capability)) continue
    authorizeRemoteCapability({ capability, advertised, selected: options.selected, policy: options.policy })
    grants.add(capability)
  }
  if (options.webSearch && !grants.has('hosted-web-search')) throw new Error('hosted web search requires selected policy grant')
  if ((options.remoteMcp?.length ?? 0) > 0 && !grants.has('remote-mcp')) throw new Error('remote MCP requires selected policy grant')
  if ((options.files?.length ?? 0) > 0 && !grants.has('provider-files')) throw new Error('provider files require selected policy grant')
  if (grants.has('hosted-web-search') && options.webSearch !== true) throw new Error('hosted web search selection requires explicit configuration')
  if (grants.has('remote-mcp') && !options.remoteMcp?.length) throw new Error('remote MCP selection requires at least one server')
  const tools: Readonly<Record<string, unknown>>[] = []
  if (options.webSearch) tools.push({ type: 'web_search' })
  for (const server of options.remoteMcp ?? []) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(server.serverLabel)) throw new Error('invalid remote MCP server label')
    const url = new URL(server.serverUrl)
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('remote MCP URL must be HTTPS without embedded credentials')
    if (server.authorization?.includes('\n') || server.authorization?.includes('\r')) throw new Error('invalid remote MCP authorization')
    tools.push({ type: 'mcp', server_label: server.serverLabel, server_url: url.toString(), require_approval: 'always', ...(server.allowedTools === undefined ? {} : { allowed_tools: [...server.allowedTools] }), ...(server.authorization === undefined ? {} : { authorization: server.authorization }) })
  }
  const input = (options.files ?? []).map((file) => {
    if (!validId(file.fileId)) throw new Error('invalid provider file ID')
    return { type: 'input_file', file_id: file.fileId }
  })
  const ledger = createRemoteResourceLedger()
  for (const file of options.files ?? []) ledger.observe({ providerId: 'openai', kind: 'file', id: file.fileId, owner: 'host' })
  const record = (kind: OwnedRemoteResource['kind'], id: string): void => {
    if (!validId(id)) throw new Error('invalid remote resource ID')
    ledger.record({ providerId: 'openai', kind, id, owner: 'adapter' })
  }
  return {
    requestFields: () => ({ store: grants.has('conversation-state'), tools: [...tools], input: [...input] }),
    recordResponse(id): void { if (!grants.has('conversation-state')) throw new Error('conversation state is not enabled'); record('conversation', id) },
    observeResponse(id): void { if (!validId(id)) throw new Error('invalid response ID'); ledger.observe({ providerId: 'openai', kind: 'conversation', id, owner: 'host' }) },
    recordFile(id): void { if (!grants.has('provider-files')) throw new Error('provider files are not enabled'); record('file', id) },
    observeFile(id): void { if (!validId(id)) throw new Error('invalid file ID'); ledger.observe({ providerId: 'openai', kind: 'file', id, owner: 'host' }) },
    recordRemoteMcp(id): void { if (!grants.has('remote-mcp')) throw new Error('remote MCP is not enabled'); record('remote-mcp', id) },
    dispose(): Promise<void> { return ledger.dispose(async (resource) => {
      if (options.removeOwned === undefined) throw new Error('remote resource cleanup handler is required')
      await options.removeOwned(resource)
    }) },
  }
}
