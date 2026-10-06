import { defineStandardSchema } from '@brambodev/contracts'
import type { DriverManifest, DriverRequest, DriverServices, EffectJournal, JsonObject, JsonValue, RegisteredTool, ToolCall } from '@brambodev/contracts'
import { createApiDriverFactory } from '@brambodev/adapter-api'
import { createWorkflowToolDispatcher } from '@brambodev/session'
import { describe, expect, it, vi } from 'vitest'
import { createOpenAIProvider } from '../src/index.ts'

const call: ToolCall = {
  id: 'provider-call-1',
  toolId: 'workspace.read',
  arguments: { path: 'src/example.ts' },
}

function createEffectJournal() {
  const records = new Map<string, { readonly payload: string; result?: JsonValue }>()
  const journal: EffectJournal = {
    async begin(toolCall) {
      const payload = JSON.stringify(toolCall)
      const existing = records.get(toolCall.id)
      if (existing !== undefined) {
        if (existing.payload !== payload) throw new Error('tool call payload conflict')
        return existing.result === undefined ? 'uncertain' : 'completed'
      }
      records.set(toolCall.id, { payload })
      return 'new'
    },
    async result(callId) {
      const result = records.get(callId)?.result
      if (result === undefined) throw new Error('journal result is unavailable')
      return result
    },
    async finish(callId, result) {
      const record = records.get(callId)
      if (record === undefined) throw new Error('journal admission is unavailable')
      record.result = result
    },
  }
  return { journal, records }
}

