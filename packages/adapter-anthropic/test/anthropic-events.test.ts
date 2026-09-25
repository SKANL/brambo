import { describe, expect, it } from 'vitest'
import { collectAnthropicMessage, decodeAnthropicSseEvent, readAnthropicSse } from '../src/index.ts'

describe('Anthropic SSE', () => {
  it('decodes named events and checks their shape', () => {
    expect(decodeAnthropicSseEvent({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hi' } })).toMatchObject({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hi' } })
    expect(() => decodeAnthropicSseEvent({ type: 'content_block_delta', index: -1, delta: {} })).toThrow()
  })
  it('reads split UTF-8 frames, tolerates pings, and rejects event/data mismatches', async () => {
    const chunks = ['event: message_start\ndata: {"type":"message_start","message":{"id":"msg-1","content":[],"usage":{"input_tokens":1}}}\n\nevent: ping\ndata: {"type":"ping"}\n\n', 'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}\n\n']
    const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close() } })
    const events = []
    for await (const event of readAnthropicSse(stream)) events.push(event.type)
    expect(events).toEqual(['message_start', 'ping', 'content_block_delta'])
    const invalid = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('event: ping\ndata: {"type":"message_stop"}\n\n')); controller.close() } })
    await expect((async () => { for await (const event of readAnthropicSse(invalid)) void event })()).rejects.toThrow()
  })
  it('assembles streamed tool input JSON only after the content block closes', async () => {
    const events = [
      { type: 'message_start', message: { id: 'msg-1', role: 'assistant', content: [], usage: { input_tokens: 3 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu-1', name: 'read_file', input: {} } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"path":' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '"a"}' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 2 } },
      { type: 'message_stop' },
    ]
    const frames = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('')
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(frames)); controller.close() } })
    expect(await collectAnthropicMessage(stream, new AbortController().signal)).toMatchObject({ content: [{ type: 'tool_use', input: { path: 'a' } }], stop_reason: 'tool_use', usage: { input_tokens: 3, output_tokens: 2 } })
  })
  it('does not split a CRLF event boundary across transport chunks', async () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode('event: ping\r'))
      controller.enqueue(new TextEncoder().encode('\ndata: {"type":"message_stop"}\r\n\r'))
      controller.enqueue(new TextEncoder().encode('\n'))
      controller.close()
    } })
    await expect((async () => { for await (const event of readAnthropicSse(stream)) void event })()).rejects.toThrow(/mismatch/)
  })
  it('preserves citations_delta on streamed text blocks', async () => {
    const citation = { type: 'char_location', cited_text: 'source', document_index: 0, start_char_index: 0, end_char_index: 6 }
    const events = [
      { type: 'message_start', message: { id: 'msg-cited', role: 'assistant', content: [] } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Claim' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'citations_delta', citation } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
      { type: 'message_stop' },
    ]
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''))); controller.close() } })
    expect(await collectAnthropicMessage(stream, new AbortController().signal)).toMatchObject({ content: [{ type: 'text', text: 'Claim', citations: [citation] }] })
  })
  it('assembles streamed hosted web-search input on server_tool_use blocks', async () => {
    const events = [
      { type: 'message_start', message: { id: 'msg-search', role: 'assistant', content: [], usage: { server_tool_use: { web_search_requests: 0 } } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'server_tool_use', id: 'srvtoolu-1', name: 'web_search', input: {} } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query":"docs"}' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'pause_turn' } },
      { type: 'message_stop' },
    ]
    const frames = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('')
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(frames)); controller.close() } })
    expect(await collectAnthropicMessage(stream, new AbortController().signal)).toMatchObject({ content: [{ type: 'server_tool_use', input: { query: 'docs' } }], stop_reason: 'pause_turn' })
  })
})

  it('initializes omitted message_start content from the provider streaming shape', async () => {
    const events = [
      { type: 'message_start', message: { id: 'msg-live', type: 'message', role: 'assistant' } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'fixture-ok' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
      { type: 'message_stop' },
    ]
    const frames = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('')
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(frames)); controller.close() } })
    await expect(collectAnthropicMessage(stream, new AbortController().signal)).resolves.toMatchObject({ content: [{ type: 'text', text: 'fixture-ok' }], stop_reason: 'end_turn' })
  })

  it('keeps a zero-argument streamed tool input as an empty object', async () => {
    const events = [
      { type: 'message_start', message: { id: 'msg-empty-tool', role: 'assistant', content: [] } },
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu-empty', name: 'lookup_fixture', input: {} } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
      { type: 'message_stop' },
    ]
    const frames = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('')
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(frames)); controller.close() } })
    await expect(collectAnthropicMessage(stream, new AbortController().signal)).resolves.toMatchObject({ content: [{ type: 'tool_use', input: {} }], stop_reason: 'tool_use' })
  })
