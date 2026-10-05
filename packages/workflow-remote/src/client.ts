import { validateProtocolRequest, validateProtocolResponse } from '@brambodev/contracts'
import type { JsonValue, WorkflowProtocolOperation } from '@brambodev/contracts'
export interface RemoteClientOptions {
  readonly endpoint: string
  readonly fetch: typeof fetch
  readonly authorizeRequest: () => Promise<Readonly<Record<string, string>>>
  readonly signal?: AbortSignal
  readonly maxResponseBytes?: number
}
export function invalid(): never { throw new Error('Invalid remote workflow response') }
export function record(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  const data = value as Record<string, unknown>
  if (required.some((key) => !Object.hasOwn(data, key)) || Object.keys(data).some((key) => ![...required, ...optional].includes(key))) invalid()
  return data
}
export function integer(value: unknown, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) invalid()
  return value
}
export function createClient(options: RemoteClientOptions) {
  let endpoint: URL
  try {
    endpoint = new URL(options.endpoint)
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw 0
  } catch { throw new Error('Invalid remote endpoint') }
  const maxBytes = options.maxResponseBytes ?? 1024 * 1024
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 64 * 1024 * 1024) throw new Error('Invalid remote response limit')
  if (typeof options.fetch !== 'function' || typeof options.authorizeRequest !== 'function') throw new Error('Remote transport and authorization are required')
  const controller = new AbortController()
  const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal
  let closed = false
  function abort(): never { throw new Error('Remote workflow aborted') }
  async function wait<T>(promise: Promise<T>): Promise<T> {
    if (signal.aborted) abort()
    let listener: () => void = () => {}
    try {
      return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
        listener = () => reject(new Error('Remote workflow aborted'))
        signal.addEventListener('abort', listener, { once: true })
      })])
    } finally { signal.removeEventListener('abort', listener) }
  }
  return {
    maxBytes,
    close() { closed = true; controller.abort() },
    async request(operation: WorkflowProtocolOperation, payload: unknown, ...denied: unknown[]): Promise<unknown> {
      if (closed) throw new Error('Remote workflow client closed')
      if (signal.aborted) abort()
      const body = JSON.stringify(validateProtocolRequest({ version: 1, operation, payload: payload as JsonValue }))
      if (Buffer.byteLength(body) > 1024 * 1024) throw new Error('Remote workflow request too large')
      let response: Response
      try {
        const auth = await wait(options.authorizeRequest())
        if (signal.aborted) abort()
        const headers = new Headers(auth)
        headers.set('content-type', 'application/json')
        response = await wait(options.fetch(endpoint.href, { method: 'POST', headers, body, signal, redirect: 'error', credentials: 'omit' }))
      } catch {
        if (signal.aborted) abort()
        throw new Error('Remote workflow unavailable')
      }
      const reader = response.body?.getReader()
      if (!reader) invalid()
      const chunks: Uint8Array[] = []
      let size = 0
      try {
        while (true) {
          const next = await wait(reader.read())
          if (next.done) break
          if (next.value.byteLength > maxBytes - size) invalid()
          size += next.value.byteLength
          chunks.push(next.value)
        }
        const bytes = Buffer.concat(chunks, size)
        const envelope = validateProtocolResponse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
        if (envelope.status === 'denied' && denied.length) return denied[0]
        if (!response.ok || envelope.status !== 'ok') invalid()
        return envelope.payload
      } catch {
        if (signal.aborted) abort()
        throw new Error('Invalid remote workflow response')
      } finally {
        void reader.cancel().catch(() => {})
        reader.releaseLock()
      }
    },
  }
}
