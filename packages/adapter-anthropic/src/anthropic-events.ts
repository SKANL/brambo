export interface AnthropicProviderEvent {
  readonly type: string
  readonly sequence: number
  readonly index?: number
  readonly delta?: Readonly<Record<string, unknown>>
  readonly block?: Readonly<Record<string, unknown>>
  readonly message?: Readonly<Record<string, unknown>>
  readonly usage?: Readonly<Record<string, unknown>>
  readonly raw: Readonly<Record<string, unknown>>
}

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) }

export function decodeAnthropicSseEvent(value: unknown, sequence = 0): AnthropicProviderEvent {
  if (!record(value) || typeof value.type !== 'string' || value.type.length === 0 || !Number.isSafeInteger(sequence) || sequence < 0) throw new Error('invalid Anthropic stream event')
  if (value.index !== undefined && (typeof value.index !== 'number' || !Number.isSafeInteger(value.index) || value.index < 0)) throw new Error('invalid Anthropic stream block index')
  if (value.type.startsWith('content_block_') && value.index === undefined) throw new Error('Anthropic content block index is missing')
  if (value.type === 'content_block_start' && !record(value.content_block)) throw new Error('Anthropic content block is invalid')
  if (value.type === 'content_block_delta' && !record(value.delta)) throw new Error('Anthropic content delta is invalid')
  if (value.type === 'message_start' && !record(value.message)) throw new Error('Anthropic message start is invalid')
  if (value.type === 'message_delta' && !record(value.delta)) throw new Error('Anthropic message delta is invalid')
  if (value.type === 'error' && !record(value.error)) throw new Error('Anthropic stream error is invalid')
  return { type: value.type, sequence, ...(typeof value.index === 'number' ? { index: value.index } : {}), ...(record(value.delta) ? { delta: structuredClone(value.delta) } : {}), ...(record(value.content_block) ? { block: structuredClone(value.content_block) } : {}), ...(record(value.message) ? { message: structuredClone(value.message) } : {}), ...(record(value.usage) ? { usage: structuredClone(value.usage) } : {}), raw: structuredClone(value) }
}

