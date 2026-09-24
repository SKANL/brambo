import { describe, expect, it } from 'vitest'
import { decodeOpenAIResponseEvent, readOpenAISse } from '../src/openai-events.ts'

describe('OpenAI Responses SSE', () => {
  it('validates monotonic provider sequence and item indexes', () => {
    expect(decodeOpenAIResponseEvent({ type: 'response.output_text.delta', sequence_number: 2, output_index: 0, content_index: 0, delta: 'hi' })).toMatchObject({ type: 'response.output_text.delta', sequence: 2, outputIndex: 0, delta: 'hi' })
    expect(() => decodeOpenAIResponseEvent({ type: 'response.output_text.delta', sequence_number: -1, delta: 'hi' })).toThrow()
  })
  it('decodes split UTF-8 SSE chunks and final completion', async () => {
    const encoder = new TextEncoder()
    const bytes = encoder.encode('data: {"type":"response.output_text.delta","sequence_number":1,"output_index":0,"content_index":0,"delta":"café"}\n\ndata: {"type":"response.completed","sequence_number":2,"response":{"id":"resp-1","status":"completed","output":[]}}\n\ndata: [DONE]\n\n')
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes.slice(0, 111)); controller.enqueue(bytes.slice(111, 113)); controller.enqueue(bytes.slice(113)); controller.close() } })
    const events = []
    for await (const event of readOpenAISse(body)) events.push(event)
    expect(events.map((event) => event.type)).toEqual(['response.output_text.delta', 'response.completed'])
    expect(events[0]).toMatchObject({ delta: 'café' })
  })

  it('cancels a pending stream read immediately when the run aborts', async () => {
    let source!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({ start(controller) { source = controller } })
    const controller = new AbortController()
    const iterator = readOpenAISse(body, controller.signal)
    const pending = iterator.next().then(() => 'settled', () => 'cancelled')
    controller.abort()
    const result = await Promise.race([pending, new Promise<string>((resolve) => setTimeout(() => resolve('timed-out'), 100))])
    if (result === 'timed-out') source.close()
    expect(result).toBe('cancelled')
  })
})
