import { describe, expect, it } from 'vitest'
import { createOpenAIProvider } from '../src/index.ts'
import type { ExecuteToolOptions } from '@brambodev/session'

const workspace = { id: 'workspace-test', rootPath: 'C:/workspace', capabilities: ['read'] } as never

describe('OpenAI Responses provider', () => {
  it('rejects unsupported capabilities even when created without the registry', () => {
    const provider = createOpenAIProvider({ credential: 'sk-test', transport: async () => new Response('{}') })
    expect(() => provider.create({ selection: { providerId: 'openai', model: 'gpt-test', capabilities: ['extended-thinking'] }, credential: undefined })).toThrow()
  })
  it('does not enable streaming through configuration without selection', () => {
    const provider = createOpenAIProvider({ credential: 'sk-test' })
    expect(() => provider.create({ selection: { providerId: 'openai', model: 'gpt-test', configuration: { stream: true } }, credential: undefined })).toThrow()
  })
  it('maps a prompt to Responses and keeps the credential out of returned observations', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = []
    const provider = createOpenAIProvider({
      credential: 'sk-test-secret',
      transport: async (url, init) => {
        requests.push({ url: String(url), init })
        return new Response(JSON.stringify({ id: 'resp-1', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hello' }] }], usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 } }), { status: 200, headers: { 'content-type': 'application/json', 'x-request-id': 'req-1' } })
      },
    })
    const adapter = provider.create({ selection: { providerId: 'openai', model: 'gpt-test' }, credential: undefined })
    const result = await adapter.run({ prompt: 'Read package.json', workspace })
    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe('https://api.openai.com/v1/responses')
    expect(JSON.parse(String(requests[0]?.init.body))).toMatchObject({ model: 'gpt-test', input: [{ role: 'user', content: 'Read package.json' }], store: false })
    expect(result).toMatchObject({ status: 'ok', summary: 'Hello', data: { responseId: 'resp-1', requestId: 'req-1', usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } } })
    expect(JSON.stringify(result)).not.toContain('sk-test-secret')
  })
})


function response(output: unknown[], id = 'resp-1') { return { id, status: 'completed', output, usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6, input_tokens_details: { cached_tokens: 1 } } } }
const strictTool = { name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false } } as const

const enforcement = { version: 1 as const, providerId: 'test-sandbox', enforcement: 'simulated' as const, controls: { filesystem: 'full' as const, network: 'none' as const, process: 'full' as const, resources: 'full' as const } }
const execution = (call: import('@brambodev/adapter-api').ProviderToolCall, signal: AbortSignal, onExecute?: () => void): ExecuteToolOptions => ({
  invocation: { tool: { kind: 'local' as const, argv: ['node'] as [string] }, arguments: [String((call.arguments as { path: string }).path)] },
  context: { cwd: 'C:/workspace', environment: {}, policy: { version: 1 as const, mode: 'workspace-write' as const, workspaceRoot: 'C:/workspace', requiredCapabilities: { filesystem: 'full' as const } }, signal },
  permissionContext: { sessionId: call.correlation.sessionId, turnId: call.correlation.turnId, workspaceId: call.correlation.workspaceId, metadata: { providerRequestId: call.correlation.providerRequestId, providerResponseId: call.correlation.providerResponseId, providerToolCallId: call.id, attempt: call.correlation.attempt, step: call.correlation.step } },
  approveTool: () => true,
  toolExecutor: { execute: async () => { onExecute?.(); return { status: 'ok' as const, stdout: 'contents', stderr: '', exitCode: 0, enforcement } } },
})

