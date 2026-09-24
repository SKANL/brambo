import { executeWithRetry, normalizeProviderError, redactProviderMetadata, runLocalToolLoop } from '@brambodev/adapter-api'
import type { ProviderToolCall, ProviderToolExecutionOutcome } from '@brambodev/adapter-api'
import type { ApiUsageObservation, ExecutorAdapter, ExecutorManifest, ExecutorProvider, ExecutorProviderCreateOptions, ResultEnvelope, RunRequest } from '@brambodev/contracts'
import { defineStandardSchema, validateExecutorSelection, validateRunRequest } from '@brambodev/contracts'
import { executeTool } from '@brambodev/session'
import type { ExecuteToolOptions } from '@brambodev/session'
import { createAnthropicCapabilityHandlers } from './anthropic-capabilities.ts'
import type { AnthropicCapabilityOptions } from './anthropic-capabilities.ts'
import { collectAnthropicMessage } from './anthropic-events.ts'
import type { AnthropicProviderEvent } from './anthropic-events.ts'
import { parseAnthropicToolUse, toAnthropicToolDefinition, toAnthropicToolResult, validateAnthropicToolArguments } from './anthropic-tools.ts'
import type { AnthropicToolUse, BramboToolDefinition } from './anthropic-tools.ts'

export type AnthropicTransport = (url: string, init: RequestInit) => Promise<Response>
export interface AnthropicLocalToolHost {
  readonly definitions: readonly BramboToolDefinition[]
  readonly sessionId: string
  readonly turnId: string
  readonly limits: { readonly maxSteps: number; readonly maxConcurrentCalls: number }
  readonly createExecution: (call: ProviderToolCall, signal: AbortSignal) => ExecuteToolOptions
}
export interface AnthropicProviderObservation { readonly kind: 'usage' | 'error' | 'rate-limit'; readonly value: unknown }
export interface AnthropicProviderOptions {
  readonly credential?: string | (() => string | Promise<string>)
  readonly transport?: AnthropicTransport
  readonly endpoint?: string
  readonly toolLoop?: AnthropicLocalToolHost
  readonly capabilities?: Omit<AnthropicCapabilityOptions, 'selected'>
  readonly onObservation?: (observation: AnthropicProviderObservation) => void
  /** Only bounded, redacted deltas, citations, and correlation metadata reach this sink. */
  readonly onEvent?: (event: { readonly type: string; readonly sequence: number; readonly turnIndex: number; readonly requestId?: string; readonly responseId?: string; readonly index?: number; readonly delta?: string; readonly citation?: Readonly<Record<string, unknown>> }) => void
  readonly now?: () => number
}
export interface AnthropicAdapter extends ExecutorAdapter {
  dispose(): Promise<void>
  uploadFile(file: Blob, filename: string): Promise<string>
  readFile(id: string): Promise<Uint8Array>
  deleteFile(id: string): Promise<void>
}

interface AnthropicConfiguration { readonly system?: string; readonly stream?: boolean; readonly maxTokens?: number; readonly temperature?: number }
const configurationSchema = defineStandardSchema<AnthropicConfiguration>((value) => {
  if (value === undefined) return { value: {} }
  if (!record(value)) return { issues: [{ message: 'Anthropic configuration must be an object' }] }
  const allowed = ['system', 'stream', 'maxTokens', 'temperature']
  if (Object.keys(value).some((key) => !allowed.includes(key)) ||
    (value.system !== undefined && (typeof value.system !== 'string' || value.system.length === 0)) ||
    (value.stream !== undefined && typeof value.stream !== 'boolean') ||
    (value.maxTokens !== undefined && (!Number.isSafeInteger(value.maxTokens) || (value.maxTokens as number) < 1)) ||
    (value.temperature !== undefined && (typeof value.temperature !== 'number' || !Number.isFinite(value.temperature) || value.temperature < 0 || value.temperature > 1))) return { issues: [{ message: 'Anthropic configuration has unsupported or invalid fields' }] }
  return { value: value as AnthropicConfiguration }
})

