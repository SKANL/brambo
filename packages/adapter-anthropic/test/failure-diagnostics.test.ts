import { describe, expect, it } from 'vitest'
import { createAnthropicProvider } from '../src/index.ts'
import type { AnthropicProviderOptions } from '../src/index.ts'

const workspace = { id: 'synthetic-workspace', rootPath: 'C:/synthetic', capabilities: ['read'] } as never
const hostile = 'PRIVATE_SYNTHETIC_BODY_HEADER_MESSAGE_KEY'
const message = (stop = 'end_turn', content: unknown[] = []) => ({ id: 'synthetic-message', role: 'assistant', content, stop_reason: stop, usage: { input_tokens: 1 } })
const json = (value: unknown) => new Response(JSON.stringify(value))
const frame = (value: { type: string }) => `event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`
const stream = () => new Response(frame({ type: 'message_start', message: message() } as { type: string }) + frame({ type: 'message_stop' }))
const throwHostile = () => { throw { category: 'protocol', message: hostile, status: 499, requestAccepted: true, headers: { authorization: hostile }, body: hostile } }

async function run(options: AnthropicProviderOptions, streaming = false) {
  return createAnthropicProvider({ credential: 'synthetic-key', ...options }).create({
    selection: { providerId: 'anthropic', model: 'synthetic-model', capabilities: streaming ? ['streaming'] : [] }, credential: undefined,
  }).run({ prompt: 'synthetic prompt', workspace })
}

