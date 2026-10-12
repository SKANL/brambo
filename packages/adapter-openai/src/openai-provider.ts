import { executeWithRetry, normalizeProviderError, redactProviderMetadata, runLocalToolLoop } from '@brambodev/adapter-api'
import type { ApiProviderError, ApiProviderErrorCategory, ApiProviderErrorPhase, ApiUsageObservation, ExecutorAdapter, ExecutorManifest, ExecutorProvider, ExecutorProviderCreateOptions, ResultEnvelope, RunRequest, ToolDispatcher, ControlDescriptor, ControlExtension, ExecutionControlContract, JsonObject, JsonValue } from '@brambodev/contracts'
import { defineStandardSchema, validateExecutorSelection, validateRunRequest, validateExecutionControlContract, snapshotExecutionControlSchema, validateExecutionConfigurationForContract, mapControlExtensions } from '@brambodev/contracts'
import { executeTool } from '@brambodev/session'
import type { ExecuteToolOptions } from '@brambodev/session'
import type { ProviderToolCall, ProviderToolExecutionOutcome } from '@brambodev/adapter-api'
import { createOpenAICapabilityHandlers } from './openai-capabilities.ts'
import type { OpenAICapabilityHandlers, OpenAICapabilityOptions } from './openai-capabilities.ts'
import { OpenAISseReadError, readOpenAISse } from './openai-events.ts'
import type { OpenAIProviderEvent } from './openai-events.ts'
import { parseOpenAIFunctionCall, toOpenAIToolDefinition, toOpenAIToolOutput, validateOpenAIToolArguments } from './openai-tools.ts'
import type { BramboToolDefinition, OpenAIFunctionCall } from './openai-tools.ts'