export const ANTHROPIC_EXECUTOR_MANIFEST: ExecutorManifest = Object.freeze({
  id: 'anthropic', displayName: 'Anthropic API', contractVersion: '1', packageName: '@brambodev/adapter-anthropic',
  capabilities: Object.freeze(['streaming', 'local-tools', 'prompt-caching', 'extended-thinking', 'provider-files', 'remote-mcp', 'hosted-web-search'] as const),
  configurationSchema,
})

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function nonEmpty(value: unknown): string | undefined { return typeof value === 'string' && value.length > 0 ? value : undefined }
function token(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined }
function textOf(message: Record<string, unknown>): string { return Array.isArray(message.content) ? message.content.filter((block): block is Record<string, unknown> => record(block) && block.type === 'text').map((block) => typeof block.text === 'string' ? block.text : '').join('') : '' }
function citationsOf(message: Record<string, unknown>, turnIndex: number): ReadonlyArray<{ readonly turnIndex: number; readonly blockIndex: number; readonly citation: Readonly<Record<string, unknown>> }> {
  if (!Array.isArray(message.content)) return []
  return message.content.flatMap((block: unknown, blockIndex: number) => record(block) && block.type === 'text' && Array.isArray(block.citations)
    ? block.citations.filter((citation: unknown): citation is Record<string, unknown> => record(citation) && typeof citation.type === 'string').map((citation: Record<string, unknown>) => ({ turnIndex, blockIndex, citation }))
    : [])
}
function webSearchCount(message: Record<string, unknown>): number | undefined {
  if (!record(message.usage) || !record(message.usage.server_tool_use)) return undefined
  const count = message.usage.server_tool_use.web_search_requests
  return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count : undefined
}
function pendingMixedWebSearch(message: Record<string, unknown>): boolean {
  if (message.stop_reason !== 'tool_use' || !Array.isArray(message.content)) return false
  const blocks = message.content.filter(record)
  // Anthropic defers a server search paired with a client tool until the client result arrives.
  return blocks.some((block) => block.type === 'tool_use') &&
    blocks.some((block) => block.type === 'server_tool_use' && block.name === 'web_search' && nonEmpty(block.id) !== undefined) &&
    !blocks.some((block) => block.type === 'web_search_tool_result')
}
function toolsOf(message: Record<string, unknown>): AnthropicToolUse[] {
  if (!Array.isArray(message.content)) throw new Error('Anthropic message content is invalid')
  return message.content.filter((block): block is Record<string, unknown> => record(block) && block.type === 'tool_use').map(parseAnthropicToolUse)
}
function rateMetadata(headers: Headers): Readonly<Record<string, string>> {
  const rates: Record<string, string> = {}
  for (const [name, value] of headers) if (/^anthropic-ratelimit-(requests|tokens|input-tokens|output-tokens)-(limit|remaining|reset)$/i.test(name)) rates[name] = value
  return rates
}
function usageOf(message: Record<string, unknown>, model: string, requestId: string | undefined, now: () => number, secrets: readonly string[]): ApiUsageObservation | undefined {
  if (!record(message.usage)) return undefined
  const usage = message.usage
  return { providerId: 'anthropic', model, observedAt: new Date(now()).toISOString(), ...(requestId === undefined ? {} : { requestId }),
    ...(token(usage.input_tokens) === undefined ? {} : { inputTokens: token(usage.input_tokens) }),
    ...(token(usage.output_tokens) === undefined ? {} : { outputTokens: token(usage.output_tokens) }),
    ...(token(usage.cache_read_input_tokens) === undefined ? {} : { cachedInputTokens: token(usage.cache_read_input_tokens) }),
    raw: redactProviderMetadata(usage, secrets) as Readonly<Record<string, unknown>> }
}
function usageTotals(turns: readonly { readonly usage?: ApiUsageObservation }[]): Readonly<Record<string, number>> {
  const totals: Record<string, number> = {}
  for (const key of ['inputTokens', 'outputTokens', 'cachedInputTokens', 'reasoningTokens'] as const) {
    const values = turns.map((turn) => turn.usage?.[key]).filter((value): value is number => typeof value === 'number')
    if (values.length) totals[key] = values.reduce((sum, value) => sum + value, 0)
  }
  return totals
}
function category(status: number): 'authentication' | 'authorization' | 'invalid-request' | 'rate-limit' | 'unavailable' | 'unknown' {
  if (status === 401) return 'authentication'
  if (status === 403) return 'authorization'
  if (status === 400 || status === 404 || status === 422) return 'invalid-request'
  if (status === 429) return 'rate-limit'
  if (status >= 500) return 'unavailable'
  return 'unknown'
}
function failed(message: string, code: string, data: unknown = null): ResultEnvelope { return { status: 'failed', data, summary: message, errors: [{ message, code }] } }
function cancelled(): ResultEnvelope { return { status: 'cancelled', data: null, summary: 'Anthropic request cancelled', errors: [{ message: 'Anthropic request cancelled', code: 'cancelled' }] } }