/** Bounded, abort-aware SSE reader. Anthropic has no native sequence number, so arrival order is assigned locally. */
export async function* readAnthropicSse(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<AnthropicProviderEvent> {
  const reader = body.getReader()
  const abortRead = (): void => { void reader.cancel().catch(() => undefined) }
  signal?.addEventListener('abort', abortRead, { once: true })
  const decoder = new TextDecoder()
  let buffer = ''
  let sequence = 0
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('Anthropic stream cancelled', 'AbortError')
      const chunk = await reader.read()
      if (signal?.aborted) throw new DOMException('Anthropic stream cancelled', 'AbortError')
      buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true })
      if (buffer.length > 1_048_576) throw new Error('Anthropic SSE frame exceeds limit')
      while (true) {
        const boundary = /\r?\n\r?\n|\r\r/.exec(buffer)
        if (boundary === null) break
        const frame = buffer.slice(0, boundary.index)
        buffer = buffer.slice(boundary.index + boundary[0].length)
        const lines = frame.split(/\r\n|\r|\n/)
        const name = lines.find((line) => line.startsWith('event:'))?.slice(6).trim()
        const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
        if (!data) continue
        let parsed: unknown
        try { parsed = JSON.parse(data) } catch { throw new Error('invalid Anthropic SSE JSON') }
        const event = decodeAnthropicSseEvent(parsed, ++sequence)
        if (name !== undefined && name !== event.type) throw new Error('Anthropic SSE event/data type mismatch')
        yield event
      }
      if (chunk.done) { if (buffer.trim()) throw new Error('incomplete Anthropic SSE frame'); break }
    }
  } finally {
    signal?.removeEventListener('abort', abortRead)
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

/** Reconstructs the same message shape as non-streaming Messages for result/tool processing. */
export async function collectAnthropicMessage(body: ReadableStream<Uint8Array>, signal: AbortSignal, onEvent?: (event: AnthropicProviderEvent) => void): Promise<Record<string, unknown>> {
  let message: Record<string, unknown> | undefined
  let stopped = false
  const open = new Set<number>()
  for await (const event of readAnthropicSse(body, signal)) {
    onEvent?.(event)
    if (event.type === 'error') throw new Error('Anthropic stream reported an error')
    if (event.type === 'message_start') {
      if (message !== undefined || !record(event.message) || !Array.isArray(event.message.content)) throw new Error('invalid Anthropic message_start sequence')
      message = structuredClone(event.message)
    } else if (event.type === 'content_block_start') {
      if (message === undefined || event.index === undefined || event.block === undefined || open.has(event.index)) throw new Error('invalid Anthropic content_block_start sequence')
      const content = message.content as unknown[]
      if (event.index !== content.length) throw new Error('Anthropic content blocks are out of order')
      content.push(structuredClone(event.block)); open.add(event.index)
    } else if (event.type === 'content_block_delta') {
      if (message === undefined || event.index === undefined || !open.has(event.index) || event.delta === undefined) throw new Error('invalid Anthropic content_block_delta sequence')
      const block = (message.content as Record<string, unknown>[])[event.index]
      if (block === undefined) throw new Error('Anthropic content block is missing')
      // Citations stream separately from text; each delta adds one citation to the current text block.
      if (event.delta.type === 'text_delta' && block.type === 'text' && typeof event.delta.text === 'string') block.text = String(block.text ?? '') + event.delta.text
      else if (event.delta.type === 'citations_delta' && block.type === 'text' && record(event.delta.citation) && typeof event.delta.citation.type === 'string') {
        if (block.citations !== undefined && !Array.isArray(block.citations)) throw new Error('invalid Anthropic citation list')
        const citations = (block.citations ?? []) as unknown[]
        citations.push(structuredClone(event.delta.citation))
        block.citations = citations
      } else if (event.delta.type === 'input_json_delta' && (block.type === 'tool_use' || block.type === 'server_tool_use') && typeof event.delta.partial_json === 'string') block.__partialJson = String(block.__partialJson ?? '') + event.delta.partial_json
      else if (event.delta.type === 'thinking_delta' && block.type === 'thinking' && typeof event.delta.thinking === 'string') block.thinking = String(block.thinking ?? '') + event.delta.thinking
      else if (event.delta.type === 'signature_delta' && block.type === 'thinking' && typeof event.delta.signature === 'string') block.signature = String(block.signature ?? '') + event.delta.signature
      else throw new Error('invalid Anthropic content delta for block')
    } else if (event.type === 'content_block_stop') {
      if (message === undefined || event.index === undefined || !open.delete(event.index)) throw new Error('invalid Anthropic content_block_stop sequence')
      const block = (message.content as Record<string, unknown>[])[event.index]
      if (block?.type === 'tool_use' || block?.type === 'server_tool_use') {
        const partial = block.__partialJson
        if (typeof partial === 'string') { try { block.input = JSON.parse(partial) } catch { throw new Error('malformed Anthropic streamed tool input') }; delete block.__partialJson }
      }
    } else if (event.type === 'message_delta') {
      if (message === undefined || event.delta === undefined) throw new Error('invalid Anthropic message_delta sequence')
      if (event.delta.stop_reason !== undefined) message.stop_reason = event.delta.stop_reason
      if (event.usage !== undefined) message.usage = { ...(record(message.usage) ? message.usage : {}), ...event.usage }
    } else if (event.type === 'message_stop') {
      if (message === undefined || open.size > 0) throw new Error('invalid Anthropic message_stop sequence')
      stopped = true
    }
  }
  if (message === undefined || !stopped || open.size > 0) throw new Error('incomplete Anthropic stream')
  return message
}
