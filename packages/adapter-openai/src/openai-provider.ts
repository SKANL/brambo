import { executeWithRetry, normalizeProviderError, redactProviderMetadata, runLocalToolLoop } from '@brambodev/adapter-api'
import type { ApiUsageObservation, ExecutorAdapter, ExecutorManifest, ExecutorProvider, ExecutorProviderCreateOptions, ResultEnvelope, RunRequest } from '@brambodev/contracts'
import { defineStandardSchema, validateExecutorSelection, validateRunRequest } from '@brambodev/contracts'
import { executeTool } from '@brambodev/session'
import type { ExecuteToolOptions } from '@brambodev/session'
import type { ProviderToolCall, ProviderToolExecutionOutcome } from '@brambodev/adapter-api'
import { createOpenAICapabilityHandlers } from './openai-capabilities.ts'
import type { OpenAICapabilityHandlers, OpenAICapabilityOptions } from './openai-capabilities.ts'
import { readOpenAISse } from './openai-events.ts'
import type { OpenAIProviderEvent } from './openai-events.ts'
import { parseOpenAIFunctionCall, toOpenAIToolDefinition, toOpenAIToolOutput, validateOpenAIToolArguments } from './openai-tools.ts'
import type { BramboToolDefinition, OpenAIFunctionCall } from './openai-tools.ts'

export type OpenAITransport = (url: string, init: RequestInit) => Promise<Response>
export interface OpenAILocalToolHost {
  readonly definitions: readonly BramboToolDefinition[]
  readonly sessionId: string
  readonly turnId: string
  readonly limits: { readonly maxSteps: number; readonly maxConcurrentCalls: number }
  readonly createExecution: (call: ProviderToolCall, signal: AbortSignal) => ExecuteToolOptions
}
export interface OpenAIProviderObservation {
  readonly kind: 'usage' | 'error' | 'rate-limit'
  readonly value: unknown
}
export interface OpenAIProviderOptions {
  readonly credential?: string | (() => string | Promise<string>)
  readonly transport?: OpenAITransport
  readonly endpoint?: string
  readonly toolLoop?: OpenAILocalToolHost
  readonly capabilities?: Omit<OpenAICapabilityOptions, 'selected'>
  readonly onObservation?: (observation: OpenAIProviderObservation) => void
  /** Trusted host event sink. Raw provider bodies and authorization headers are never emitted. */
  readonly onEvent?: (event: Pick<OpenAIProviderEvent, 'type' | 'sequence' | 'delta' | 'outputIndex' | 'contentIndex'> & { readonly turnIndex: number; readonly requestId?: string; readonly responseId?: string }) => void
  readonly now?: () => number
}
export interface OpenAIAdapter extends ExecutorAdapter {
  dispose(): Promise<void>
  uploadFile(file: Blob, filename: string): Promise<string>
  readFile(id: string): Promise<Uint8Array>
  deleteFile(id: string): Promise<void>
}

interface OpenAIConfiguration {
  readonly instructions?: string
  readonly stream?: boolean
  readonly maxOutputTokens?: number
  readonly temperature?: number
  readonly previousResponseId?: string
}

const configurationSchema = defineStandardSchema<OpenAIConfiguration>((value) => {
  if (value === undefined) return { value: {} }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { issues: [{ message: 'OpenAI configuration must be an object' }] }
  const config = value as Record<string, unknown>
  const allowed = ['instructions', 'stream', 'maxOutputTokens', 'temperature', 'previousResponseId']
  if (Object.keys(config).some((key) => !allowed.includes(key)) ||
    (config.instructions !== undefined && (typeof config.instructions !== 'string' || config.instructions.length === 0)) ||
    (config.stream !== undefined && typeof config.stream !== 'boolean') ||
    (config.maxOutputTokens !== undefined && (!Number.isSafeInteger(config.maxOutputTokens) || (config.maxOutputTokens as number) < 1)) ||
    (config.temperature !== undefined && (typeof config.temperature !== 'number' || config.temperature < 0 || config.temperature > 2)) ||
    (config.previousResponseId !== undefined && (typeof config.previousResponseId !== 'string' || config.previousResponseId.length === 0))) {
    return { issues: [{ message: 'OpenAI configuration has unsupported or invalid fields' }] }
  }
  return { value: config as unknown as OpenAIConfiguration }
})

