import { defineExecutorProviderConformance } from '@brambodev/adapter-api/testing'
import type { ExecutorProviderConformanceCase, ExecutorProviderConformanceObservation } from '@brambodev/adapter-api/testing'
import type { ExecutorProvider, ExecutorProviderCreateOptions, ResultEnvelope, RunRequest } from '@brambodev/contracts'
import type { ExecuteToolOptions } from '@brambodev/session'
import type { ProviderToolCall } from '@brambodev/adapter-api'
import { createOpenAIProvider, OPENAI_EXECUTOR_MANIFEST } from '../src/index.ts'

const workspace = { id: 'workspace-1', rootPath: 'C:/workspace', capabilities: ['read'] as const }
const tool = { name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false } } as const
const enforcement = { version: 1 as const, providerId: 'test-sandbox', enforcement: 'simulated' as const, controls: { filesystem: 'full' as const, network: 'none' as const, process: 'full' as const, resources: 'full' as const } }
const output = (text: string) => [{ type: 'message', content: [{ type: 'output_text', text }] }]
const call = (id: string, argumentsValue = '{"path":"package.json"}') => ({ type: 'function_call', call_id: id, name: 'read_file', arguments: argumentsValue })
const response = (items: unknown[], id = 'resp-1') => ({ id, status: 'completed', output: items })

type Scenario = 'success' | 'failure' | 'cancellation' | 'deniedTool' | 'malformedTool' | 'duplicateTool' | 'boundedTool' | 'orderedTools' | 'cleanup'
interface State extends ExecutorProviderConformanceObservation { sends: number; calls: Array<{ id: string; sessionId: string; turnId: string; workspaceId: string; attempt: number; step: number; providerRequestId?: string }>; outcomes: string[]; removed: string[]; providerErrors: unknown[]; providerResults: Array<{ callId: string; kind: string }> }
const states = new Map<Scenario, State>()
const fresh = (): State => ({ sends: 0, calls: [], outcomes: [], removed: [], providerErrors: [], providerResults: [] })

function scenario(name: Scenario, capabilities: readonly ('local-tools' | 'conversation-state')[] = []): ExecutorProviderConformanceCase {
  const state = fresh()
  states.set(name, state)
  const controller = new AbortController()
  return {
    createOptions: { selection: { providerId: 'openai', model: 'gpt-test', capabilities, ...(name === 'cleanup' ? { configuration: { previousResponseId: 'resp-host' } } : {}) }, credential: name },
    runRequest: { prompt: 'Read package.json', workspace, ...(name === 'cancellation' ? { signal: controller.signal } : {}) },
    observations: () => state,
    ...(name === 'cancellation' ? { abort: () => controller.abort() } : {}),
    ...(['malformedTool', 'duplicateTool', 'boundedTool'].includes(name) ? { requestId: 'req-1' } : {}),
    ...(name === 'cleanup' ? { owned: ['resp-owned'], observed: ['resp-host'] } : {}),
  }
}