describe('OpenAI tool and stream integration', () => {
  it('streams deltas and retains the distinct response and request IDs', async () => {
    const seen: unknown[] = []
    const provider = createOpenAIProvider({ credential: 'sk-test', onEvent: (event) => seen.push(event), transport: async () => new Response('data: {"type":"response.output_text.delta","sequence_number":1,"output_index":0,"content_index":0,"delta":"Hello"}\n\ndata: {"type":"response.completed","sequence_number":2,"response":{"id":"resp-2","status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"Hello"}]}],"usage":{"input_tokens":1,"output_tokens":1}}}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream', 'x-request-id': 'req-2' } }) })
    const adapter = provider.create({ selection: { providerId: 'openai', model: 'gpt-test', capabilities: ['streaming'] }, credential: undefined })
    const result = await adapter.run({ prompt: 'hello', workspace })
    expect(result).toMatchObject({ status: 'ok', summary: 'Hello', data: { responseId: 'resp-2', requestId: 'req-2' } })
    expect(seen).toMatchObject([{ type: 'response.output_text.delta', sequence: 1, delta: 'Hello' }, { type: 'response.completed', sequence: 2 }])
  })

  it('routes function calls through the host boundary and submits call_id output', async () => {
    const requests: unknown[] = []
    const calls: string[] = []
    const provider = createOpenAIProvider({ credential: 'sk-test', toolLoop: {
      definitions: [strictTool], sessionId: 'session-1', turnId: 'turn-1', limits: { maxSteps: 2, maxConcurrentCalls: 1 },
      createExecution: (call, signal) => execution(call, signal, () => calls.push(call.id)),
    }, transport: async (_url, init) => {
      const body = JSON.parse(String(init.body))
      requests.push(body)
      return new Response(JSON.stringify(requests.length === 1 ? response([{ type: 'function_call', id: 'item-1', call_id: 'call-1', name: 'read_file', arguments: '{"path":"package.json"}' }]) : response([{ type: 'message', content: [{ type: 'output_text', text: 'Done' }] }], 'resp-2')), { headers: { 'x-request-id': `req-${requests.length}` } })
    } })
    const adapter = provider.create({ selection: { providerId: 'openai', model: 'gpt-test', capabilities: ['local-tools'] }, credential: undefined })
    const result = await adapter.run({ prompt: 'read file', workspace })
    expect(result.status).toBe('ok')
    expect(calls).toEqual(['call-1'])
    expect(requests[1]).toMatchObject({ input: [expect.anything(), { type: 'function_call', call_id: 'call-1' }, { type: 'function_call_output', call_id: 'call-1', output: expect.stringContaining('contents') }] })
    expect(JSON.stringify(requests[1])).not.toContain('"call_id":"item-1"')
  })

  it('fails malformed arguments before invoking the host and does not retry', async () => {
    let calls = 0; let sends = 0
    const provider = createOpenAIProvider({ credential: 'sk-test', toolLoop: { definitions: [strictTool], sessionId: 'session-1', turnId: 'turn-1', limits: { maxSteps: 2, maxConcurrentCalls: 1 }, createExecution: (call, signal) => execution(call, signal, () => { calls++ }) }, transport: async () => { sends++; return new Response(JSON.stringify(response([{ type: 'function_call', call_id: 'call-1', name: 'read_file', arguments: '{bad' }])), { headers: { 'x-request-id': 'req-1' } }) } })
    const result = await provider.create({ selection: { providerId: 'openai', model: 'gpt-test', capabilities: ['local-tools'] }, credential: undefined }).run({ prompt: 'read', workspace })
    expect(result).toMatchObject({ status: 'failed', errors: [{ code: 'protocol' }] })
    expect(calls).toBe(0)
    expect(sends).toBe(1)
  })

  it('returns cancelled without retrying an aborted in-flight fetch', async () => {
    const controller = new AbortController(); let sends = 0
    const provider = createOpenAIProvider({ credential: 'sk-test', transport: async (_url, init) => { sends++; return new Promise<Response>((_resolve, reject) => { init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))) }) } })
    const pending = provider.create({ selection: { providerId: 'openai', model: 'gpt-test' }, credential: undefined }).run({ prompt: 'wait', workspace, signal: controller.signal })
    await new Promise((resolve) => setTimeout(resolve, 0)); controller.abort()
    expect(await pending).toMatchObject({ status: 'cancelled' })
    expect(sends).toBe(1)
  })

  it('never starts transport if cancellation occurs while resolving credentials', async () => {
    const controller = new AbortController()
    let releaseCredential!: (value: string) => void
    const credential = new Promise<string>((resolve) => { releaseCredential = resolve })
    let sends = 0
    const provider = createOpenAIProvider({ credential: () => credential, transport: async () => { sends++; return new Response('{}') } })
    const pending = provider.create({ selection: { providerId: 'openai', model: 'gpt-test' }, credential: undefined }).run({ prompt: 'wait', workspace, signal: controller.signal })
    await Promise.resolve()
    controller.abort()
    releaseCredential('sk-test')
    expect((await pending).status).toBe('cancelled')
    await Promise.resolve()
    expect(sends).toBe(0)
  })
})

