export interface OpenAIProviderEvent {
  readonly type: string
  readonly sequence: number
  readonly outputIndex?: number
  readonly contentIndex?: number
  readonly itemId?: string
  readonly delta?: string
  readonly response?: Readonly<Record<string, unknown>>
  readonly item?: Readonly<Record<string, unknown>>
  readonly raw: Readonly<Record<string, unknown>>
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function index(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(`invalid OpenAI ${label}`)
  return value
}

export function decodeOpenAIResponseEvent(value: unknown): OpenAIProviderEvent {
  if (!record(value) || typeof value.type !== 'string' || !value.type.startsWith('response.') || typeof value.sequence_number !== 'number' || !Number.isSafeInteger(value.sequence_number) || value.sequence_number < 0) {
    throw new Error('invalid OpenAI Responses stream event')
  }
  const outputIndex = index(value.output_index, 'output index')
  const contentIndex = index(value.content_index, 'content index')
  if ((value.type.includes('.delta') || value.type.includes('output_item.')) && outputIndex === undefined) throw new Error('OpenAI stream item is missing output index')
  if (value.type === 'response.output_text.delta' && (contentIndex === undefined || typeof value.delta !== 'string')) throw new Error('OpenAI text delta is invalid')
  if (value.response !== undefined && !record(value.response)) throw new Error('OpenAI response event has invalid response')
  if (value.item !== undefined && !record(value.item)) throw new Error('OpenAI response event has invalid item')
  const raw = structuredClone(value)
  return {
    type: value.type,
    sequence: value.sequence_number,
    ...(outputIndex === undefined ? {} : { outputIndex }),
    ...(contentIndex === undefined ? {} : { contentIndex }),
    ...(typeof value.item_id === 'string' ? { itemId: value.item_id } : {}),
    ...(typeof value.delta === 'string' ? { delta: value.delta } : {}),
    ...(record(value.response) ? { response: structuredClone(value.response) } : {}),
    ...(record(value.item) ? { item: structuredClone(value.item) } : {}),
    raw,
  }
}

/** Incremental UTF-8/SSE decoding with bounded frame size and abort-aware reader cleanup. */
export async function* readOpenAISse(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<OpenAIProviderEvent> {
  const reader = body.getReader()
  const abortRead = (): void => { void reader.cancel().catch(() => undefined) }
  signal?.addEventListener('abort', abortRead, { once: true })
  const decoder = new TextDecoder()
  let buffer = ''
  let lastSequence = -1
  let done = false
  try {
    while (!done) {
      if (signal?.aborted) throw new DOMException('Response stream cancelled', 'AbortError')
      const chunk = await reader.read()
      if (signal?.aborted) throw new DOMException('Response stream cancelled', 'AbortError')
      buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true })
      buffer = buffer.replace(/\r\n/g, '\n')
      if (buffer.length > 1_048_576) throw new Error('OpenAI SSE frame exceeds limit')
      while (true) {
        const boundary = buffer.indexOf('\n\n')
        if (boundary < 0) break
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const data = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
        if (data === '[DONE]') { done = true; break }
        if (data.length === 0) continue
        let parsed: unknown
        try { parsed = JSON.parse(data) } catch { throw new Error('invalid OpenAI SSE JSON') }
        const event = decodeOpenAIResponseEvent(parsed)
        if (event.sequence <= lastSequence) throw new Error('OpenAI SSE sequence is not strictly increasing')
        lastSequence = event.sequence
        yield event
      }
      if (chunk.done) {
        if (!done && buffer.trim().length > 0) throw new Error('incomplete OpenAI SSE frame')
        break
      }
    }
  } finally {
    signal?.removeEventListener('abort', abortRead)
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
