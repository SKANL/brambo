import { defineExecutorProviderConformance } from '@brambodev/adapter-api/testing'
import type { ExecutorProviderConformanceCase, ExecutorProviderConformanceObservation } from '@brambodev/adapter-api/testing'
import type { ProviderToolCall } from '@brambodev/adapter-api'
import type { ExecutorProvider, ExecutorProviderCreateOptions, ResultEnvelope, RunRequest } from '@brambodev/contracts'
import type { ExecuteToolOptions } from '@brambodev/session'
import { ANTHROPIC_EXECUTOR_MANIFEST, createAnthropicProvider } from '../src/index.ts'

const workspace = { id: 'workspace-1', rootPath: 'C:/workspace', capabilities: ['read'] as const }
const tool = { name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false } } as const
const enforcement = { version: 1 as const, providerId: 'test-sandbox', enforcement: 'simulated' as const, controls: { filesystem: 'full' as const, network: 'none' as const, process: 'full' as const, resources: 'full' as const } }
const text = (value: string) => [{ type: 'text', text: value }]
const call = (id: string, input: unknown = { path: 'package.json' }) => ({ type: 'tool_use', id, name: 'read_file', input })
const message = (content: unknown[], id = 'msg-1') => ({ id, type: 'message', role: 'assistant', content, stop_reason: content.some((item) => typeof item === 'object' && item !== null && 'type' in item && item.type === 'tool_use') ? 'tool_use' : 'end_turn' })

type Scenario = 'success' | 'failure' | 'cancellation' | 'deniedTool' | 'malformedTool' | 'duplicateTool' | 'boundedTool' | 'orderedTools' | 'cleanup'
interface State extends ExecutorProviderConformanceObservation { sends: number; calls: Array<{ id: string; sessionId: string; turnId: string; workspaceId: string; attempt: number; step: number; providerRequestId?: string }>; outcomes: string[]; removed: string[]; providerErrors: unknown[]; providerResults: Array<{ callId: string; kind: string }> }
const states = new Map<Scenario, State>()
const fresh = (): State => ({ sends: 0, calls: [], outcomes: [], removed: [], providerErrors: [], providerResults: [] })

function scenario(name: Scenario, capabilities: readonly ('local-tools' | 'provider-files')[] = []): ExecutorProviderConformanceCase {
  const state = fresh(); states.set(name, state)
  const controller = new AbortController()
  return { createOptions: { selection: { providerId: 'anthropic', model: 'claude-test', capabilities }, credential: name }, runRequest: { prompt: 'Read package.json', workspace, ...(name === 'cancellation' ? { signal: controller.signal } : {}) }, observations: () => state,
    ...(name === 'cancellation' ? { abort: () => controller.abort() } : {}),
    ...(['malformedTool', 'duplicateTool', 'boundedTool'].includes(name) ? { requestId: 'req-1' } : {}),
    ...(name === 'cleanup' ? { owned: ['file-owned'], observed: ['file-host'] } : {}) }
}