it('deletes adapter-owned stored responses on dispose with an active cleanup signal', async () => {
  const methods: string[] = []
  const provider = createOpenAIProvider({ credential: 'sk-test', capabilities: { policy: { allowedCapabilities: ['conversation-state'], allowEgress: true, allowRetention: true, allowDeletion: true } }, transport: async (url, init) => {
    methods.push(`${init.method} ${url}`)
    if (init.signal?.aborted) throw new DOMException('aborted', 'AbortError')
    return init.method === 'DELETE' ? new Response('{}') : new Response(JSON.stringify(response([{ type: 'message', content: [{ type: 'output_text', text: 'Done' }] }])))
  } })
  const adapter = provider.create({ selection: { providerId: 'openai', model: 'gpt-test', capabilities: ['conversation-state'] }, credential: undefined })
  expect((await adapter.run({ prompt: 'hello', workspace })).status).toBe('ok')
  await adapter.dispose()
  expect(methods).toEqual(['POST https://api.openai.com/v1/responses', 'DELETE https://api.openai.com/v1/responses/resp-1'])
})

it('keeps the same normalized protocol error and request ID in observations and envelope', async () => {
  const errors: unknown[] = []
  const provider = createOpenAIProvider({ credential: 'sk-test', onObservation: (value) => { if (value.kind === 'error') errors.push(value.value) }, transport: async () => new Response(JSON.stringify(response([{ type: 'function_call', call_id: 'bad', name: 'missing', arguments: '{bad' }])), { headers: { 'x-request-id': 'req-protocol' } }) })
  const result = await provider.create({ selection: { providerId: 'openai', model: 'gpt-test' }, credential: undefined }).run({ prompt: 'read', workspace })
  expect(errors).toContainEqual(expect.objectContaining({ category: 'protocol', requestId: 'req-protocol', message: result.errors?.[0]?.message }))
})

it('rejects duplicate call_id before a second host execution', async () => {
  let sends = 0; let calls = 0; const errors: unknown[] = []
  const provider = createOpenAIProvider({ credential: 'sk-test', onObservation: (observation) => { if (observation.kind === 'error') errors.push(observation.value) }, toolLoop: { definitions: [strictTool], sessionId: 'session-1', turnId: 'turn-1', limits: { maxSteps: 3, maxConcurrentCalls: 1 }, createExecution: (call, signal) => execution(call, signal, () => { calls++ }) }, transport: async () => { sends++; return new Response(JSON.stringify(response([{ type: 'function_call', call_id: 'replay', name: 'read_file', arguments: '{"path":"package.json"}' }], `resp-${sends}`)), { headers: { 'x-request-id': `req-${sends}` } }) } })
  const result = await provider.create({ selection: { providerId: 'openai', model: 'gpt-test', capabilities: ['local-tools'] }, credential: undefined }).run({ prompt: 'read', workspace })
  expect(result).toMatchObject({ status: 'failed', errors: [{ code: 'protocol' }] })
  expect(errors).toContainEqual(expect.objectContaining({ category: 'protocol', requestId: 'req-1' }))
  expect(calls).toBe(1)
  expect(sends).toBe(2)
})

it('submits a denied tool as an error function output without exposing the denial text', async () => {
  const requests: unknown[] = []; let calls = 0
  const provider = createOpenAIProvider({ credential: 'sk-test', toolLoop: { definitions: [strictTool], sessionId: 'session-1', turnId: 'turn-1', limits: { maxSteps: 2, maxConcurrentCalls: 1 }, createExecution: (call, signal) => ({ ...execution(call, signal), toolExecutor: { execute: async () => { calls++; throw new Error('private denial details') } } }) }, transport: async (_url, init) => {
    requests.push(JSON.parse(String(init.body)))
    return new Response(JSON.stringify(requests.length === 1 ? response([{ type: 'function_call', call_id: 'denied', name: 'read_file', arguments: '{"path":"package.json"}' }]) : response([{ type: 'message', content: [{ type: 'output_text', text: 'Recovered' }] }], 'resp-2')))
  } })
  const result = await provider.create({ selection: { providerId: 'openai', model: 'gpt-test', capabilities: ['local-tools'] }, credential: undefined }).run({ prompt: 'read', workspace })
  expect(result.status).toBe('ok')
  expect(calls).toBe(1)
  const submitted = (requests[1] as { input: Array<{ type?: string; output?: string }> }).input.find((item) => item.type === 'function_call_output')
  expect(JSON.parse(submitted?.output ?? '')).toMatchObject({ status: 'error' })
  expect(JSON.stringify(requests[1])).not.toContain('private denial details')
})