const provider: ExecutorProvider = {
  manifest: OPENAI_EXECUTOR_MANIFEST,
  create(options: ExecutorProviderCreateOptions) {
    const name = options.credential as Scenario
    const state = states.get(name)!
    const host = options.selection.capabilities?.includes('local-tools') ? {
      definitions: [tool], sessionId: 'session-1', turnId: 'turn-1', limits: { maxSteps: name === 'boundedTool' ? 1 : 3, maxConcurrentCalls: 1 },
      createExecution: (toolCall: ProviderToolCall, signal: AbortSignal): ExecuteToolOptions => {
        state.calls.push({ id: toolCall.id, sessionId: toolCall.correlation.sessionId, turnId: toolCall.correlation.turnId, workspaceId: toolCall.correlation.workspaceId, attempt: toolCall.correlation.attempt, step: toolCall.correlation.step, providerRequestId: toolCall.correlation.providerRequestId })
        return {
          invocation: { tool: { kind: 'local', argv: ['node'] }, arguments: ['package.json'] },
          context: { cwd: 'C:/workspace', environment: {}, policy: { version: 1, mode: 'workspace-write', workspaceRoot: 'C:/workspace', requiredCapabilities: { filesystem: 'full' } }, signal },
          permissionContext: { sessionId: toolCall.correlation.sessionId, turnId: toolCall.correlation.turnId, workspaceId: toolCall.correlation.workspaceId, metadata: { providerRequestId: toolCall.correlation.providerRequestId, providerResponseId: toolCall.correlation.providerResponseId, providerToolCallId: toolCall.id, attempt: toolCall.correlation.attempt, step: toolCall.correlation.step } },
          approveTool: () => { if (name === 'deniedTool') { state.outcomes.push('error'); return false }; return true },
          toolExecutor: { execute: async () => { state.outcomes.push('result'); return { status: 'ok' as const, stdout: 'ok', stderr: '', exitCode: 0, enforcement } } },
        }
      },
    } : undefined
    const transport = async (url: string, init: RequestInit): Promise<Response> => {
      state.sends++
      if (name === 'cancellation') return new Promise<Response>((_resolve, reject) => { init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))) })
      if (init.method === 'DELETE') { state.removed.push(url.split('/').at(-1)!); return new Response('{}') }
      if (name === 'failure') return new Response(JSON.stringify({ error: { message: 'sk-secret' } }), { status: 401, headers: { 'x-request-id': 'req-1' } })
      const body = JSON.parse(String(init.body)) as { input: Array<{ type?: string; call_id?: string; output?: string }> }
      for (const item of body.input ?? []) if (item.type === 'function_call_output') {
        const parsed = JSON.parse(item.output ?? '{}') as { status: string }
        state.providerResults.push({ callId: item.call_id ?? '', kind: parsed.status === 'error' ? 'error' : 'result' })
      }
      const first = state.sends === 1
      let items: unknown[] = output('done')
      if (name === 'deniedTool' && first) items = [call('denied')]
      if (name === 'malformedTool') items = [call('invalid', '{bad')]
      if (name === 'duplicateTool' || name === 'boundedTool') items = [call('replay')]
      if (name === 'orderedTools' && first) items = [call('first'), call('second')]
      return new Response(JSON.stringify(response(items, name === 'cleanup' ? 'resp-owned' : `resp-${state.sends}`)), { headers: { 'x-request-id': `req-${state.sends}` } })
    }
    const actual = createOpenAIProvider({
      credential: 'sk-secret', transport, toolLoop: host,
      onObservation: (observation) => { if (observation.kind === 'error') state.providerErrors.push(observation.value) },
      capabilities: { policy: { allowedCapabilities: ['conversation-state'], allowEgress: true, allowRetention: true, allowDeletion: true } },
    }).create({ ...options, credential: 'sk-secret' })
    if (name !== 'cleanup') return actual
    return { async run(request: RunRequest): Promise<ResultEnvelope> { const result = await actual.run(request); await actual.dispose(); return result } }
  },
}

const cancellation = scenario('cancellation')
const cleanup = scenario('cleanup', ['conversation-state'])
defineExecutorProviderConformance({
  name: 'OpenAI Responses', provider, fixtures: {
    success: scenario('success'), failure: scenario('failure'),
    cancellation: cancellation as typeof cancellation & { abort: () => void },
    deniedTool: scenario('deniedTool', ['local-tools']),
    malformedTool: scenario('malformedTool', ['local-tools']) as never,
    duplicateTool: scenario('duplicateTool', ['local-tools']) as never,
    boundedTool: scenario('boundedTool', ['local-tools']) as never,
    orderedTools: scenario('orderedTools', ['local-tools']),
    cleanup: cleanup as typeof cleanup & { owned: string[]; observed: string[] },
    secret: 'sk-secret',
  },
})