describe('safe failure diagnostics', () => {
  const cases: Array<{ name: string; options: AnthropicProviderOptions; streaming?: boolean; phase: string; category: string; status?: number; accepted?: boolean }> = [
    { name: 'credential resolution', options: { credential: throwHostile, transport: async () => { throw new Error('transport must not run') } }, phase: 'credential', category: 'unknown', accepted: false },
    { name: 'transport rejects spoofed metadata', options: { transport: async () => throwHostile() }, phase: 'transport', category: 'unknown' },
    { name: 'transport rejects counterfeit AbortError', options: { transport: async () => { throw new DOMException(hostile, 'AbortError') } }, phase: 'transport', category: 'unknown' },
    { name: 'JSON parsing', options: { transport: async () => new Response(hostile) }, phase: 'response-parse', category: 'protocol', status: 200, accepted: true },
    { name: 'JSON body read', options: { transport: async () => { const http = json(message()); Object.defineProperty(http, 'json', { value: async () => { throw new TypeError(hostile) } }); return http } }, phase: 'response-parse', category: 'protocol', status: 200, accepted: true },
    { name: 'response shape', options: { transport: async () => json({ body: hostile }) }, phase: 'response-shape', category: 'protocol', status: 200, accepted: true },
    { name: 'malformed tool shape', options: { transport: async () => json(message('tool_use', [{ type: 'tool_use', name: hostile }])) }, phase: 'response-shape', category: 'protocol', status: 200, accepted: true },
    { name: 'noncompleting response', options: { transport: async () => json(message('max_tokens')) }, phase: 'provider-response', category: 'protocol', status: 200, accepted: true },
    { name: 'unknown stop reason', options: { transport: async () => json(message(hostile)) }, phase: 'provider-response', category: 'protocol', status: 200, accepted: true },
    { name: 'HTTP client rejection', options: { transport: async () => new Response(hostile, { status: 401, headers: { authorization: hostile } }) }, phase: 'http', category: 'authentication', status: 401, accepted: false },
    { name: 'HTTP server ambiguity', options: { transport: async () => new Response(hostile, { status: 503 }) }, phase: 'http', category: 'unavailable', status: 503 },
    { name: 'usage callback', options: { transport: async () => json(message()), onObservation: throwHostile }, phase: 'callback', category: 'unknown', status: 200, accepted: true },
    { name: 'primary HTTP rejection before rate callback', options: { transport: async () => new Response(hostile, { status: 401, headers: { 'anthropic-ratelimit-requests-remaining': '1' } }), onObservation: throwHostile }, phase: 'http', category: 'authentication', status: 401, accepted: false },
    { name: 'successful HTTP rate callback', options: { transport: async () => new Response(JSON.stringify(message()), { headers: { 'anthropic-ratelimit-requests-remaining': '1' } }), onObservation: throwHostile }, phase: 'callback', category: 'unknown', status: 200, accepted: true },
    { name: 'SSE parse', options: { transport: async () => new Response(`data: ${hostile}\n\n`) }, streaming: true, phase: 'response-parse', category: 'protocol', status: 200, accepted: true },
    { name: 'SSE body read', options: { transport: async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error(hostile)) } })) }, streaming: true, phase: 'transport', category: 'unknown', status: 200, accepted: true },
    { name: 'SSE provider error', options: { transport: async () => new Response(frame({ type: 'error', error: { message: hostile } } as { type: string })) }, streaming: true, phase: 'provider-response', category: 'protocol', status: 200, accepted: true },
    { name: 'primary SSE provider error before event callback', options: { transport: async () => new Response(frame({ type: 'error', error: { message: hostile } } as { type: string })), onEvent: throwHostile, onObservation: throwHostile }, streaming: true, phase: 'provider-response', category: 'protocol', status: 200, accepted: true },
    { name: 'SSE callback', options: { transport: async () => stream(), onEvent: throwHostile }, streaming: true, phase: 'callback', category: 'unknown', status: 200, accepted: true },
  ]
  it.each(cases)('preserves $name without unsafe metadata', async ({ options, streaming, phase, category, status, accepted }) => {
    const result = await run(options, streaming)
    expect(result.status).toBe('failed')
    const diagnostic = (result.data as { providerError?: unknown }).providerError
    expect(diagnostic).toMatchObject({ providerId: 'anthropic', failurePhase: phase, category })
    expect(diagnostic).toHaveProperty('message', expect.any(String))
    expect((diagnostic as { status?: number }).status).toBe(status)
    expect((diagnostic as { requestAccepted?: boolean }).requestAccepted).toBe(accepted)
    expect(Object.keys(diagnostic as object).sort()).toEqual(['category', 'failurePhase', 'message', 'providerId', ...(status === undefined ? [] : ['status']), ...(accepted === undefined ? [] : ['requestAccepted'])].sort())
    expect(JSON.stringify(result)).not.toContain(hostile)
    expect(JSON.stringify(result)).not.toContain('synthetic-key')
  })
  it('preserves processing context after HTTP response', async () => {
    let responded = false
    const result = await run({ now: () => responded ? NaN : 0, transport: async () => { responded = true; return json(message()) } })
    expect(result).toMatchObject({ status: 'failed', data: { providerError: { failurePhase: 'processing', status: 200, requestAccepted: true } } })
  })
  it.each(['category accessor', 'counterfeit cancellation', 'counterfeit AbortError'])('rejects untrusted processing cancellation metadata: %s', async (kind) => {
    let reads = 0
    const error = kind === 'category accessor'
      ? Object.defineProperty(new Error(hostile), 'category', { get() { reads++; throw new Error('PRIVATE_SYNTHETIC_GETTER') } })
      : kind === 'counterfeit cancellation' ? { category: 'cancelled', message: hostile } : new DOMException(hostile, 'AbortError')
    const result = await run({ transport: async () => json(message()), now: () => { throw error } })
    expect(result).toMatchObject({ status: 'failed', data: { providerError: { failurePhase: 'processing', category: 'protocol', status: 200, requestAccepted: true } } })
    expect(reads).toBe(0)
    expect(JSON.stringify(result)).not.toContain('PRIVATE_')
  })
  it('preserves the primary boundary when error observation throws', async () => {
    const result = await run({ transport: async () => throwHostile(), onObservation: throwHostile })
    expect(result).toMatchObject({ status: 'failed', data: { providerError: { failurePhase: 'transport', category: 'unknown' } } })
    expect(JSON.stringify(result)).not.toContain(hostile)
  })
  it('preserves the primary loop limit when error observation throws', async () => {
    const provider = createAnthropicProvider({ credential: 'synthetic-key',
      toolLoop: { sessionId: 'synthetic-session', turnId: 'synthetic-turn', definitions: [{ id: 'synthetic.tool', name: 'synthetic_tool', description: 'Synthetic', parameters: { type: 'object', properties: {}, additionalProperties: false } }], limits: { maxSteps: 1, maxConcurrentCalls: 1 }, dispatchTool: async () => ({ synthetic: true }) },
      transport: async () => json(message('tool_use', [{ type: 'tool_use', id: 'synthetic-call', name: 'synthetic_tool', input: {} }])),
      onObservation: (observation) => { if (observation.kind === 'error') throwHostile() },
    })
    const result = await provider.create({ selection: { providerId: 'anthropic', model: 'synthetic-model', capabilities: ['local-tools'] }, credential: undefined }).run({ prompt: 'synthetic prompt', workspace })
    expect(result).toMatchObject({ status: 'failed', data: { providerError: { category: 'tool-failure', failurePhase: 'processing', status: 200, requestAccepted: true } } })
    expect(JSON.stringify(result)).not.toContain(hostile)
  })
})
