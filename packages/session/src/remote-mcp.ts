import { BRAMBO_ERROR_CODES, BramboError } from '@brambo/contracts'
import type { JsonObject, JsonValue } from '@brambo/contracts'

export interface StreamableHttpTransport {
  request(url: string, init: Readonly<{ method: 'POST'; headers: Readonly<Record<string, string>>; body: string; signal: AbortSignal }>): Promise<Readonly<{ status: number; headers?: Readonly<Record<string, string>>; text(): Promise<string> }>>
}

export interface RemoteMcpClientOptions {
  readonly transport: StreamableHttpTransport
  readonly timeoutMs?: number
  readonly headers?: Readonly<Record<string, string>>
}

export interface RemoteMcpResponse {
  readonly jsonrpc: '2.0'
  readonly id: number
  readonly result?: JsonValue
  readonly error?: Readonly<{ code: number; message: string; data?: JsonValue }>
}

export interface RemoteMcpClient {
  request(url: string, method: string, params: JsonObject, signal?: AbortSignal): Promise<RemoteMcpResponse>
}

export class RemoteMcpError extends BramboError {
  readonly requestId?: number
  constructor(code: typeof BRAMBO_ERROR_CODES[keyof typeof BRAMBO_ERROR_CODES], message: string, requestId?: number, options?: ErrorOptions) {
    super(code, message, options)
    this.name = 'RemoteMcpError'
    this.requestId = requestId
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function jsonError(message: string, cause?: unknown): RemoteMcpError {
  return new RemoteMcpError(BRAMBO_ERROR_CODES.sandboxResponseInvalid, `invalid remote MCP response: ${message}`, undefined, cause === undefined ? undefined : { cause })
}

function parseResponse(text: string, id: number): RemoteMcpResponse {
  let value: unknown
  try { value = JSON.parse(text) } catch (cause) { throw jsonError('body is not valid JSON', cause) }
  if (!record(value) || value['jsonrpc'] !== '2.0' || value['id'] !== id) {
    throw jsonError(`response must contain jsonrpc '2.0' and matching id ${id}`)
  }
  const hasResult = Object.hasOwn(value, 'result')
  const hasError = Object.hasOwn(value, 'error')
  if (hasResult === hasError) throw jsonError('response must contain exactly one of result or error')
  if (hasError) {
    const error = value['error']
    if (!record(error) || !Number.isInteger(error['code']) || typeof error['message'] !== 'string' || error['message'].length === 0) {
      throw jsonError('error must contain an integer code and non-empty message')
    }
    return { jsonrpc: '2.0', id, error: { code: error['code'] as number, message: error['message'], ...(error['data'] === undefined ? {} : { data: error['data'] as JsonValue }) } }
  }
  return { jsonrpc: '2.0', id, result: value['result'] as JsonValue }
}

export function createRemoteMcpClient(options: RemoteMcpClientOptions): RemoteMcpClient {
  const timeoutMs = options.timeoutMs ?? 30_000
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new RemoteMcpError(BRAMBO_ERROR_CODES.sandboxRequestInvalid, 'timeoutMs must be a positive integer')
  let nextId = 1
  return Object.freeze({
    async request(url: string, method: string, params: JsonObject, signal?: AbortSignal): Promise<RemoteMcpResponse> {
      const id = nextId++
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const onAbort = () => controller.abort()
      signal?.addEventListener('abort', onAbort, { once: true })
      try {
        const response = await options.transport.request(url, { method: 'POST', headers: { accept: 'application/json, text/event-stream', 'content-type': 'application/json', ...options.headers }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }), signal: controller.signal })
        if (!response || response.status < 200 || response.status >= 300) throw new RemoteMcpError(BRAMBO_ERROR_CODES.executorRunFailed, `remote MCP returned HTTP ${response?.status ?? 'unknown'}`, id)
        const parsed = parseResponse(await response.text(), id)
        if (parsed.error) throw new RemoteMcpError(BRAMBO_ERROR_CODES.executorRunFailed, `remote MCP request '${method}' failed: ${parsed.error.message}`, id)
        return parsed
      } catch (cause) {
        if (cause instanceof RemoteMcpError) throw cause
        if (signal?.aborted) throw new RemoteMcpError(BRAMBO_ERROR_CODES.executorCancelled, `remote MCP request '${method}' was aborted`, id, { cause })
        if (controller.signal.aborted) throw new RemoteMcpError(BRAMBO_ERROR_CODES.executorCancelled, `remote MCP request '${method}' timed out`, id, { cause })
        throw new RemoteMcpError(BRAMBO_ERROR_CODES.executorRunFailed, `remote MCP request '${method}' failed`, id, { cause })
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
      }
    },
  })
}
