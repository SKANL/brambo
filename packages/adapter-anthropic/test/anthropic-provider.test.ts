import { describe, expect, it } from 'vitest'
import { createAnthropicProvider } from '../src/index.ts'
import type { ProviderToolCall } from '@brambodev/adapter-api'
import type { ExecuteToolOptions } from '@brambodev/session'

const workspace = { id: 'workspace-test', rootPath: 'C:/workspace', capabilities: ['read'] } as never
const tool = { name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false } } as const
const enforcement = { version: 1 as const, providerId: 'test-sandbox', enforcement: 'simulated' as const, controls: { filesystem: 'full' as const, network: 'none' as const, process: 'full' as const, resources: 'full' as const } }
const response = (content: unknown[], id = 'msg-1', stop = 'end_turn') => ({ id, type: 'message', role: 'assistant', model: 'claude-test', content, stop_reason: stop, usage: { input_tokens: 3, output_tokens: 2, cache_read_input_tokens: 1 } })
const createExecution = (call: ProviderToolCall, signal: AbortSignal, onExecute: () => void): ExecuteToolOptions => ({
  invocation: { tool: { kind: 'local', argv: ['node'] }, arguments: [String((call.arguments as { path: string }).path)] },
  context: { cwd: 'C:/workspace', environment: {}, policy: { version: 1, mode: 'workspace-write', workspaceRoot: 'C:/workspace', requiredCapabilities: { filesystem: 'full' } }, signal },
  permissionContext: { sessionId: call.correlation.sessionId, turnId: call.correlation.turnId, workspaceId: call.correlation.workspaceId, metadata: { providerRequestId: call.correlation.providerRequestId, providerResponseId: call.correlation.providerResponseId, providerToolCallId: call.id, attempt: call.correlation.attempt, step: call.correlation.step } },
  approveTool: () => true,
  toolExecutor: { execute: async () => { onExecute(); return { status: 'ok', stdout: 'contents', stderr: '', exitCode: 0, enforcement } } },
})