const provider: ExecutorProvider = { manifest: ANTHROPIC_EXECUTOR_MANIFEST, create(options: ExecutorProviderCreateOptions) {
  const name = options.credential as Scenario
  const state = states.get(name)!
  const host = options.selection.capabilities?.includes('local-tools') ? { definitions: [tool], sessionId: 'session-1', turnId: 'turn-1', limits: { maxSteps: name === 'boundedTool' ? 1 : 3, maxConcurrentCalls: 1 },
    createExecution: (toolCall: ProviderToolCall, signal: AbortSignal): ExecuteToolOptions => {
      state.calls.push({ id: toolCall.id, sessionId: toolCall.correlation.sessionId, turnId: toolCall.correlation.turnId, workspaceId: toolCall.correlation.workspaceId, attempt: toolCall.correlation.attempt, step: toolCall.correlation.step, providerRequestId: toolCall.correlation.providerRequestId })
      return { invocation: { tool: { kind: 'local', argv: ['node'] }, arguments: ['package.json'] }, context: { cwd: 'C:/workspace', environment: {}, policy: { version: 1, mode: 'workspace-write', workspaceRoot: 'C:/workspace', requiredCapabilities: { filesystem: 'full' } }, signal },
        permissionContext: { sessionId: toolCall.correlation.sessionId, turnId: toolCall.correlation.turnId, workspaceId: toolCall.correlation.workspaceId, metadata: { providerRequestId: toolCall.correlation.providerRequestId, providerResponseId: toolCall.correlation.providerResponseId, providerToolCallId: toolCall.id, attempt: toolCall.correlation.attempt, step: toolCall.correlation.step } },
        approveTool: () => { if (name === 'deniedTool') { state.outcomes.push('error'); return false }; return true },
        toolExecutor: { execute: async () => { state.outcomes.push('result'); return { status: 'ok' as const, stdout: 'ok', stderr: '', exitCode: 0, enforcement } } },
      }
    } } : undefined
  const transport = async (url: string, init: RequestInit): Promise<Response> => {
    if (init.method === 'DELETE') { state.removed.push(url.split('/').at(-1)!); return new Response('{}') }
    if (url.endsWith('/files')) return new Response(JSON.stringify({ id: 'file-owned', type: 'file' }))
    state.sends++
    if (name === 'cancellation') return new Promise<Response>((_resolve, reject) => { init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))) })
    if (name === 'failure') return new Response(JSON.stringify({ error: { message: 'anthropic-secret' } }), { status: 401, headers: { 'request-id': 'req-1' } })
    const body = JSON.parse(String(init.body)) as { messages: Array<{ content?: Array<{ type?: string; tool_use_id?: string; is_error?: boolean }> }> }
    for (const entry of body.messages ?? []) for (const block of Array.isArray(entry.content) ? entry.content : []) if (block.type === 'tool_result') state.providerResults.push({ callId: block.tool_use_id ?? '', kind: block.is_error ? 'error' : 'result' })
    const first = state.sends === 1
    let content: unknown[] = text('done')
    if (name === 'deniedTool' && first) content = [call('denied')]
    if (name === 'malformedTool') content = [call('invalid', { path: 3 })]
    if (name === 'duplicateTool' || name === 'boundedTool') content = [call('replay')]
    if (name === 'orderedTools' && first) content = [call('first'), call('second')]
    return new Response(JSON.stringify(message(content, `msg-${state.sends}`)), { headers: { 'request-id': `req-${state.sends}` } })
  }
  const actual = createAnthropicProvider({ credential: 'anthropic-secret', transport, toolLoop: host, onObservation: (observation) => { if (observation.kind === 'error') state.providerErrors.push(observation.value) }, capabilities: { policy: { allowedCapabilities: ['provider-files'], allowEgress: true, allowRetention: true, allowDeletion: true }, ...(name === 'cleanup' ? { files: [{ fileId: 'file-host', mediaType: 'application/pdf' }] } : {}) } }).create({ ...options, credential: 'anthropic-secret' })
  if (name !== 'cleanup') return actual
  return { async run(request: RunRequest): Promise<ResultEnvelope> { const result = await actual.run(request); await actual.uploadFile(new Blob(['test']), 'test.txt'); await actual.dispose(); return result } }
} }

defineExecutorProviderConformance({ name: 'Anthropic Messages', provider, fixtures: {
  success: scenario('success'), failure: scenario('failure'),
  cancellation: scenario('cancellation') as never,
  deniedTool: scenario('deniedTool', ['local-tools']),
  malformedTool: scenario('malformedTool', ['local-tools']) as never,
  duplicateTool: scenario('duplicateTool', ['local-tools']) as never,
  boundedTool: scenario('boundedTool', ['local-tools']) as never,
  orderedTools: scenario('orderedTools', ['local-tools']),
  cleanup: scenario('cleanup', ['provider-files']) as never,
  secret: 'anthropic-secret',
} })