export interface AnthropicExecutorProvider extends ExecutorProvider { create(options: ExecutorProviderCreateOptions): AnthropicAdapter }
export function createAnthropicProvider(options: AnthropicProviderOptions = {}): AnthropicExecutorProvider {
  const endpoint = options.endpoint ?? 'https://api.anthropic.com/v1'
  const parsedEndpoint = new URL(endpoint)
  if (parsedEndpoint.protocol !== 'https:' || parsedEndpoint.username || parsedEndpoint.password || parsedEndpoint.search || parsedEndpoint.hash) throw new Error('Anthropic endpoint must be HTTPS without credentials')
  return { manifest: ANTHROPIC_EXECUTOR_MANIFEST, create(createOptions): AnthropicAdapter {
    const selection = validateExecutorSelection(createOptions.selection)
    if (selection.providerId !== 'anthropic') throw new Error('Anthropic provider selection ID mismatch')
    for (const capability of selection.capabilities ?? []) if (!ANTHROPIC_EXECUTOR_MANIFEST.capabilities.includes(capability)) throw new Error(`unsupported Anthropic capability '${capability}'`)
    const configResult = configurationSchema['~standard'].validate(selection.configuration)
    if (configResult instanceof Promise || 'issues' in configResult) throw new Error('invalid Anthropic configuration')
    const config = configResult.value
    const selected = new Set(selection.capabilities ?? [])
    if (config.stream === true && !selected.has('streaming')) throw new Error('Anthropic streaming requires selection')
    const credential = (createOptions.credential ?? options.credential) as AnthropicProviderOptions['credential']
    if (typeof credential !== 'string' && typeof credential !== 'function') throw new Error('Anthropic credential must be supplied explicitly')
    const transport = (createOptions.transport as AnthropicTransport | undefined) ?? options.transport ?? ((url: string, init: RequestInit) => fetch(url, init))
    const host = (createOptions.toolLoop as AnthropicLocalToolHost | undefined) ?? options.toolLoop
    if (host !== undefined && !selected.has('local-tools')) throw new Error('Anthropic local tool host requires selection')
    if (selected.has('local-tools') && host === undefined) throw new Error('Anthropic local-tools selection requires a Brambo host boundary')
    const definitions = host?.definitions.map(toAnthropicToolDefinition) ?? []
    const names = new Map(host?.definitions.map((tool) => [tool.name, tool]) ?? [])
    if (names.size !== definitions.length) throw new Error('duplicate Anthropic local tool names')
    const now = createOptions.now ?? options.now ?? Date.now
    const controller = new AbortController()
    let disposed = false
    const resolveCredential = async (): Promise<string> => {
      const secret = typeof credential === 'function' ? await credential() : credential
      if (typeof secret !== 'string' || !secret || /[\r\n]/.test(secret)) throw new Error('invalid Anthropic credential')
      return secret
    }
    const send = async (path: string, init: Omit<RequestInit, 'headers'> & { headers?: RequestInit['headers'] }, signal: AbortSignal): Promise<{ response: Response; secret: string }> => {
      if (signal.aborted) throw new DOMException('Anthropic request cancelled', 'AbortError')
      const secret = await resolveCredential()
      if (signal.aborted) throw new DOMException('Anthropic request cancelled', 'AbortError')
      const response = await transport(new URL(path.replace(/^\//, ''), `${endpoint.replace(/\/$/, '')}/`).toString(), { ...init, signal, headers: { 'x-api-key': secret, 'anthropic-version': '2023-06-01', ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }), ...init.headers } })
      return { response, secret }
    }
    const removeOwned = options.capabilities?.removeOwned ?? (async (resource: { readonly kind: string; readonly id: string }) => {
      if (resource.kind !== 'file') throw new Error('unsupported Anthropic remote resource cleanup')
      const { response } = await send(`files/${encodeURIComponent(resource.id)}`, { method: 'DELETE' }, new AbortController().signal)
      if (!response.ok) throw new Error('Anthropic remote file cleanup failed')
    })
    const capabilities = createAnthropicCapabilityHandlers({ selected: selection.capabilities ?? [], policy: options.capabilities?.policy ?? { allowedCapabilities: [], allowEgress: false, allowRetention: false, allowDeletion: false }, ...options.capabilities, removeOwned })
    const fields = capabilities.requestFields()
    const hostFileIds = new Set(options.capabilities?.files?.map((file) => file.fileId) ?? [])
    const ownedFileIds = new Set<string>()
    if (fields.thinking?.type === 'enabled' && typeof fields.thinking.budget_tokens === 'number' && (config.maxTokens ?? 4096) <= fields.thinking.budget_tokens) throw new Error('Anthropic thinking budget must be below maxTokens')
    const observe = (observation: AnthropicProviderObservation): void => { options.onObservation?.(observation) }
    const sendTurn = async (body: Record<string, unknown>, signal: AbortSignal, turnIndex: number, runSecrets: string[], onHeaders: (requestId: string | undefined, rates: Readonly<Record<string, string>>) => void): Promise<{ message: Record<string, unknown>; responseId: string; requestId?: string; rates: Readonly<Record<string, string>>; usage?: ApiUsageObservation }> => {
      const { response: http, secret } = await executeWithRetry({ signal, idempotency: 'unknown', send: () => send('messages', { method: 'POST', body: JSON.stringify(body), ...(fields.betaHeaders.length ? { headers: { 'anthropic-beta': fields.betaHeaders.join(',') } } : {}) }, signal) }, { now, random: Math.random, maxAttempts: 1, sleep: async () => undefined })
      runSecrets.push(secret)
      const rawId = nonEmpty(http.headers.get('request-id')) ?? nonEmpty(http.headers.get('x-request-id'))
      const requestId = rawId === undefined ? undefined : redactProviderMetadata(rawId, runSecrets) as string
      const rates = redactProviderMetadata(rateMetadata(http.headers), runSecrets) as Readonly<Record<string, string>>
      onHeaders(requestId, rates)
      if (Object.keys(rates).length) observe({ kind: 'rate-limit', value: rates })
      if (!http.ok) {
        const retryAfterHeader = http.headers.get('retry-after')
        const retryAfter = retryAfterHeader !== null && /^\d+(?:\.\d+)?$/.test(retryAfterHeader) ? Number(retryAfterHeader) : undefined
        throw normalizeProviderError({ providerId: 'anthropic', category: category(http.status), status: http.status, requestId, message: 'Anthropic request failed', requestAccepted: true, retryAfter })
      }
      let message: unknown
      if (body.stream === true) {
        if (http.body === null) throw new Error('Anthropic stream has no body')
        let responseId: string | undefined
        message = await collectAnthropicMessage(http.body, signal, (event: AnthropicProviderEvent) => {
          const rawResponseId = nonEmpty(event.message?.id)
          responseId = rawResponseId === undefined ? responseId : redactProviderMetadata(rawResponseId, runSecrets) as string
          const delta = event.delta?.type === 'text_delta' && typeof event.delta.text === 'string' ? event.delta.text : undefined
          const citation = event.delta?.type === 'citations_delta' && record(event.delta.citation) && typeof event.delta.citation.type === 'string' ? redactProviderMetadata(event.delta.citation, runSecrets) as Readonly<Record<string, unknown>> : undefined
          options.onEvent?.({ type: event.type, sequence: event.sequence, turnIndex, ...(event.index === undefined ? {} : { index: event.index }), ...(requestId === undefined ? {} : { requestId }), ...(responseId === undefined ? {} : { responseId }), ...(delta === undefined ? {} : { delta: redactProviderMetadata(delta, runSecrets) as string }), ...(citation === undefined ? {} : { citation }) })
        })
      } else { try { message = await http.json() } catch { throw new Error('Anthropic response is not valid JSON') } }
      if (!record(message) || typeof message.id !== 'string' || message.role !== 'assistant' || !Array.isArray(message.content) || typeof message.stop_reason !== 'string') throw new Error('Anthropic response payload is invalid or incomplete')
      const responseId = redactProviderMetadata(message.id, runSecrets) as string
      const usage = usageOf(message, selection.model, requestId, now, runSecrets)
      if (usage !== undefined) observe({ kind: 'usage', value: usage })
      return { message, responseId, requestId, rates, usage }
    }
    return {
      async run(runRequest: RunRequest): Promise<ResultEnvelope> {
        if (disposed) return failed('Anthropic adapter is disposed', 'disposed')
        try { validateRunRequest(runRequest) } catch { return failed('Invalid Anthropic run request', 'invalid-request') }
        const signal = AbortSignal.any([controller.signal, runRequest.signal ?? new AbortController().signal])
        if (signal.aborted) return cancelled()
        const cachePrompt = fields.promptCaching && config.system === undefined && fields.tools.length === 0 && definitions.length === 0
        const inputContent: unknown = fields.input.length || cachePrompt
          ? [{ type: 'text', text: runRequest.prompt, ...(cachePrompt ? { cache_control: { type: 'ephemeral' } } : {}) }, ...fields.input]
          : runRequest.prompt
        const messages: Array<{ role: 'user' | 'assistant'; content: unknown }> = [{ role: 'user', content: inputContent }]
        const tools: Readonly<Record<string, unknown>>[] = [...definitions.map((definition) => ({ ...definition })), ...fields.tools]
        if (fields.promptCaching && tools.length) tools[tools.length - 1] = { ...tools[tools.length - 1], cache_control: { type: 'ephemeral' } }
        const system = config.system === undefined ? undefined : fields.promptCaching && !tools.length ? [{ type: 'text', text: config.system, cache_control: { type: 'ephemeral' } }] : config.system
        const base: Record<string, unknown> = { model: selection.model, max_tokens: config.maxTokens ?? 4096, stream: config.stream ?? selected.has('streaming'), ...(system === undefined ? {} : { system }), ...(config.temperature === undefined ? {} : { temperature: config.temperature }), ...(fields.thinking === undefined ? {} : { thinking: fields.thinking }), ...(tools.length ? { tools } : {}), ...(fields.mcpServers.length ? { mcp_servers: fields.mcpServers } : {}) }
        let lastRequestId: string | undefined
        let lastMessage: Record<string, unknown> | undefined
        let lastResponseId: string | undefined
        let lastRates: Readonly<Record<string, string>> = {}
        let toolRequestId: string | undefined
        let step = 0
        let pauseSteps = 0
        const webSearchTool = tools.find((tool) => tool.type === 'web_search_20250305')
        let remainingWebSearchUses = webSearchTool?.max_uses as number | undefined
        const runSecrets: string[] = []
        const turns: Array<{ responseId: string; requestId?: string; usage?: ApiUsageObservation; rateLimits: Readonly<Record<string, string>> }> = []
        const turnCitations: Array<{ readonly turnIndex: number; readonly blockIndex: number; readonly citation: Readonly<Record<string, unknown>> }> = []
        try {
          const loop = await runLocalToolLoop({ state: { messages }, signal, limits: host?.limits ?? { maxSteps: 1, maxConcurrentCalls: 1 }, executeTool,
            createExecution: host?.createExecution ?? (() => { throw new Error('no Anthropic local tool host') }),
            encodeResult: (call, outcome: ProviderToolExecutionOutcome) => ({ callId: call.id, output: outcome.kind === 'result' ? { status: outcome.result.status, stdout: outcome.result.stdout, stderr: outcome.result.stderr, ...(outcome.result.error === undefined ? {} : { error: outcome.result.error.code }) } : { status: 'error', message: 'Brambo tool execution failed' } }),
            next: async (state, priorResults) => {
              const nextMessages = [...state.messages]
              if (priorResults.length) nextMessages.push({ role: 'user', content: priorResults.map(toAnthropicToolResult) })
              while (true) {
                step++
                if (remainingWebSearchUses !== undefined && remainingWebSearchUses < 1) throw new Error('Anthropic web search run allowance exhausted before continuation')
                // Anthropic max_uses resets per Messages request, so each continuation gets only the run remainder.
                const turnTools = remainingWebSearchUses === undefined ? tools : tools.map((tool) => tool === webSearchTool ? { ...tool, max_uses: remainingWebSearchUses } : tool)
                const turn = await sendTurn({ ...base, ...(turnTools.length ? { tools: turnTools } : {}), messages: nextMessages }, signal, step, runSecrets, (requestId, rates) => { lastRequestId = requestId; lastRates = rates })
                lastRequestId = turn.requestId; lastMessage = turn.message; lastResponseId = turn.responseId; lastRates = turn.rates
                turns.push({ responseId: turn.responseId, requestId: turn.requestId, usage: turn.usage, rateLimits: turn.rates })
                turnCitations.push(...citationsOf(turn.message, step))
                if (remainingWebSearchUses !== undefined) {
                  const used = webSearchCount(turn.message)
                  remainingWebSearchUses = used === undefined ? (pendingMixedWebSearch(turn.message) ? remainingWebSearchUses : 0) : used > remainingWebSearchUses ? 0 : remainingWebSearchUses - used
                }
                const calls = toolsOf(turn.message)
                const stop = turn.message.stop_reason
                const assistantContent = turn.message.content as unknown[]
                if (stop === 'pause_turn' && calls.length === 0) {
                  if (++pauseSteps > 8) throw new Error('Anthropic hosted tool pause sequence exceeded limit')
                  nextMessages.push({ role: 'assistant', content: assistantContent })
                  continue
                }
                if (calls.length === 0) {
                  if (stop === 'tool_use') throw new Error('Anthropic tool_use stop has no local tool calls')
                  if (stop !== 'end_turn' && stop !== 'stop_sequence') throw new Error('Anthropic response did not complete')
                  return { state: { messages: nextMessages }, complete: true }
                }
                if (stop !== 'tool_use' || host === undefined) throw new Error('Anthropic local tool use requires host boundary and tool_use stop')
                toolRequestId ??= turn.requestId
                nextMessages.push({ role: 'assistant', content: assistantContent })
                const normalized: ProviderToolCall[] = calls.map((call) => {
                  const definition = names.get(call.name)
                  if (definition === undefined) throw new Error('Anthropic requested an unknown local tool')
                  return { id: call.id, arguments: call.input, concurrencySafe: definition.concurrencySafe ?? false,
                    validateArguments: async (value) => { validateAnthropicToolArguments(definition.parameters, value); await definition.validateArguments?.(value) },
                    correlation: { providerRequestId: turn.requestId, providerResponseId: turn.responseId, sessionId: host.sessionId, turnId: host.turnId, workspaceId: runRequest.workspace.id, attempt: 1, step } }
                })
                return { state: { messages: nextMessages }, calls: normalized, parallel: normalized.length > 1 }
              }
            },
          })
          if (loop.status === 'cancelled' || signal.aborted) return cancelled()
          if (loop.status === 'max-steps') {
            const error = normalizeProviderError({ providerId: 'anthropic', category: 'tool-failure', message: 'Anthropic local tool loop exceeded maximum steps', requestId: toolRequestId ?? lastRequestId, requestAccepted: true })
            observe({ kind: 'error', value: error })
            return failed(error.message, error.category, { requestId: lastRequestId, responseId: lastResponseId, turns, usageTotals: usageTotals(turns), rateLimits: lastRates })
          }
          if (lastMessage === undefined) return failed('Anthropic returned no message', 'protocol')
          const summary = redactProviderMetadata(textOf(lastMessage), runSecrets) as string
          return { status: 'ok', summary: summary || 'Anthropic response completed', data: { responseId: lastResponseId, requestId: lastRequestId, usage: turns.at(-1)?.usage, usageTotals: usageTotals(turns), turns, rateLimits: lastRates, promptCaching: fields.promptCaching ? 'explicit' : 'disabled', output: summary, citations: redactProviderMetadata(turnCitations, runSecrets) } }
        } catch (error) {
          if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError') || (record(error) && error.category === 'cancelled')) return cancelled()
          const normalized = record(error) && typeof error.category === 'string' ? error : normalizeProviderError({ providerId: 'anthropic', category: 'protocol', message: 'Anthropic response processing failed', requestId: toolRequestId ?? lastRequestId, requestAccepted: true })
          observe({ kind: 'error', value: normalized })
          return failed(String(normalized.message ?? 'Anthropic request failed'), String(normalized.category ?? 'unknown'), { requestId: lastRequestId, responseId: lastResponseId, turns, usageTotals: usageTotals(turns), rateLimits: lastRates })
        }
      },
      async uploadFile(file: Blob, filename: string): Promise<string> {
        if (!selected.has('provider-files')) throw new Error('Anthropic provider files are not selected')
        if (disposed || !filename || /[\r\n]/.test(filename)) throw new Error('Anthropic file upload is unavailable or filename invalid')
        const form = new FormData(); form.set('file', file, filename)
        const { response } = await send('files', { method: 'POST', body: form }, controller.signal)
        if (!response.ok) throw new Error('Anthropic file upload failed')
        const payload: unknown = await response.json()
        if (!record(payload)) throw new Error('Anthropic file upload returned no ID')
        const id = nonEmpty(payload.id)
        if (id === undefined) throw new Error('Anthropic file upload returned no ID')
        capabilities.recordFile(id)
        ownedFileIds.add(id)
        return id
      },
      async readFile(id: string): Promise<Uint8Array> {
        if (!selected.has('provider-files') || !nonEmpty(id) || /[\r\n]/.test(id)) throw new Error('Anthropic provider file read is unavailable or ID invalid')
        if (!ownedFileIds.has(id) && !hostFileIds.has(id)) throw new Error('Anthropic provider file is not owned or registered by host')
        const { response } = await send(`files/${encodeURIComponent(id)}/content`, { method: 'GET' }, controller.signal)
        if (!response.ok) throw new Error('Anthropic file read failed')
        return new Uint8Array(await response.arrayBuffer())
      },
      async deleteFile(id: string): Promise<void> {
        if (!selected.has('provider-files') || !nonEmpty(id) || /[\r\n]/.test(id)) throw new Error('Anthropic provider file delete is unavailable or ID invalid')
        if (!ownedFileIds.has(id)) throw new Error('Anthropic adapter cannot delete a file it does not own')
        const { response } = await send(`files/${encodeURIComponent(id)}`, { method: 'DELETE' }, controller.signal)
        if (!response.ok) throw new Error('Anthropic file delete failed')
        ownedFileIds.delete(id)
        capabilities.observeFile(id)
      },
      async dispose(): Promise<void> { if (disposed) return; disposed = true; controller.abort(); await capabilities.dispose() },
    }
  } }
}