export type OpenAITransport = (url: string, init: RequestInit) => Promise<Response>
export interface OpenAILocalToolHost {
  readonly definitions: readonly BramboToolDefinition[]
  readonly sessionId: string
  readonly turnId: string
  readonly limits: { readonly maxSteps: number; readonly maxConcurrentCalls: number }
  /** Durable workflow dispatch; mutually exclusive with the legacy createExecution route. */
  readonly dispatchTool?: ToolDispatcher
  readonly createExecution?: (call: ProviderToolCall, signal: AbortSignal) => ExecuteToolOptions
}
export interface OpenAIProviderObservation {
  readonly kind: 'usage' | 'error' | 'rate-limit'
  readonly value: unknown
}
export interface OpenAIProviderOptions {
  readonly controlExtensions?: readonly ControlExtension<JsonObject>[]
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

const OPENAI_REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const
export type OpenAIReasoningEffort = typeof OPENAI_REASONING_EFFORTS[number]

function isOpenAIReasoningEffort(value: unknown): value is OpenAIReasoningEffort {
  return typeof value === 'string' && (OPENAI_REASONING_EFFORTS as readonly string[]).includes(value)
}

export interface OpenAIConfiguration {
  readonly instructions?: string
  readonly stream?: boolean
  readonly maxOutputTokens?: number
  readonly temperature?: number
  readonly previousResponseId?: string
  readonly reasoningEffort?: OpenAIReasoningEffort
}

export const OPENAI_CONFIGURATION_SCHEMA = defineStandardSchema<OpenAIConfiguration>((value) => {
  if (value === undefined) return { value: {} }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { issues: [{ message: 'OpenAI configuration must be an object' }] }
  const config = value as Record<string, unknown>
  const allowed = ['instructions', 'stream', 'maxOutputTokens', 'temperature', 'previousResponseId', 'reasoningEffort']
  if (Object.keys(config).some((key) => !allowed.includes(key)) ||
    (config.instructions !== undefined && (typeof config.instructions !== 'string' || config.instructions.length === 0)) ||
    (config.stream !== undefined && typeof config.stream !== 'boolean') ||
    (config.maxOutputTokens !== undefined && (!Number.isSafeInteger(config.maxOutputTokens) || (config.maxOutputTokens as number) < 1)) ||
    (config.temperature !== undefined && (typeof config.temperature !== 'number' || config.temperature < 0 || config.temperature > 2)) ||
    (config.previousResponseId !== undefined && (typeof config.previousResponseId !== 'string' || config.previousResponseId.length === 0)) ||
    (config.reasoningEffort !== undefined && !isOpenAIReasoningEffort(config.reasoningEffort))) {
    return { issues: [{ message: 'OpenAI configuration has unsupported or invalid fields' }] }
  }
  return { value: config as unknown as OpenAIConfiguration }
})

// New controls govern behavior/output only, never prompts or conversation policy.
const controlKeys = ['reasoningEffort', 'maxOutputTokens', 'temperature', 'stream'] as const
const controlConfigurationSchema = defineStandardSchema<JsonObject>((value) => {
  if (!record(value) || Object.keys(value).some((key) => !controlKeys.includes(key as typeof controlKeys[number]))) return { issues: [{ message: 'invalid OpenAI controls' }] }
  const result = OPENAI_CONFIGURATION_SCHEMA['~standard'].validate(value)
  return result instanceof Promise || 'issues' in result ? { issues: [{ message: 'invalid controls' }] } : { value: value as JsonObject }
})
function ownControlExtensions(extensions: readonly ControlExtension<JsonObject>[]): readonly ControlExtension<JsonObject>[] {
  const controls = validateExecutionControlContract({ providerId: 'openai', requiresModel: true, configurationSchema: controlConfigurationSchema, controls: extensions.map((entry) => {
    const descriptor = Object.getOwnPropertyDescriptor(entry, 'descriptor')
    if (!descriptor || !('value' in descriptor)) throw new Error('invalid OpenAI control registration')
    return descriptor.value as ControlDescriptor
  }) }).controls
  return Object.freeze(controls.map((descriptor, index) => {
    if (descriptor.configurationKey !== undefined) throw new Error('native extensions must omit configurationKey')
    const map = Object.getOwnPropertyDescriptor(extensions[index]!, 'map')
    if (!map || !('value' in map) || typeof map.value !== 'function') throw new Error('invalid OpenAI control mapper')
    return Object.freeze({ descriptor: Object.freeze({ ...descriptor, schema: snapshotExecutionControlSchema(descriptor.schema) }), map: map.value.bind(extensions[index]) as ControlExtension<JsonObject>['map'] })
  }))
}
export function createOpenAIControlContract(extensions: readonly ControlExtension<JsonObject>[] = []): ExecutionControlContract {
  const registrations = ownControlExtensions(extensions)
  return validateExecutionControlContract({ providerId: 'openai', requiresModel: true, configurationSchema: snapshotExecutionControlSchema(controlConfigurationSchema), controls: [
    ...controlKeys.map((configurationKey) => ({ id: `openai:${configurationKey}`, configurationKey, schema: snapshotExecutionControlSchema(defineStandardSchema<JsonValue>((value) => {
      const result = OPENAI_CONFIGURATION_SCHEMA['~standard'].validate({ [configurationKey]: value })
      return result instanceof Promise || 'issues' in result ? { issues: [{ message: 'invalid OpenAI control value' }] } : { value: value as JsonValue }
    })) })),
    ...registrations.map(({ descriptor }) => descriptor),
  ] })
}
export const OPENAI_CONTROL_CONTRACT = createOpenAIControlContract()
const nativeControlSchema = defineStandardSchema<JsonObject>((value) => {
  if (!record(value)) return { issues: [{ message: 'invalid OpenAI native controls' }] }
  const configuration: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'reasoning') {
      if (!record(entry) || Object.keys(entry).length !== 1 || !Object.hasOwn(entry, 'effort')) return { issues: [{ message: 'invalid OpenAI native effort' }] }
      configuration.reasoningEffort = entry.effort
    } else if (key === 'max_output_tokens') configuration.maxOutputTokens = entry
    else if (key === 'temperature' || key === 'stream') configuration[key] = entry
    else return { issues: [{ message: 'unsupported OpenAI native destination' }] }
  }
  const result = OPENAI_CONFIGURATION_SCHEMA['~standard'].validate(configuration)
  return result instanceof Promise || 'issues' in result ? { issues: [{ message: 'invalid OpenAI native controls' }] } : { value: value as JsonObject }
})
export const OPENAI_EXECUTOR_MANIFEST: ExecutorManifest = Object.freeze({
  id: 'openai', displayName: 'OpenAI API', contractVersion: '1', packageName: '@brambodev/adapter-openai',
  capabilities: Object.freeze(['streaming', 'local-tools', 'conversation-state', 'prompt-caching', 'provider-files', 'remote-mcp', 'hosted-web-search'] as const),
  configurationSchema: OPENAI_CONFIGURATION_SCHEMA,
  configurationControls: OPENAI_CONTROL_CONTRACT,
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
function functionCallFailurePhase(response: Record<string, unknown>): 'response-parse' | 'response-shape' {
  if (!Array.isArray(response.output)) return 'response-shape'
  for (const item of response.output) {
    if (!record(item) || item.type !== 'function_call') continue
    if (typeof item.call_id !== 'string' || item.call_id.length === 0 || typeof item.name !== 'string' || item.name.length === 0 || typeof item.arguments !== 'string') return 'response-shape'
    let parsed: unknown
    try { parsed = JSON.parse(item.arguments) } catch { return 'response-parse' }
    if (!record(parsed)) return 'response-shape'
  }
  return 'response-shape'
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

const FAILURE_MESSAGES: Readonly<Record<ApiProviderErrorPhase, string>> = {
  credential: 'OpenAI credential resolution failed',
  transport: 'OpenAI transport failed',
  http: 'OpenAI request failed',
  'response-parse': 'OpenAI response parsing failed',
  'response-shape': 'OpenAI response shape is invalid',
  'provider-response': 'OpenAI provider returned an unsuccessful response',
  callback: 'OpenAI adapter callback failed',
  processing: 'OpenAI response processing failed',
}
const openAIFailures = new WeakSet<object>()
const callbackFailures = new WeakSet<object>()

function acceptedForHttpStatus(status: number): boolean | undefined {
  // Client-error responses are explicit rejections; server errors do not prove
  // whether provider-side work was accepted, so leave the field absent.
  return status >= 400 && status < 500 ? false : undefined
}

function acceptedAfterHttpResponse(status: number | undefined): boolean | undefined {
  return status !== undefined && status >= 200 && status < 300 ? true : undefined
}

function openAIFailure(input: {
  readonly failurePhase: ApiProviderErrorPhase
  readonly category?: ApiProviderErrorCategory
  readonly message?: string
  readonly status?: number
  readonly requestId?: string
  readonly retryAfter?: number
  readonly requestAccepted?: boolean
}): ApiProviderError {
  const error = normalizeProviderError({
    providerId: 'openai',
    category: input.category ?? (
      input.failurePhase === 'credential' || input.failurePhase === 'transport' || input.failurePhase === 'callback'
        ? 'unknown'
        : 'protocol'
    ),
    failurePhase: input.failurePhase,
    message: input.message ?? FAILURE_MESSAGES[input.failurePhase],
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    ...(input.retryAfter === undefined ? {} : { retryAfter: input.retryAfter }),
    ...(input.requestAccepted === undefined ? {} : { requestAccepted: input.requestAccepted }),
  })
  openAIFailures.add(error)
  return error
}

function isOpenAIFailure(value: unknown): value is ApiProviderError {
  return value !== null && typeof value === 'object' && openAIFailures.has(value)
}

function isCallbackFailure(value: unknown): boolean {
  return value !== null && typeof value === 'object' && callbackFailures.has(value)
}

export interface OpenAIExecutorProvider extends ExecutorProvider { create(options: ExecutorProviderCreateOptions): OpenAIAdapter }

export function createOpenAIProvider(options: OpenAIProviderOptions = {}): OpenAIExecutorProvider {
  const registrations = ownControlExtensions(options.controlExtensions ?? [])
  const controlContract = options.controlExtensions === undefined ? OPENAI_CONTROL_CONTRACT : createOpenAIControlContract(registrations)
  const manifest = options.controlExtensions === undefined ? OPENAI_EXECUTOR_MANIFEST : Object.freeze({ ...OPENAI_EXECUTOR_MANIFEST, configurationControls: controlContract })
  const endpoint = options.endpoint ?? 'https://api.openai.com/v1'
  const parsedEndpoint = new URL(endpoint)
  if (parsedEndpoint.protocol !== 'https:' || parsedEndpoint.username || parsedEndpoint.password || parsedEndpoint.search || parsedEndpoint.hash) throw new Error('OpenAI endpoint must be an HTTPS origin or path without credentials')
  return {
    manifest,
    create(createOptions): OpenAIAdapter {
      const selection = validateExecutorSelection(createOptions.selection)
      if (selection.providerId !== 'openai') throw new Error('OpenAI provider selection ID mismatch')
      for (const capability of selection.capabilities ?? []) {
        if (!OPENAI_EXECUTOR_MANIFEST.capabilities.includes(capability)) throw new Error(`OpenAI capability '${capability}' is not supported`)
      }
      const configResult = OPENAI_CONFIGURATION_SCHEMA['~standard'].validate(selection.configuration)
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
      const resolveCredential = async (runSecrets: string[]): Promise<string> => {
        const value = typeof credential === 'function' ? await credential() : credential
        if (typeof value !== 'string' || value.length === 0 || /[\r\n]/.test(value)) throw new Error('invalid OpenAI credential')
        runSecrets.push(value)
        return value
      }
      const send = async (path: string, init: Omit<RequestInit, 'headers'> & { headers?: RequestInit['headers'] }, signal: AbortSignal, tagRunFailures = false, runSecrets: string[] = []): Promise<Response> => {
        if (signal.aborted) throw new DOMException('OpenAI request cancelled', 'AbortError')
        let secret: string
        try { secret = await resolveCredential(runSecrets) } catch (error) {
          if (!tagRunFailures || signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error
          throw openAIFailure({ failurePhase: 'credential', requestAccepted: false })
        }
        if (signal.aborted) throw new DOMException('OpenAI request cancelled', 'AbortError')
        try {
          return await transport(new URL(path.replace(/^\//, ''), `${endpoint.replace(/\/$/, '')}/`).toString(), {
            ...init, signal, headers: { authorization: `Bearer ${secret}`, ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }), ...init.headers },
          })
        } catch (error) {
          if (!tagRunFailures || signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error
          throw openAIFailure({ failurePhase: 'transport' })
        }
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
      if (host !== undefined && ((host.dispatchTool !== undefined && typeof host.dispatchTool !== 'function') || (host.createExecution !== undefined && typeof host.createExecution !== 'function'))) throw new Error('OpenAI tool host has an invalid dispatch boundary')
      if (host !== undefined && (typeof host.dispatchTool === 'function') === (typeof host.createExecution === 'function')) throw new Error('OpenAI tool host requires exactly one durable dispatcher or legacy execution boundary')
      if (host?.dispatchTool !== undefined && host.definitions.some((tool) => typeof tool.id !== 'string' || tool.id.length === 0)) throw new Error('OpenAI durable tool host requires an ID on every tool definition')
      if (host !== undefined && !selected.has('local-tools')) throw new Error('local tool host requires local-tools selection')
      if (selected.has('local-tools') && host === undefined) throw new Error('local-tools selection requires Brambo host tool boundary')
      const definitions = host?.definitions.map(toOpenAIToolDefinition) ?? []
      const names = new Map(host?.definitions.map((tool) => [tool.name, tool]) ?? [])
      if (names.size !== definitions.length) throw new Error('duplicate local function names')
      const observe = (observation: OpenAIProviderObservation, context: { readonly status?: number; readonly requestId?: string; readonly requestAccepted?: boolean } = {}): void => {
        try { options.onObservation?.(observation) } catch {
          const error = openAIFailure({ failurePhase: 'callback', ...context })
          callbackFailures.add(error)
          throw error
        }
      }
      const sendTurn = async (body: Record<string, unknown>, signal: AbortSignal, turnIndex: number, runSecrets: string[], onHeaders: (requestId: string | undefined, rates: Readonly<Record<string, string>>, status: number) => void): Promise<{ response: Record<string, unknown>; requestId?: string; rates: Readonly<Record<string, string>>; usage?: ApiUsageObservation }> => {
        const http = await executeWithRetry({ signal, idempotency: 'unknown', send: () => send('responses', { method: 'POST', body: JSON.stringify(body) }, signal, true, runSecrets) }, { now, random: Math.random, maxAttempts: 1, sleep: async () => undefined })
        const rawRequestId = nonEmpty(http.headers.get('x-request-id'))
        const requestId = rawRequestId === undefined ? undefined : redactProviderMetadata(rawRequestId, runSecrets) as string
        const rates = rateMetadata(http.headers)
        onHeaders(requestId, rates, http.status)
        const safeRates = redactProviderMetadata(rates, runSecrets) as Readonly<Record<string, string>>
        if (Object.keys(safeRates).length) observe({ kind: 'rate-limit', value: safeRates }, {
          status: http.status,
          requestId,
          requestAccepted: http.ok ? true : acceptedForHttpStatus(http.status),
        })
        if (!http.ok) {
          const rawRetryAfter = http.headers.get('retry-after')
          const retryAfter = rawRetryAfter !== null && /^\d+(?:\.\d+)?$/.test(rawRetryAfter) ? Number(rawRetryAfter) : undefined
          const error = openAIFailure({ failurePhase: 'http', category: category(http.status), status: http.status, requestId, message: 'OpenAI request failed', requestAccepted: acceptedForHttpStatus(http.status), retryAfter })
          throw error
        }
        let response: unknown
        if (body.stream === true) {
          if (http.body === null) throw openAIFailure({ failurePhase: 'response-parse', status: http.status, requestId, requestAccepted: true })
          let streamedResponseId: string | undefined
          try {
            for await (const event of readOpenAISse(http.body, signal)) {
              streamedResponseId = nonEmpty(event.response?.id) ?? streamedResponseId
              try {
                options.onEvent?.({ type: event.type, sequence: event.sequence, turnIndex, ...(requestId === undefined ? {} : { requestId }), ...(streamedResponseId === undefined ? {} : { responseId: streamedResponseId }), ...(event.delta === undefined ? {} : { delta: redactProviderMetadata(event.delta, runSecrets) as string }), ...(event.outputIndex === undefined ? {} : { outputIndex: event.outputIndex }), ...(event.contentIndex === undefined ? {} : { contentIndex: event.contentIndex }) })
              } catch {
                throw openAIFailure({ failurePhase: 'callback', status: http.status, requestId, requestAccepted: true })
              }
              if (event.type === 'response.completed') response = event.response
              if (event.type === 'response.failed' || event.type === 'response.incomplete' || event.type === 'response.error') {
                throw openAIFailure({ failurePhase: 'provider-response', status: http.status, requestId, requestAccepted: true })
              }
            }
          } catch (error) {
            if (isOpenAIFailure(error) || signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error
            if (error instanceof OpenAISseReadError) throw openAIFailure({ failurePhase: 'transport', status: http.status, requestId, requestAccepted: true })
            throw openAIFailure({ failurePhase: 'response-parse', status: http.status, requestId, requestAccepted: true })
          }
        } else {
          try { response = await http.json() } catch { throw openAIFailure({ failurePhase: 'response-parse', status: http.status, requestId, requestAccepted: true }) }
        }
        if (!record(response) || typeof response.id !== 'string' || !Array.isArray(response.output)) {
          throw openAIFailure({ failurePhase: 'response-shape', status: http.status, requestId, requestAccepted: true })
        }
        if (response.status !== 'completed') {
          throw openAIFailure({ failurePhase: 'provider-response', status: http.status, requestId, requestAccepted: true })
        }
        if (capabilityFields.store) capabilities.recordResponse(response.id)
        const usage = usageOf(response, body.model as string, requestId, now, runSecrets)
        if (usage !== undefined) observe({ kind: 'usage', value: usage }, { status: http.status, requestId, requestAccepted: true })
        return { response, requestId, rates: safeRates, usage }
      }
      return {
        async run(runRequest: RunRequest): Promise<ResultEnvelope> {
          if (disposed) return failed('OpenAI adapter is disposed', 'disposed')
          let invocationConfig = config
          let invocationModel = selection.model
          let nativeControls: JsonObject = {}
          try {
            runRequest = validateRunRequest(runRequest)
            if (runRequest.executionConfiguration !== undefined) {
              const effective = await validateExecutionConfigurationForContract(runRequest.executionConfiguration, controlContract)
              invocationConfig = { ...(config.instructions === undefined ? {} : { instructions: config.instructions }), ...(config.previousResponseId === undefined ? {} : { previousResponseId: config.previousResponseId }), ...effective.configuration }
              invocationModel = effective.model!
              if (invocationConfig.stream === true && !selected.has('streaming')) throw new Error('streaming requires selection')
              nativeControls = await mapControlExtensions(effective.extensions, registrations, nativeControlSchema, [
                'stream',
                ...(invocationConfig.maxOutputTokens === undefined ? [] : ['max_output_tokens']),
                ...(invocationConfig.temperature === undefined ? [] : ['temperature']),
                ...(invocationConfig.reasoningEffort === undefined ? [] : ['reasoning']),
              ])
            }
          } catch { return failed('Invalid OpenAI run request', 'invalid-request') }
          const signal = AbortSignal.any([controller.signal, runRequest.signal ?? new AbortController().signal])
          if (signal.aborted) return cancelled()
          const input: unknown[] = [{ role: 'user', content: capabilityFields.input.length ? [{ type: 'input_text', text: runRequest.prompt }, ...capabilityFields.input] : runRequest.prompt }]
          const base: Record<string, unknown> = {
            ...nativeControls,
            model: invocationModel,
            store: capabilityFields.store,
            stream: invocationConfig.stream ?? selected.has('streaming'),
            ...(invocationConfig.instructions === undefined ? {} : { instructions: invocationConfig.instructions }),
            ...(invocationConfig.maxOutputTokens === undefined ? {} : { max_output_tokens: invocationConfig.maxOutputTokens }),
            ...(invocationConfig.temperature === undefined ? {} : { temperature: invocationConfig.temperature }),
            ...(invocationConfig.reasoningEffort === undefined ? {} : { reasoning: { effort: invocationConfig.reasoningEffort } }),
          }
          const tools = [...definitions, ...capabilityFields.tools]
          if (tools.length) base.tools = tools
          const runSecrets: string[] = []
          let lastRequestId: string | undefined
          let lastResponse: Record<string, unknown> | undefined
          let lastRates: Readonly<Record<string, string>> = {}
          let lastStatus: number | undefined
          let toolRequestId: string | undefined
          let previousResponseId = invocationConfig.previousResponseId
          let step = 0
          let approvalSteps = 0
          const seenApprovals = new Set<string>()
          const turns: Array<{ responseId: string; requestId?: string; usage?: ApiUsageObservation; rateLimits: Readonly<Record<string, string>> }> = []
          try {
            const loop = await runLocalToolLoop({
              state: { input }, signal, limits: host?.limits ?? { maxSteps: 1, maxConcurrentCalls: 1 },
              ...(host?.dispatchTool === undefined
                ? { executeTool, createExecution: host?.createExecution ?? (() => { throw new Error('no local tool host') }) }
                : { dispatchTool: host.dispatchTool }),
              encodeResult: (call, outcome: ProviderToolExecutionOutcome) => ({ callId: call.id, output: outcome.kind === 'durable-result' ? outcome.result : outcome.kind === 'result' ? { status: outcome.result.status, stdout: outcome.result.stdout, stderr: outcome.result.stderr, ...(outcome.result.error === undefined ? {} : { error: outcome.result.error.code }) } : { status: 'error', message: 'Brambo tool execution failed' } }),
              next: async (state, priorResults) => {
                const nextInput = [...state.input]
                let incremental: unknown[] = priorResults.map(toOpenAIToolOutput)
                nextInput.push(...incremental)
                while (true) {
                  step += 1
                  const body: Record<string, unknown> = { ...base, input: capabilityFields.store && previousResponseId !== undefined && step > 1 ? incremental : nextInput }
                  if (capabilityFields.store && previousResponseId !== undefined) body.previous_response_id = previousResponseId
                  const turn = await sendTurn(body, signal, step, runSecrets, (requestId, rates, status) => { lastRequestId = requestId; lastRates = rates; lastStatus = status })
                  lastRequestId = turn.requestId
                  lastResponse = turn.response
                  lastRates = turn.rates
                  turns.push({ responseId: String(turn.response.id), requestId: turn.requestId, usage: turn.usage, rateLimits: turn.rates })
                  previousResponseId = String(turn.response.id)
                  const output = turn.response.output as unknown[]
                  if (!capabilityFields.store) nextInput.push(...output.filter(record))
                  const approvalRequests = output.filter((item): item is Record<string, unknown> => record(item) && item.type === 'mcp_approval_request')
                  if (approvalRequests.length) {
                    if (output.some((item) => record(item) && item.type === 'function_call') || ++approvalSteps > 8) throw new Error('OpenAI remote MCP approval sequence is invalid or exceeds limit')
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
                  let calls: ReturnType<typeof functionsOf>
                  try { calls = functionsOf(turn.response) } catch {
                    throw openAIFailure({
                      failurePhase: functionCallFailurePhase(turn.response),
                      status: lastStatus,
                      requestId: turn.requestId ?? lastRequestId,
                      requestAccepted: acceptedAfterHttpResponse(lastStatus),
                    })
                  }
                  if (calls.length === 0) {
                    if (!textOf(turn.response) && (approvalSteps > 0 || output.some((item) => record(item) && (item.type === 'mcp_call' || item.type === 'mcp_list_tools')))) throw new Error('OpenAI remote MCP response has no final output')
                    return { state: { input: nextInput }, complete: true }
                  }
                  toolRequestId ??= turn.requestId
                  if (host === undefined) throw new Error('OpenAI requested a local function without a Brambo tool host')
                  const normalized: ProviderToolCall[] = calls.map((call) => {
                    const definition = names.get(call.name)
                    if (definition === undefined) throw new Error('OpenAI requested an unknown local function')
                    return {
                      id: call.call_id, toolId: definition.id, arguments: call.parsedArguments, concurrencySafe: definition.concurrencySafe ?? false,
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
              const requestAccepted = acceptedAfterHttpResponse(lastStatus)
              const error = openAIFailure({ failurePhase: 'processing', category: 'tool-failure', message: 'OpenAI local tool loop exceeded its maximum steps', requestId: toolRequestId, status: lastStatus, requestAccepted })
              observe({ kind: 'error', value: error }, { status: lastStatus, requestId: lastRequestId, requestAccepted })
              return failed(error.message, error.category, { providerError: error, requestId: lastRequestId, responseId: lastResponse?.id, rateLimits: lastRates, turns, usageTotals: usageTotals(turns) })
            }
            if (lastResponse === undefined) return failed('OpenAI returned no response', 'protocol')
            const summary = redactProviderMetadata(textOf(lastResponse), runSecrets) as string
            return { status: 'ok', summary: summary || 'OpenAI response completed', data: { responseId: lastResponse.id, requestId: lastRequestId, usage: turns.at(-1)?.usage, usageTotals: usageTotals(turns), turns, rateLimits: lastRates, promptCaching: 'provider-managed', output: summary } }
          } catch (error) {
            if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError') || (record(error) && error.category === 'cancelled')) return cancelled()
            const normalized = isOpenAIFailure(error) ? error : openAIFailure({
              failurePhase: 'processing',
              status: lastStatus,
              requestId: toolRequestId ?? lastRequestId,
              requestAccepted: acceptedAfterHttpResponse(lastStatus),
            })
            if (!isCallbackFailure(error)) {
              try {
                observe({ kind: 'error', value: normalized }, {
                  status: lastStatus,
                  requestId: toolRequestId ?? lastRequestId,
                  requestAccepted: acceptedAfterHttpResponse(lastStatus),
                })
              } catch { /* Preserve the primary failure if its observer is unavailable. */ }
            }
            return failed(normalized.message, normalized.category, { providerError: normalized, requestId: lastRequestId, responseId: lastResponse?.id, rateLimits: redactProviderMetadata(lastRates, runSecrets), turns, usageTotals: usageTotals(turns) })
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