export const OPENAI_EXECUTOR_MANIFEST: ExecutorManifest = Object.freeze({
  id: 'openai', displayName: 'OpenAI API', contractVersion: '1', packageName: '@brambodev/adapter-openai',
  capabilities: Object.freeze(['streaming', 'local-tools', 'conversation-state', 'prompt-caching', 'provider-files', 'remote-mcp', 'hosted-web-search'] as const),
  configurationSchema,
})

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function nonEmpty(value: unknown): string | undefined { return typeof value === 'string' && value.length > 0 ? value : undefined }
function token(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined }
function textOf(response: Record<string, unknown>): string {
  if (typeof response.output_text === 'string') return response.output_text
  const parts: string[] = []
  if (!Array.isArray(response.output)) return ''
  for (const item of response.output) if (record(item) && item.type === 'message' && Array.isArray(item.content)) {
    for (const content of item.content) if (record(content) && content.type === 'output_text' && typeof content.text === 'string') parts.push(content.text)
  }
  return parts.join('')
}
function functionsOf(response: Record<string, unknown>): Array<OpenAIFunctionCall & { readonly parsedArguments: Record<string, unknown> }> {
  if (!Array.isArray(response.output)) throw new Error('OpenAI response output is invalid')
  return response.output.filter((item): item is Record<string, unknown> => record(item) && item.type === 'function_call').map(parseOpenAIFunctionCall)
}
function rateMetadata(headers: Headers): Readonly<Record<string, string>> {
  const result: Record<string, string> = {}
  for (const [name, value] of headers) if (/^x-ratelimit-(limit|remaining|reset)-[a-z0-9-]+$/i.test(name)) result[name] = value
  return result
}
function usageOf(response: Record<string, unknown>, model: string, requestId: string | undefined, now: () => number, secrets: readonly string[]): ApiUsageObservation | undefined {
  if (!record(response.usage)) return undefined
  const usage = response.usage
  const details = record(usage.input_tokens_details) ? usage.input_tokens_details : {}
  const outputDetails = record(usage.output_tokens_details) ? usage.output_tokens_details : {}
  return {
    providerId: 'openai', model, observedAt: new Date(now()).toISOString(), ...(requestId === undefined ? {} : { requestId }),
    ...(token(usage.input_tokens) === undefined ? {} : { inputTokens: token(usage.input_tokens) }),
    ...(token(usage.output_tokens) === undefined ? {} : { outputTokens: token(usage.output_tokens) }),
    ...(token(usage.total_tokens) === undefined ? {} : { totalTokens: token(usage.total_tokens) }),
    ...(token(details.cached_tokens) === undefined ? {} : { cachedInputTokens: token(details.cached_tokens) }),
    ...(token(outputDetails.reasoning_tokens) === undefined ? {} : { reasoningTokens: token(outputDetails.reasoning_tokens) }),
    raw: redactProviderMetadata(usage, secrets) as Readonly<Record<string, unknown>>,
  }
}
function usageTotals(turns: readonly { readonly usage?: ApiUsageObservation }[]): Readonly<Record<string, number>> {
  const totals: Record<string, number> = {}
  for (const key of ['inputTokens', 'outputTokens', 'totalTokens', 'cachedInputTokens', 'reasoningTokens'] as const) {
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
function cancelled(): ResultEnvelope { return { status: 'cancelled', data: null, summary: 'OpenAI request cancelled', errors: [{ message: 'OpenAI request cancelled', code: 'cancelled' }] } }

export interface OpenAIExecutorProvider extends ExecutorProvider { create(options: ExecutorProviderCreateOptions): OpenAIAdapter }

export function createOpenAIProvider(options: OpenAIProviderOptions = {}): OpenAIExecutorProvider {
  const endpoint = options.endpoint ?? 'https://api.openai.com/v1'
  const parsedEndpoint = new URL(endpoint)
  if (parsedEndpoint.protocol !== 'https:' || parsedEndpoint.username || parsedEndpoint.password || parsedEndpoint.search || parsedEndpoint.hash) throw new Error('OpenAI endpoint must be an HTTPS origin or path without credentials')
  return {
    manifest: OPENAI_EXECUTOR_MANIFEST,
    create(createOptions): OpenAIAdapter {
      const selection = validateExecutorSelection(createOptions.selection)
      if (selection.providerId !== 'openai') throw new Error('OpenAI provider selection ID mismatch')
      for (const capability of selection.capabilities ?? []) {
        if (!OPENAI_EXECUTOR_MANIFEST.capabilities.includes(capability)) throw new Error(`OpenAI capability '${capability}' is not supported`)
      }
      const configResult = configurationSchema['~standard'].validate(selection.configuration)
      if (configResult instanceof Promise || 'issues' in configResult) throw new Error('invalid OpenAI configuration')
      const config = configResult.value
      if (config.stream === true && !selection.capabilities?.includes('streaming')) throw new Error('OpenAI streaming requires selection')
      const credential = (createOptions.credential ?? options.credential) as OpenAIProviderOptions['credential']
      if (typeof credential !== 'string' && typeof credential !== 'function') throw new Error('OpenAI credential must be supplied explicitly')
      const transport = (createOptions.transport as OpenAITransport | undefined) ?? options.transport ?? ((url: string, init: RequestInit) => fetch(url, init))
      const host = (createOptions.toolLoop as OpenAILocalToolHost | undefined) ?? options.toolLoop
      const now = createOptions.now ?? options.now ?? Date.now
      const controller = new AbortController()
      let disposed = false
      let currentCredential: string | undefined
      const resolveCredential = async (): Promise<string> => {
        const value = typeof credential === 'function' ? await credential() : credential
        if (typeof value !== 'string' || value.length === 0 || /[\r\n]/.test(value)) throw new Error('invalid OpenAI credential')
        currentCredential = value
        return value
      }
      const send = async (path: string, init: Omit<RequestInit, 'headers'> & { headers?: RequestInit['headers'] }, signal: AbortSignal): Promise<Response> => {
        if (signal.aborted) throw new DOMException('OpenAI request cancelled', 'AbortError')
        const secret = await resolveCredential()
        if (signal.aborted) throw new DOMException('OpenAI request cancelled', 'AbortError')
        return transport(new URL(path.replace(/^\//, ''), `${endpoint.replace(/\/$/, '')}/`).toString(), {
          ...init, signal, headers: { authorization: `Bearer ${secret}`, ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }), ...init.headers },
        })
      }
      const removeOwned = options.capabilities?.removeOwned ?? (async (resource: { readonly kind: string; readonly id: string }) => {
        if (resource.kind === 'remote-mcp') throw new Error('remote MCP cleanup requires an explicit handler')
        const path = resource.kind === 'file' ? `files/${encodeURIComponent(resource.id)}` : `responses/${encodeURIComponent(resource.id)}`
        const response = await send(path, { method: 'DELETE' }, new AbortController().signal)
        if (!response.ok) throw new Error('OpenAI remote resource cleanup failed')
      })
      const capabilities: OpenAICapabilityHandlers = createOpenAICapabilityHandlers({
        selected: selection.capabilities ?? [],
        policy: options.capabilities?.policy ?? { allowedCapabilities: [], allowEgress: false, allowRetention: false, allowDeletion: false },
        ...options.capabilities,
        removeOwned,
      })
      const capabilityFields = capabilities.requestFields()
      if (config.previousResponseId !== undefined) {
        if (!capabilityFields.store) throw new Error('previousResponseId requires conversation-state grant')
        capabilities.observeResponse(config.previousResponseId)
      }
      const selected = new Set(selection.capabilities ?? [])
      if (host !== undefined && !selected.has('local-tools')) throw new Error('local tool host requires local-tools selection')
      if (selected.has('local-tools') && host === undefined) throw new Error('local-tools selection requires Brambo host tool boundary')
      const definitions = host?.definitions.map(toOpenAIToolDefinition) ?? []
      const names = new Map(host?.definitions.map((tool) => [tool.name, tool]) ?? [])
      if (names.size !== definitions.length) throw new Error('duplicate local function names')
      const observe = (observation: OpenAIProviderObservation): void => { options.onObservation?.(observation) }
      const sendTurn = async (body: Record<string, unknown>, signal: AbortSignal, turnIndex: number, onHeaders: (requestId: string | undefined, rates: Readonly<Record<string, string>>) => void): Promise<{ response: Record<string, unknown>; requestId?: string; rates: Readonly<Record<string, string>>; usage?: ApiUsageObservation }> => {
        const http = await executeWithRetry({ signal, idempotency: 'unknown', send: () => send('responses', { method: 'POST', body: JSON.stringify(body) }, signal) }, { now, random: Math.random, maxAttempts: 1, sleep: async () => undefined })
        const rawRequestId = nonEmpty(http.headers.get('x-request-id'))
        const requestId = rawRequestId === undefined ? undefined : redactProviderMetadata(rawRequestId, currentCredential === undefined ? [] : [currentCredential]) as string
        const rates = rateMetadata(http.headers)
        onHeaders(requestId, rates)
        const safeRates = redactProviderMetadata(rates, currentCredential === undefined ? [] : [currentCredential]) as Readonly<Record<string, string>>
        if (Object.keys(safeRates).length) observe({ kind: 'rate-limit', value: safeRates })
        if (!http.ok) {
          const rawRetryAfter = http.headers.get('retry-after')
          const retryAfter = rawRetryAfter !== null && /^\d+(?:\.\d+)?$/.test(rawRetryAfter) ? Number(rawRetryAfter) : undefined
          const error = normalizeProviderError({ providerId: 'openai', category: category(http.status), status: http.status, requestId, message: 'OpenAI request failed', requestAccepted: true, retryAfter })
          throw error
        }
        let response: unknown
        if (body.stream === true) {
          if (http.body === null) throw new Error('OpenAI stream has no body')
          let streamedResponseId: string | undefined
          for await (const event of readOpenAISse(http.body, signal)) {
            streamedResponseId = nonEmpty(event.response?.id) ?? streamedResponseId
            options.onEvent?.({ type: event.type, sequence: event.sequence, turnIndex, ...(requestId === undefined ? {} : { requestId }), ...(streamedResponseId === undefined ? {} : { responseId: streamedResponseId }), ...(event.delta === undefined ? {} : { delta: redactProviderMetadata(event.delta, currentCredential === undefined ? [] : [currentCredential]) as string }), ...(event.outputIndex === undefined ? {} : { outputIndex: event.outputIndex }), ...(event.contentIndex === undefined ? {} : { contentIndex: event.contentIndex }) })
            if (event.type === 'response.completed') response = event.response
            if (event.type === 'response.failed' || event.type === 'response.incomplete' || event.type === 'response.error') throw new Error('OpenAI streamed response failed')
          }
        } else {
          try { response = await http.json() } catch { throw new Error('OpenAI response is not valid JSON') }
        }
        if (!record(response) || typeof response.id !== 'string' || !Array.isArray(response.output) || response.status !== 'completed') throw new Error('OpenAI response payload is invalid or incomplete')
        if (capabilityFields.store) capabilities.recordResponse(response.id)
        const usage = usageOf(response, selection.model, requestId, now, currentCredential === undefined ? [] : [currentCredential])
        if (usage !== undefined) observe({ kind: 'usage', value: usage })
        return { response, requestId, rates: safeRates, usage }
      }
      return {
        async run(runRequest: RunRequest): Promise<ResultEnvelope> {
          if (disposed) return failed('OpenAI adapter is disposed', 'disposed')
          try { validateRunRequest(runRequest) } catch { return failed('Invalid OpenAI run request', 'invalid-request') }
          const signal = AbortSignal.any([controller.signal, runRequest.signal ?? new AbortController().signal])
          if (signal.aborted) return cancelled()
          const input: unknown[] = [{ role: 'user', content: capabilityFields.input.length ? [{ type: 'input_text', text: runRequest.prompt }, ...capabilityFields.input] : runRequest.prompt }]
          const base: Record<string, unknown> = { model: selection.model, store: capabilityFields.store, stream: config.stream ?? selected.has('streaming'), ...(config.instructions === undefined ? {} : { instructions: config.instructions }), ...(config.maxOutputTokens === undefined ? {} : { max_output_tokens: config.maxOutputTokens }), ...(config.temperature === undefined ? {} : { temperature: config.temperature }) }
          const tools = [...definitions, ...capabilityFields.tools]
          if (tools.length) base.tools = tools
          let lastRequestId: string | undefined
          let lastResponse: Record<string, unknown> | undefined
          let lastRates: Readonly<Record<string, string>> = {}
          let toolRequestId: string | undefined
          let previousResponseId = config.previousResponseId
          let step = 0
          let approvalSteps = 0
          const seenApprovals = new Set<string>()
          const turns: Array<{ responseId: string; requestId?: string; usage?: ApiUsageObservation; rateLimits: Readonly<Record<string, string>> }> = []
          try {
            const loop = await runLocalToolLoop({
              state: { input }, signal, limits: host?.limits ?? { maxSteps: 1, maxConcurrentCalls: 1 },
              executeTool,
              createExecution: host?.createExecution ?? (() => { throw new Error('no local tool host') }),
              encodeResult: (call, outcome: ProviderToolExecutionOutcome) => ({ callId: call.id, output: outcome.kind === 'result' ? { status: outcome.result.status, stdout: outcome.result.stdout, stderr: outcome.result.stderr, ...(outcome.result.error === undefined ? {} : { error: outcome.result.error.code }) } : { status: 'error', message: 'Brambo tool execution failed' } }),
              next: async (state, priorResults) => {
                const nextInput = [...state.input]
                let incremental: unknown[] = priorResults.map(toOpenAIToolOutput)
                nextInput.push(...incremental)
                while (true) {
                  step += 1
                  const body: Record<string, unknown> = { ...base, input: capabilityFields.store && previousResponseId !== undefined && step > 1 ? incremental : nextInput }
                  if (capabilityFields.store && previousResponseId !== undefined) body.previous_response_id = previousResponseId
                  const turn = await sendTurn(body, signal, step, (requestId, rates) => { lastRequestId = requestId; lastRates = rates })
                  lastRequestId = turn.requestId
                  lastResponse = turn.response
                  lastRates = turn.rates
                  turns.push({ responseId: String(turn.response.id), requestId: turn.requestId, usage: turn.usage, rateLimits: turn.rates })
                  previousResponseId = String(turn.response.id)
                  const output = turn.response.output as unknown[]
                  if (!capabilityFields.store) nextInput.push(...output.filter(record))
                  const approvalRequests = output.filter((item): item is Record<string, unknown> => record(item) && item.type === 'mcp_approval_request')
                  if (approvalRequests.length) {
                    if (approvalRequests.length !== output.length || ++approvalSteps > 8) throw new Error('OpenAI remote MCP approval sequence is invalid or exceeds limit')
                    const approvals: Readonly<Record<string, unknown>>[] = []
                    for (const item of approvalRequests) {
                      if (typeof item.id !== 'string' || seenApprovals.has(item.id)) throw new Error('duplicate or invalid remote MCP approval ID')
                      seenApprovals.add(item.id)
                      approvals.push(await capabilities.authorizeMcp({ item, responseId: String(turn.response.id), requestId: turn.requestId, workspaceId: runRequest.workspace.id, signal }))
                    }
                    incremental = approvals
                    nextInput.push(...approvals)
                    continue
                  }
                  const calls = functionsOf(turn.response)
                  if (calls.length === 0) {
                    if (!textOf(turn.response) && (approvalSteps > 0 || output.some((item) => record(item) && item.type === 'mcp_call'))) throw new Error('OpenAI remote MCP response has no final output')
                    return { state: { input: nextInput }, complete: true }
                  }
                  toolRequestId ??= turn.requestId
                  if (host === undefined) throw new Error('OpenAI requested a local function without a Brambo tool host')
                  const normalized: ProviderToolCall[] = calls.map((call) => {
                    const definition = names.get(call.name)
                    if (definition === undefined) throw new Error('OpenAI requested an unknown local function')
                    return {
                      id: call.call_id, arguments: call.parsedArguments, concurrencySafe: definition.concurrencySafe ?? false,
                      validateArguments: async (value) => { validateOpenAIToolArguments(definition.parameters, value); await definition.validateArguments?.(value) },
                      correlation: { providerRequestId: turn.requestId, providerResponseId: String(turn.response.id), sessionId: host.sessionId, turnId: host.turnId, workspaceId: runRequest.workspace.id, attempt: 1, step },
                    }
                  })
                  return { state: { input: nextInput }, calls: normalized, parallel: normalized.length > 1 }
                }
              },
            })
            if (loop.status === 'cancelled' || signal.aborted) return cancelled()
            if (loop.status === 'max-steps') {
              const error = normalizeProviderError({ providerId: 'openai', category: 'tool-failure', message: 'OpenAI local tool loop exceeded its maximum steps', requestId: toolRequestId, requestAccepted: true })
              observe({ kind: 'error', value: error })
              return failed(error.message, error.category, { requestId: lastRequestId, responseId: lastResponse?.id, rateLimits: lastRates, turns, usageTotals: usageTotals(turns) })
            }
            if (lastResponse === undefined) return failed('OpenAI returned no response', 'protocol')
            const summary = redactProviderMetadata(textOf(lastResponse), currentCredential === undefined ? [] : [currentCredential]) as string
            return { status: 'ok', summary: summary || 'OpenAI response completed', data: { responseId: lastResponse.id, requestId: lastRequestId, usage: turns.at(-1)?.usage, usageTotals: usageTotals(turns), turns, rateLimits: lastRates, promptCaching: 'provider-managed', output: summary } }
          } catch (error) {
            if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError') || (record(error) && error.category === 'cancelled')) return cancelled()
            const normalized = record(error) && typeof error.category === 'string' ? error : normalizeProviderError({ providerId: 'openai', category: 'protocol', message: 'OpenAI response processing failed', requestId: toolRequestId ?? lastRequestId, requestAccepted: true })
            observe({ kind: 'error', value: normalized })
            return failed(String(normalized.message ?? 'OpenAI request failed'), String(normalized.category ?? 'unknown'), { requestId: lastRequestId, responseId: lastResponse?.id, rateLimits: redactProviderMetadata(lastRates, currentCredential === undefined ? [] : [currentCredential]), turns, usageTotals: usageTotals(turns) })
          }
        },
        async uploadFile(file: Blob, filename: string): Promise<string> {
          if (!selected.has('provider-files')) throw new Error('provider files are not selected')
          if (disposed) throw new Error('OpenAI adapter is disposed')
          if (!filename || /[\r\n]/.test(filename)) throw new Error('invalid filename')
          const form = new FormData()
          form.set('purpose', 'user_data')
          form.set('file', file, filename)
          const response = await send('files', { method: 'POST', body: form }, controller.signal)
          if (!response.ok) throw new Error('OpenAI file upload failed')
          const body: unknown = await response.json()
          if (!record(body) || typeof body.id !== 'string' || body.id.length === 0) throw new Error('OpenAI file upload returned no ID')
          capabilities.recordFile(body.id)
          return body.id
        },
        async readFile(id: string): Promise<Uint8Array> {
          if (!selected.has('provider-files')) throw new Error('provider files are not selected')
          if (!id || /[\r\n]/.test(id)) throw new Error('invalid file ID')
          const response = await send(`files/${encodeURIComponent(id)}/content`, { method: 'GET' }, controller.signal)
          if (!response.ok) throw new Error('OpenAI file read failed')
          return new Uint8Array(await response.arrayBuffer())
        },
        async deleteFile(id: string): Promise<void> {
          if (!selected.has('provider-files')) throw new Error('provider files are not selected')
          if (!id || /[\r\n]/.test(id)) throw new Error('invalid file ID')
          const response = await send(`files/${encodeURIComponent(id)}`, { method: 'DELETE' }, controller.signal)
          if (!response.ok) throw new Error('OpenAI file delete failed')
          capabilities.observeFile(id)
        },
        async dispose(): Promise<void> { if (disposed) return; disposed = true; controller.abort(); await capabilities.dispose() },
      }
    },
  }
}