it('honors a real Brambo executeTool approval denial before tool execution', async () => {
  let toolExecutions = 0
  const requests: Record<string, unknown>[] = []
  const provider = createOpenAIProvider({ credential: 'sk-test', toolLoop: {
    definitions: [strictTool], sessionId: 'session-1', turnId: 'turn-1', limits: { maxSteps: 2, maxConcurrentCalls: 1 },
    createExecution: (call, signal) => ({
      ...(execution(call, signal) as ExecuteToolOptions),
      approveTool: () => false,
      toolExecutor: { execute: async () => { toolExecutions++; return { status: 'ok' } as never } },
    }),
  }, transport: async (_url, init) => {
    requests.push(JSON.parse(String(init.body)))
    return new Response(JSON.stringify(requests.length === 1 ? response([{ type: 'function_call', call_id: 'denied', name: 'read_file', arguments: '{"path":"package.json"}' }]) : response([{ type: 'message', content: [{ type: 'output_text', text: 'Denied' }] }], 'resp-2')))
  } })
  const result = await provider.create({ selection: { providerId: 'openai', model: 'gpt-test', capabilities: ['local-tools'] }, credential: undefined }).run({ prompt: 'read', workspace })
  expect(result.status).toBe('ok')
  expect(toolExecutions).toBe(0)
  const output = (requests[1]?.input as Array<{ type?: string; output?: string }>).find((item) => item.type === 'function_call_output')
  expect(JSON.parse(output?.output ?? '')).toMatchObject({ status: 'error' })
})

it('cannot substitute a host callback to bypass Brambo executeTool approval', async () => {
  let bypassCalls = 0
  let sends = 0
  const provider = createOpenAIProvider({ credential: 'sk-test', toolLoop: {
    definitions: [strictTool], sessionId: 'session-1', turnId: 'turn-1', limits: { maxSteps: 2, maxConcurrentCalls: 1 },
    executeTool: async () => { bypassCalls++; return { status: 'ok', stdout: 'bypass', stderr: '' } as never },
    createExecution: (call: import('@brambodev/adapter-api').ProviderToolCall, signal: AbortSignal) => ({ ...execution(call, signal), approveTool: () => false }),
  } as never, transport: async () => { sends++; return new Response(JSON.stringify(sends === 1 ? response([{ type: 'function_call', call_id: 'denied', name: 'read_file', arguments: '{"path":"package.json"}' }]) : response([{ type: 'message', content: [{ type: 'output_text', text: 'Denied' }] }], 'resp-2'))) } })
  const adapter = provider.create({ selection: { providerId: 'openai', model: 'gpt-test', capabilities: ['local-tools'] }, credential: undefined })
  expect((await adapter.run({ prompt: 'read', workspace })).status).toBe('ok')
  expect(bypassCalls).toBe(0)
})

it('preserves usage and rate-limit metadata without inventing cost', async () => {
  const observations: unknown[] = []
  const provider = createOpenAIProvider({ credential: 'sk-test', onObservation: (observation) => observations.push(observation), transport: async () => new Response(JSON.stringify(response([{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }])), { headers: { 'x-request-id': 'req-1', 'x-ratelimit-remaining-requests': '99' } }) })
  const result = await provider.create({ selection: { providerId: 'openai', model: 'gpt-test' }, credential: undefined }).run({ prompt: 'read', workspace })
  expect(result.data).toMatchObject({ usage: { cachedInputTokens: 1, raw: { input_tokens: 4, output_tokens: 2 } }, rateLimits: { 'x-ratelimit-remaining-requests': '99' }, promptCaching: 'provider-managed' })
  expect(JSON.stringify(result)).not.toContain('cost')
  expect(observations).toContainEqual(expect.objectContaining({ kind: 'rate-limit' }))
})