describe('official API driver durable workflow composition', () => {
  it('runs the OpenAI fixture through API-driver composition and session authorization/journaling', async () => {
    const requestBodies: Record<string, unknown>[] = []
    const dispatches: Array<{ readonly call: ToolCall; readonly signal: AbortSignal }> = []
    const controller = new AbortController()
    const execute = vi.fn(async (argumentsValue: JsonObject, signal: AbortSignal): Promise<JsonValue> => {
      expect(signal).toBeInstanceOf(AbortSignal)
      return { path: String(argumentsValue['path']), contents: 'fixture contents' }
    })
    const authorize = vi.fn(async (_principal: unknown, _tool: RegisteredTool, received: ToolCall) =>
      received.id === call.id && received.toolId === call.toolId && received.arguments['path'] === call.arguments['path'])
    const tool: RegisteredTool = {
      id: call.toolId,
      effect: 'non-idempotent',
      inputSchema: defineStandardSchema<JsonObject>((value) => {
        if (value === null || typeof value !== 'object') {
          return { issues: [{ message: 'path is required' }] }
        }
        const record = value as Record<string, unknown>
        if (typeof record['path'] !== 'string') return { issues: [{ message: 'path is required' }] }
        return { value: { path: record['path'] } }
      }),
      execute,
    }
    const { journal, records } = createEffectJournal()
    const sessionDispatcher = createWorkflowToolDispatcher({
      principal: { namespace: 'tenant', subject: 'alice' },
      key: { namespace: 'tenant', runId: 'run-1' },
      taskId: 'task-1',
      tools: [tool],
      authorize,
      resolveSecret: async () => 'unused-secret',
      journal,
    })
    const services: DriverServices = {
      dispatchTool: async (received, signal) => {
        dispatches.push({ call: received, signal })
        return sessionDispatcher(received, signal)
      },
      resolveSecret: async () => 'unused-secret',
    }
    const manifest: DriverManifest = {
      id: 'openai-fixture-driver',
      version: '1.0.0',
      kind: 'api',
      capabilities: ['context-reconstruction'],
      configurationSchema: defineStandardSchema<unknown>((value) => ({ value })),
    }
    const factory = createApiDriverFactory({
      manifest,
      createAdapter: (_configuration, injectedServices) => createOpenAIProvider({
        credential: 'fixture-token',
        toolLoop: {
          definitions: [{
            id: call.toolId,
            name: 'read_file',
            description: 'Read a workspace file',
            parameters: {
              type: 'object',
              properties: { path: { type: 'string' } },
              required: ['path'],
              additionalProperties: false,
            },
          }],
          sessionId: 'session-1',
          turnId: 'task-1',
          limits: { maxSteps: 2, maxConcurrentCalls: 1 },
          dispatchTool: injectedServices.dispatchTool,
        },
        transport: async (_url, init) => {
          const body = JSON.parse(String(init.body)) as Record<string, unknown>
          requestBodies.push(body)
          const isToolTurn = requestBodies.length % 2 === 1
          const output = isToolTurn
            ? [{ type: 'function_call', id: `item-${requestBodies.length}`, call_id: call.id, name: 'read_file', arguments: JSON.stringify(call.arguments) }]
            : [{ type: 'message', content: [{ type: 'output_text', text: 'Workflow completed' }] }]
          return new Response(JSON.stringify({
            id: `response-${requestBodies.length}`,
            status: 'completed',
            output,
            usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 },
          }), { status: 200, headers: { 'content-type': 'application/json', 'x-request-id': `request-${requestBodies.length}` } })
        },
      }).create({
        selection: { providerId: 'openai', model: 'fixture-model', capabilities: ['local-tools'] },
        credential: undefined,
      }),
    })
    const driver = await factory.create({ profile: 'fixture' }, services)
    const request: DriverRequest = {
      key: { namespace: 'tenant', runId: 'run-1' },
      sessionId: 'session-1',
      taskId: 'task-1',
      prompt: 'Read src/example.ts',
      workspace: { id: 'workspace-1', rootPath: 'C:/workspace', capabilities: ['read', 'write'] },
      context: null,
      continuation: 'fresh',
      signal: controller.signal,
    }

    const first = await driver.run(request)
    const replay = await driver.run(request)

    expect(first.result).toMatchObject({ status: 'ok', summary: 'Workflow completed' })
    expect(replay.result).toMatchObject({ status: 'ok', summary: 'Workflow completed' })
    expect(dispatches).toHaveLength(2)
    expect(dispatches[0]).toMatchObject({ call })
    expect(dispatches[0]?.signal).toBeInstanceOf(AbortSignal)
    expect(dispatches[0]?.signal.aborted).toBe(false)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0]?.[1]).toBe(dispatches[0]?.signal)
    expect(authorize).toHaveBeenCalled()
    expect(authorize.mock.calls.every(([, , authorizedCall]) =>
      authorizedCall.id === call.id && authorizedCall.toolId === call.toolId && authorizedCall.arguments['path'] === call.arguments['path']))
      .toBe(true)
    const journalRecord = records.get(call.id)
    expect(journalRecord).toEqual({ payload: JSON.stringify(call), result: { path: 'src/example.ts', contents: 'fixture contents' } })
    const serializedJournaledResult = JSON.stringify(journalRecord?.result)
    expect(requestBodies[1]).toMatchObject({
      input: expect.arrayContaining([expect.objectContaining({ type: 'function_call_output', call_id: call.id })]),
    })
    expect(requestBodies[3]).toMatchObject({
      input: expect.arrayContaining([expect.objectContaining({
        type: 'function_call_output',
        call_id: call.id,
        output: serializedJournaledResult,
      })]),
    })
  })

  it('stops before asking OpenAI to retry a non-idempotent effect with a new call ID when journal settlement fails', async () => {
    const requestBodies: Record<string, unknown>[] = []
    const executions = vi.fn(async () => ({ written: true }))
    const tool: RegisteredTool = {
      id: 'workspace.write',
      effect: 'non-idempotent',
      inputSchema: defineStandardSchema<JsonObject>((value) => value !== null && typeof value === 'object' && !Array.isArray(value)
        ? { value: value as JsonObject }
        : { issues: [{ message: 'arguments must be an object' }] }),
      execute: executions,
    }
    const journal: EffectJournal = {
      async begin() { return 'new' },
      async result() { throw new Error('unexpected result lookup') },
      async finish() { throw new Error('journal settlement unavailable') },
    }
    const dispatchTool = createWorkflowToolDispatcher({
      principal: { namespace: 'tenant', subject: 'alice' },
      key: { namespace: 'tenant', runId: 'run-1' },
      taskId: 'task-1',
      tools: [tool],
      authorize: async () => true,
      resolveSecret: async () => 'unused-secret',
      journal,
    })
    const provider = createOpenAIProvider({
      credential: 'fixture-token',
      toolLoop: {
        definitions: [{
          id: tool.id,
          name: 'write_file',
          description: 'Write a workspace file',
          parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
        }],
        sessionId: 'session-1',
        turnId: 'task-1',
        limits: { maxSteps: 2, maxConcurrentCalls: 1 },
        dispatchTool,
      },
      transport: async (_url, init) => {
        requestBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>)
        const id = requestBodies.length
        return new Response(JSON.stringify({
          id: `response-${id}`,
          status: 'completed',
          output: [{ type: 'function_call', id: `item-${id}`, call_id: `provider-call-${id}`, name: 'write_file', arguments: '{"path":"output.txt"}' }],
          usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 },
        }), { status: 200, headers: { 'content-type': 'application/json', 'x-request-id': `request-${id}` } })
      },
    })

    await provider.create({ selection: { providerId: 'openai', model: 'fixture-model', capabilities: ['local-tools'] }, credential: undefined })
      .run({ prompt: 'Write output.txt', workspace: { id: 'workspace-1', rootPath: 'C:/workspace', capabilities: ['read', 'write'] } })

    expect(requestBodies).toHaveLength(1)
    expect(executions).toHaveBeenCalledTimes(1)
  })
})
