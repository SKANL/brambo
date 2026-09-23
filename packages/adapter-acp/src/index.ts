export type JsonRpcRequestId = number

export interface StdioProcess {
  readonly stdin: { write(data: string): boolean | void; end?: () => void }
  readonly stdout: {
    on(event: 'data', listener: (chunk: string | Uint8Array) => void): unknown
    removeListener?: (event: 'data', listener: (chunk: string | Uint8Array) => void) => unknown
  }
  on(event: 'close' | 'error', listener: (...args: unknown[]) => void): unknown
  removeListener?: (event: 'close' | 'error', listener: (...args: unknown[]) => void) => unknown
}

export interface JsonRpcUpdate {
  readonly method: string
  readonly params?: unknown
}

export type PermissionDecision =
  | { readonly kind: 'approved' }
  | { readonly kind: 'denied'; readonly reason: string }
  | { readonly kind: 'expired'; readonly reason: string }

export interface StdioClientOptions {
  readonly maxFrameBytes?: number
  readonly onUpdate?: (update: JsonRpcUpdate) => void
  readonly onPermission?: (params: unknown) => PermissionDecision | Promise<PermissionDecision>
}

export type AdapterErrorCode = 'malformed-frame' | 'frame-too-large' | 'process-closed' | 'process-error' | 'rpc-error' | 'write-failed' | 'client-closed'

export class AdapterAcpError extends Error {
  readonly code: AdapterErrorCode
  override readonly cause?: unknown
  constructor(code: AdapterErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'AdapterAcpError'
    this.code = code
    this.cause = cause
  }
}

export interface InitializeParams { readonly [key: string]: unknown }
export interface SessionNewParams { readonly [key: string]: unknown }
export interface SessionLoadParams { readonly sessionId: string; readonly [key: string]: unknown }
export interface SessionPromptParams { readonly sessionId: string; readonly prompt: unknown; readonly [key: string]: unknown }
export interface SessionCancelParams { readonly sessionId: string; readonly [key: string]: unknown }

export interface AcpJsonRpcClient {
  initialize(params: InitializeParams): Promise<unknown>
  sessionNew(params: SessionNewParams): Promise<unknown>
  sessionLoad(params: SessionLoadParams): Promise<unknown>
  sessionPrompt(params: SessionPromptParams): Promise<unknown>
  sessionCancel(params: SessionCancelParams): Promise<unknown>
  close(): void
}

interface PendingRequest {
  readonly resolve: (value: unknown) => void
  readonly reject: (error: unknown) => void
}

const DEFAULT_MAX_FRAME_BYTES = 1024 * 1024

export function createStdioJsonRpcClient(process: StdioProcess, options: StdioClientOptions = {}): AcpJsonRpcClient {
  const maxFrameBytes = options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES
  if (!Number.isSafeInteger(maxFrameBytes) || maxFrameBytes < 1) throw new TypeError('maxFrameBytes must be a positive integer')
  const pending = new Map<JsonRpcRequestId, PendingRequest>()
  let nextId = 1
  let lineBuffer = ''
  let closed = false

  const onData = (chunk: string | Uint8Array): void => {
    if (closed) return
    lineBuffer += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)
    if (new TextEncoder().encode(lineBuffer).byteLength > maxFrameBytes && !lineBuffer.includes('\n')) {
      fail(new AdapterAcpError('frame-too-large', `JSON-RPC frame exceeds ${maxFrameBytes} bytes`))
      return
    }
    while (true) {
      const newline = lineBuffer.indexOf('\n')
      if (newline < 0) break
      const line = lineBuffer.slice(0, newline).replace(/\r$/, '')
      lineBuffer = lineBuffer.slice(newline + 1)
      if (new TextEncoder().encode(line).byteLength > maxFrameBytes) {
        fail(new AdapterAcpError('frame-too-large', `JSON-RPC frame exceeds ${maxFrameBytes} bytes`))
        return
      }
      if (line.length === 0) continue
      let message: unknown
      try { message = JSON.parse(line) } catch (error) {
        fail(new AdapterAcpError('malformed-frame', 'JSON-RPC frame is not valid JSON', error))
        return
      }
      handleMessage(message)
    }
  }

  const onClose = (): void => fail(new AdapterAcpError('process-closed', 'ACP process closed'))
  const onError = (error: unknown): void => fail(new AdapterAcpError('process-error', 'ACP process reported an error', error))
  process.stdout.on('data', onData)
  process.on('close', onClose)
  process.on('error', onError)

  function fail(error: AdapterAcpError): void {
    if (closed) return
    closed = true
    for (const request of pending.values()) request.reject(error)
    pending.clear()
    process.stdout.removeListener?.('data', onData)
    process.removeListener?.('close', onClose)
    process.removeListener?.('error', onError)
  }

  function handleMessage(message: unknown): void {
    if (!message || typeof message !== 'object') {
      fail(new AdapterAcpError('malformed-frame', 'JSON-RPC message must be an object'))
      return
    }
    const record = message as Record<string, unknown>
    if ('id' in record && ('result' in record || 'error' in record)) {
      const id = record.id
      if (typeof id !== 'number' || !Number.isSafeInteger(id)) {
        fail(new AdapterAcpError('malformed-frame', 'JSON-RPC response id must be a safe integer'))
        return
      }
      const request = pending.get(id)
      if (!request) return
      pending.delete(id)
      if (record.error !== undefined) request.reject(new AdapterAcpError('rpc-error', 'ACP request failed', record.error))
      else request.resolve(record.result)
      return
    }
    if (typeof record.method !== 'string') {
      fail(new AdapterAcpError('malformed-frame', 'JSON-RPC notification method must be a string'))
      return
    }
    const update: JsonRpcUpdate = { method: record.method, ...(record.params === undefined ? {} : { params: record.params }) }
    if (record.method === 'session/request_permission' && 'id' in record && typeof record.id === 'number') {
      const decision = options.onPermission?.(record.params) ?? { kind: 'denied', reason: 'no permission handler configured' }
      Promise.resolve(decision).then((value) => writeMessage({ jsonrpc: '2.0', id: record.id, result: value }), (error) => writeMessage({ jsonrpc: '2.0', id: record.id, error: { code: 'permission-handler-failed', message: String(error) } }))
      return
    }
    options.onUpdate?.(update)
  }

  function writeMessage(message: unknown): void {
    if (closed) return
    try {
      const result = process.stdin.write(`${JSON.stringify(message)}\n`)
      if (result === false) throw new Error('stdio stream refused write')
    } catch (error) {
      fail(new AdapterAcpError('write-failed', 'failed to write ACP request', error))
    }
  }

  function request(method: string, params: unknown): Promise<unknown> {
    if (closed) return Promise.reject(new AdapterAcpError('client-closed', 'ACP client is closed'))
    const id = nextId++
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      writeMessage({ jsonrpc: '2.0', id, method, params })
    })
  }

  return {
    initialize: (params) => request('initialize', params),
    sessionNew: (params) => request('session/new', params),
    sessionLoad: (params) => request('session/load', params),
    sessionPrompt: (params) => request('session/prompt', params),
    sessionCancel: (params) => request('session/cancel', params),
    close() {
      if (closed) return
      fail(new AdapterAcpError('client-closed', 'ACP client closed'))
      process.stdin.end?.()
    },
  }
}
