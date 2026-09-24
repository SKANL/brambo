import { describe, expect, it } from 'vitest'
import { createAnthropicProvider } from '../src/index.ts'

const optIn = process.env.BRAMBO_RUN_LIVE_API_TESTS === '1'
const missing = (['OPENAI_API_KEY', 'OPENAI_MODEL', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL'] as const)
  .find((name) => !process.env[name]?.trim())
const maxRequests = Number(process.env.BRAMBO_LIVE_API_MAX_REQUESTS)
const timeoutMs = Number(process.env.BRAMBO_LIVE_API_TIMEOUT_MS)
const bounded = Number.isSafeInteger(maxRequests) && maxRequests >= 2 && maxRequests <= 4 &&
  Number.isSafeInteger(timeoutMs) && timeoutMs >= 1000 && timeoutMs <= 60000
if (optIn && missing !== undefined) throw new Error(`Live API test setup requires ${missing}`)
if (optIn && !bounded) throw new Error('Live API test setup requires bounded request and timeout limits')

describe.skipIf(!optIn)('Anthropic live API (explicit opt-in and credentials)', () => {
  it('streams one bounded local-tool turn through host approval and cleans up', async () => {
    const controller = new AbortController()
    const deadline = setTimeout(() => controller.abort(), timeoutMs)
    let requests = 0; let toolCalls = 0; let toolDispatches = 0; let approvals = 0; let events = 0
    const root = process.cwd()
    const provider = createAnthropicProvider({
      credential: () => process.env.ANTHROPIC_API_KEY!,
      onEvent: () => { events++ },
      transport: (url, init) => {
        if (++requests > maxRequests) throw new Error('live request cap exceeded')
        return fetch(url, init)
      },
      toolLoop: {
        definitions: [{ name: 'lookup_fixture', description: 'Return a harmless local fixture value.', parameters: { type: 'object', properties: {}, additionalProperties: false } }],
        sessionId: 'live-api-test', turnId: 'live-tool-turn', limits: { maxSteps: 2, maxConcurrentCalls: 1 },
        createExecution: (call, signal) => {
          if (++toolDispatches > 1) throw new Error('live tool-call cap exceeded')
          return {
          invocation: { tool: { kind: 'local', argv: ['fixture'] }, arguments: [] },
          context: { cwd: root, environment: {}, policy: { version: 1, mode: 'workspace-write', workspaceRoot: root, requiredCapabilities: { filesystem: 'full' } }, signal },
          permissionContext: { sessionId: call.correlation.sessionId, turnId: call.correlation.turnId, workspaceId: call.correlation.workspaceId, metadata: { providerRequestId: call.correlation.providerRequestId, providerResponseId: call.correlation.providerResponseId, providerToolCallId: call.id, attempt: call.correlation.attempt, step: call.correlation.step } },
          approveTool: () => { approvals++; return true },
          toolExecutor: { execute: async () => { toolCalls++; return { status: 'ok' as const, stdout: 'fixture-ok', stderr: '', exitCode: 0, enforcement: { version: 1 as const, providerId: 'live-fixture', enforcement: 'simulated' as const, controls: { filesystem: 'full' as const, network: 'none' as const, process: 'full' as const, resources: 'full' as const } } } } },
          }
        },
      },
    })
    const adapter = provider.create({ selection: { providerId: 'anthropic', model: process.env.ANTHROPIC_MODEL!, capabilities: ['streaming', 'local-tools'], configuration: { stream: true, maxTokens: 128 } }, credential: undefined })
    try {
      const result = await adapter.run({ prompt: 'Call lookup_fixture once, then answer with its value.', workspace: { id: 'live-workspace', rootPath: root, capabilities: ['read'] } as never, signal: controller.signal })
      expect(result.status).toBe('ok')
      expect(toolCalls).toBe(1)
      expect(approvals).toBe(1)
      expect(requests).toBeGreaterThanOrEqual(2)
      expect(requests).toBeLessThanOrEqual(maxRequests)
      expect(events).toBeGreaterThan(0)
      console.log(`LIVE_EVIDENCE anthropic status=ok requests=${requests} toolCalls=${toolCalls} events=${events}`)
    } finally {
      clearTimeout(deadline)
      await adapter.dispose()
      console.log('LIVE_CLEANUP anthropic adapter=disposed')
    }
  }, 65000)
})