it('keeps retry-after and rate headers on a throttled response without retrying', async () => {
  let sends = 0
  const observations: unknown[] = []
  const provider = createOpenAIProvider({ credential: 'sk-test', onObservation: (value) => observations.push(value), transport: async () => { sends++; return new Response('{}', { status: 429, headers: { 'x-request-id': 'req-rate', 'retry-after': '3', 'x-ratelimit-remaining-requests': '0' } }) } })
  const result = await provider.create({ selection: { providerId: 'openai', model: 'gpt-test' }, credential: undefined }).run({ prompt: 'read', workspace })
  expect(result).toMatchObject({ status: 'failed', data: { requestId: 'req-rate', rateLimits: { 'x-ratelimit-remaining-requests': '0' } } })
  expect(observations).toContainEqual(expect.objectContaining({ kind: 'error', value: expect.objectContaining({ category: 'rate-limit', requestId: 'req-rate', retryAfter: 3 }) }))
  expect(observations).toContainEqual(expect.objectContaining({ kind: 'rate-limit' }))
  expect(sends).toBe(1)
})

it('redacts a credential if provider-controlled usage metadata echoes it', async () => {
  const observations: unknown[] = []
  const provider = createOpenAIProvider({ credential: 'sk-secret', onObservation: (value) => observations.push(value), transport: async () => new Response(JSON.stringify({ ...response([{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }]), usage: { input_tokens: 1, diagnostic: 'sk-secret' } })) })
  const result = await provider.create({ selection: { providerId: 'openai', model: 'gpt-test' }, credential: undefined }).run({ prompt: 'read', workspace })
  expect(JSON.stringify([result, observations])).not.toContain('sk-secret')
})

it('emits gated web search, remote MCP and file input without enabling excluded hosted tools', async () => {
  let body: Record<string, unknown> = {}
  const provider = createOpenAIProvider({ credential: 'sk-test', capabilities: { policy: { allowedCapabilities: ['hosted-web-search', 'remote-mcp', 'provider-files'], allowEgress: true, allowRetention: true, allowDeletion: true }, webSearch: true, remoteMcp: [{ serverLabel: 'docs', serverUrl: 'https://mcp.example.test/service' }], files: [{ fileId: 'file-host' }] }, transport: async (_url, init) => { body = JSON.parse(String(init.body)); return new Response(JSON.stringify(response([{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }]))) } })
  const result = await provider.create({ selection: { providerId: 'openai', model: 'gpt-test', capabilities: ['hosted-web-search', 'remote-mcp', 'provider-files'] }, credential: undefined }).run({ prompt: 'read', workspace })
  expect(result.status).toBe('ok')
  expect(body.tools).toMatchObject([{ type: 'web_search' }, { type: 'mcp', server_label: 'docs', require_approval: 'always' }])
  expect(body.input).toMatchObject([{ role: 'user', content: [{ type: 'input_text', text: 'read' }, { type: 'input_file', file_id: 'file-host' }] }])
  expect(JSON.stringify(body)).not.toMatch(/computer|code_interpreter|background/)
})

it('uploads a provider file only under the file grant and removes the owned file on dispose', async () => {
  const requests: Array<{ method?: string; url: string; body?: RequestInit['body'] }> = []
  const provider = createOpenAIProvider({ credential: 'sk-test', capabilities: { policy: { allowedCapabilities: ['provider-files'], allowEgress: true, allowRetention: true, allowDeletion: true } }, transport: async (url, init) => {
    requests.push({ method: init.method, url, body: init.body })
    return new Response(init.method === 'POST' ? JSON.stringify({ id: 'file-owned' }) : '{}')
  } })
  const adapter = provider.create({ selection: { providerId: 'openai', model: 'gpt-test', capabilities: ['provider-files'] }, credential: undefined })
  expect(await adapter.uploadFile(new Blob(['data']), 'source.txt')).toBe('file-owned')
  expect(requests[0]).toMatchObject({ method: 'POST', url: 'https://api.openai.com/v1/files' })
  expect(requests[0]?.body).toBeInstanceOf(FormData)
  await adapter.dispose()
  expect(requests[1]).toMatchObject({ method: 'DELETE', url: 'https://api.openai.com/v1/files/file-owned' })
})