describe('Anthropic Messages provider', () => {
  it('maps prompt, headers, usage and request ID without leaking credentials', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = []
    const provider = createAnthropicProvider({ credential: 'anthropic-secret', transport: async (url, init) => { requests.push({ url, init }); return new Response(JSON.stringify(response([{ type: 'text', text: 'Hello' }])), { headers: { 'request-id': 'req-1', 'anthropic-ratelimit-requests-remaining': '3' } }) } })
    const result = await provider.create({ selection: { providerId: 'anthropic', model: 'claude-test', configuration: { maxTokens: 256, system: 'Be concise' } }, credential: undefined }).run({ prompt: 'Inspect source', workspace })
    expect(requests[0]?.url).toBe('https://api.anthropic.com/v1/messages')
    expect(JSON.parse(String(requests[0]?.init.body))).toMatchObject({ model: 'claude-test', max_tokens: 256, messages: [{ role: 'user', content: 'Inspect source' }], system: 'Be concise', stream: false })
    expect(new Headers(requests[0]?.init.headers).get('x-api-key')).toBe('anthropic-secret')
    expect(result).toMatchObject({ status: 'ok', summary: 'Hello', data: { requestId: 'req-1', responseId: 'msg-1', usage: { inputTokens: 3, outputTokens: 2, cachedInputTokens: 1 } } })
    expect(JSON.stringify(result)).not.toContain('anthropic-secret')
  })
  it('streams text and incremental tool JSON into a complete final message', async () => {
    const seen: unknown[] = []
    const frames = [
      ['message_start', { type: 'message_start', message: { id: 'msg-s', type: 'message', role: 'assistant', model: 'claude-test', content: [], usage: { input_tokens: 2 } } }],
      ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
      ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } }],
      ['content_block_stop', { type: 'content_block_stop', index: 0 }],
      ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4 } }],
      ['message_stop', { type: 'message_stop' }],
    ].map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('')
    const provider = createAnthropicProvider({ credential: 'secret', onEvent: (event) => seen.push(event), transport: async () => new Response(frames, { headers: { 'request-id': 'req-s' } }) })
    const result = await provider.create({ selection: { providerId: 'anthropic', model: 'claude-test', capabilities: ['streaming'] }, credential: undefined }).run({ prompt: 'Hi', workspace })
    expect(result).toMatchObject({ status: 'ok', summary: 'Hello', data: { responseId: 'msg-s', usage: { inputTokens: 2, outputTokens: 4 } } })
    expect(seen).toContainEqual(expect.objectContaining({ type: 'content_block_delta', delta: 'Hello' }))
  })
  it('routes tool_use through executeTool and submits correlated tool_result', async () => {
    const requests: Record<string, unknown>[] = []; const calls: string[] = []
    const provider = createAnthropicProvider({ credential: 'secret', toolLoop: { definitions: [tool], sessionId: 'session-1', turnId: 'turn-1', limits: { maxSteps: 2, maxConcurrentCalls: 1 }, createExecution: (call, signal) => createExecution(call, signal, () => calls.push(call.id)) }, transport: async (_url, init) => { requests.push(JSON.parse(String(init.body))); return new Response(JSON.stringify(requests.length === 1 ? response([{ type: 'tool_use', id: 'toolu-1', name: 'read_file', input: { path: 'package.json' } }], 'msg-1', 'tool_use') : response([{ type: 'text', text: 'Done' }], 'msg-2')), { headers: { 'request-id': `req-${requests.length}` } }) } })
    const result = await provider.create({ selection: { providerId: 'anthropic', model: 'claude-test', capabilities: ['local-tools'] }, credential: undefined }).run({ prompt: 'Read', workspace })
    expect(result.status).toBe('ok'); expect(calls).toEqual(['toolu-1'])
    expect(requests[1]?.messages).toEqual([{ role: 'user', content: 'Read' }, { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu-1', name: 'read_file', input: { path: 'package.json' } }] }, { role: 'user', content: [expect.objectContaining({ type: 'tool_result', tool_use_id: 'toolu-1', content: expect.stringContaining('contents') })] }])
  })
  it('rejects malformed tool arguments before dispatch', async () => {
    let calls = 0
    const provider = createAnthropicProvider({ credential: 'secret', toolLoop: { definitions: [tool], sessionId: 's', turnId: 't', limits: { maxSteps: 2, maxConcurrentCalls: 1 }, createExecution: (call, signal) => createExecution(call, signal, () => { calls++ }) }, transport: async () => new Response(JSON.stringify(response([{ type: 'tool_use', id: 'bad', name: 'read_file', input: { path: 3 } }], 'msg-1', 'tool_use'))) })
    const result = await provider.create({ selection: { providerId: 'anthropic', model: 'claude-test', capabilities: ['local-tools'] }, credential: undefined }).run({ prompt: 'Read', workspace })
    expect(result).toMatchObject({ status: 'failed' }); expect(calls).toBe(0)
  })
  it('rejects duplicate tool IDs and stops at the configured maximum step', async () => {
    let calls = 0; let sends = 0
    const provider = createAnthropicProvider({ credential: 'secret', toolLoop: { definitions: [tool], sessionId: 's', turnId: 't', limits: { maxSteps: 2, maxConcurrentCalls: 1 }, createExecution: (call, signal) => createExecution(call, signal, () => { calls++ }) }, transport: async () => { sends++; return new Response(JSON.stringify(response([{ type: 'tool_use', id: 'replay', name: 'read_file', input: { path: 'a' } }], `msg-${sends}`, 'tool_use')), { headers: { 'request-id': `req-${sends}` } }) } })
    const result = await provider.create({ selection: { providerId: 'anthropic', model: 'claude-test', capabilities: ['local-tools'] }, credential: undefined }).run({ prompt: 'Read', workspace })
    expect(result).toMatchObject({ status: 'failed', errors: [{ code: 'protocol' }] })
    expect(calls).toBe(1); expect(sends).toBe(2)
    const bounded = createAnthropicProvider({ credential: 'secret', toolLoop: { definitions: [tool], sessionId: 's', turnId: 't', limits: { maxSteps: 1, maxConcurrentCalls: 1 }, createExecution: (call, signal) => createExecution(call, signal, () => undefined) }, transport: async () => new Response(JSON.stringify(response([{ type: 'tool_use', id: 'again', name: 'read_file', input: { path: 'a' } }], 'msg-1', 'tool_use'))) })
    expect(await bounded.create({ selection: { providerId: 'anthropic', model: 'claude-test', capabilities: ['local-tools'] }, credential: undefined }).run({ prompt: 'Read', workspace })).toMatchObject({ status: 'failed', errors: [{ code: 'tool-failure' }] })
  })
  it('returns a provider-valid error result when Brambo approval denies a tool', async () => {
    const sent: Record<string, unknown>[] = []; let executions = 0
    const provider = createAnthropicProvider({ credential: 'secret', toolLoop: { definitions: [tool], sessionId: 's', turnId: 't', limits: { maxSteps: 2, maxConcurrentCalls: 1 }, createExecution: (call, signal) => ({ ...createExecution(call, signal, () => { executions++ }), approveTool: () => false }) }, transport: async (_url, init) => { sent.push(JSON.parse(String(init.body))); return new Response(JSON.stringify(sent.length === 1 ? response([{ type: 'tool_use', id: 'denied', name: 'read_file', input: { path: 'a' } }], 'msg-1', 'tool_use') : response([{ type: 'text', text: 'Denied' }], 'msg-2'))) } })
    const result = await provider.create({ selection: { providerId: 'anthropic', model: 'claude-test', capabilities: ['local-tools'] }, credential: undefined }).run({ prompt: 'Read', workspace })
    expect(result.status).toBe('ok'); expect(executions).toBe(0)
    expect((sent[1]?.messages as Array<{ content: unknown }>)[2]?.content).toEqual([expect.objectContaining({ type: 'tool_result', tool_use_id: 'denied', is_error: true })])
  })
  it('preserves provider call order when multiple tools are returned', async () => {
    const sent: Record<string, unknown>[] = []; const calls: string[] = []
    const provider = createAnthropicProvider({ credential: 'secret', toolLoop: { definitions: [tool], sessionId: 's', turnId: 't', limits: { maxSteps: 2, maxConcurrentCalls: 2 }, createExecution: (call, signal) => createExecution(call, signal, () => calls.push(call.id)) }, transport: async (_url, init) => { sent.push(JSON.parse(String(init.body))); return new Response(JSON.stringify(sent.length === 1 ? response([{ type: 'tool_use', id: 'first', name: 'read_file', input: { path: 'a' } }, { type: 'tool_use', id: 'second', name: 'read_file', input: { path: 'b' } }], 'msg-1', 'tool_use') : response([{ type: 'text', text: 'Done' }], 'msg-2'))) } })
    const result = await provider.create({ selection: { providerId: 'anthropic', model: 'claude-test', capabilities: ['local-tools'] }, credential: undefined }).run({ prompt: 'Read', workspace })
    expect(result.status).toBe('ok'); expect(calls).toEqual(['first', 'second'])
    expect((sent[1]?.messages as Array<{ content: Array<{ tool_use_id?: string }> }>)[2]?.content.map((block) => block.tool_use_id)).toEqual(['first', 'second'])
  })
  it('cancels an in-flight request without retrying', async () => {
    const controller = new AbortController(); let sends = 0
    const provider = createAnthropicProvider({ credential: 'secret', transport: async (_url, init) => { sends++; return new Promise<Response>((_resolve, reject) => { init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))) }) } })
    const pending = provider.create({ selection: { providerId: 'anthropic', model: 'claude-test' }, credential: undefined }).run({ prompt: 'Wait', workspace, signal: controller.signal })
    await new Promise((resolve) => setTimeout(resolve, 0)); controller.abort()
    expect(await pending).toMatchObject({ status: 'cancelled' }); expect(sends).toBe(1)
  })
  it('classifies HTTP failure without exposing the provider body or credential', async () => {
    const observed: unknown[] = []
    const provider = createAnthropicProvider({ credential: 'private-secret', onObservation: (entry) => observed.push(entry), transport: async () => new Response('{"error":{"message":"private-secret"}}', { status: 429, headers: { 'request-id': 'req-rate', 'retry-after': '2' } }) })
    const result = await provider.create({ selection: { providerId: 'anthropic', model: 'claude-test' }, credential: undefined }).run({ prompt: 'Hi', workspace })
    expect(result).toMatchObject({ status: 'failed', errors: [{ code: 'rate-limit' }], data: { requestId: 'req-rate' } })
    expect(JSON.stringify([result, observed])).not.toContain('private-secret')
  })
  it('rejects a malformed stream and a stream-side error event', async () => {
    const provider = createAnthropicProvider({ credential: 'secret', transport: async () => new Response('event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"private"}}\n\n') })
    const result = await provider.create({ selection: { providerId: 'anthropic', model: 'claude-test', capabilities: ['streaming'] }, credential: undefined }).run({ prompt: 'Hi', workspace })
    expect(result).toMatchObject({ status: 'failed', errors: [{ code: 'protocol' }] })
    expect(JSON.stringify(result)).not.toContain('private')
  })
})
