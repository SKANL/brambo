import { defineStandardSchema } from '@brambodev/contracts'
import type { ExecutorProvider, ExecutorProviderCreateOptions, ResultEnvelope, RunRequest } from '@brambodev/contracts'
import type { ExecuteToolOptions } from '@brambodev/session'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { defineExecutorProviderConformance } from '@brambodev/adapter-api/testing'
import type { ExecutorProviderConformanceSubject } from '@brambodev/adapter-api/testing'
import { createRemoteResourceLedger, normalizeProviderError, runLocalToolLoop } from '@brambodev/adapter-api'
import type { ProviderToolCall } from '@brambodev/adapter-api'

type Scenario = 'success' | 'failure' | 'cancellation' | 'denied' | 'malformed' | 'duplicate' | 'bounded' | 'ordered' | 'cleanup'
interface Trace {
  readonly kind: Scenario
  sends: number
  readonly calls: { id: string; sessionId: string; turnId: string; workspaceId: string; attempt: number; step: number }[]
  readonly outcomes: string[]
  readonly removed: string[]
  readonly providerErrors: unknown[]
}

const request: RunRequest = {
  prompt: 'inspect the adapter',
  workspace: { id: 'workspace-1', rootPath: '/workspace', capabilities: ['read'] },
}
const secret = 'sk-test-secret'
const success: ResultEnvelope = { status: 'ok', data: null, summary: 'complete' }
const failure = (message: string): ResultEnvelope => ({ status: 'failed', data: null, summary: 'failed', errors: [{ message }] })

function call(id: string, step: number, invalid = false): ProviderToolCall {
  return {
    id,
    arguments: { path: 'index.ts' },
    validateArguments: () => { if (invalid) throw new Error('malformed arguments') },
    concurrencySafe: false,
    correlation: { sessionId: 'session-1', turnId: 'turn-1', workspaceId: 'workspace-1', attempt: 1, step },
  }
}

async function runTools(trace: Trace, signal: AbortSignal): Promise<ResultEnvelope> {
  let turn = 0
  try {
    const result = await runLocalToolLoop({
      state: 0,
      signal,
      limits: { maxSteps: trace.kind === 'duplicate' ? 2 : 1, maxConcurrentCalls: 1 },
      next: async (state) => {
        turn += 1
        if ((trace.kind === 'denied' || trace.kind === 'ordered') && turn > 1) return { state, complete: true }
        if (trace.kind === 'ordered') return { state, calls: [call('first', turn), call('second', turn)] }
        if (trace.kind === 'duplicate' && turn > 1) return { state, calls: [call('replay', turn)] }
        if (trace.kind === 'duplicate') return { state, calls: [call('replay', turn)] }
        if (trace.kind === 'malformed') return { state, calls: [call('malformed', turn, true)] }
        return { state, calls: [call(`call-${turn}`, turn)] }
      },
      executeTool: async (options) => {
        const metadata = options.permissionContext?.metadata
        trace.calls.push({
          id: String(metadata?.providerToolCallId),
          sessionId: String(options.permissionContext?.sessionId),
          turnId: String(options.permissionContext?.turnId),
          workspaceId: String(options.permissionContext?.workspaceId),
          attempt: Number(metadata?.attempt),
          step: Number(metadata?.step),
        })
        if (trace.kind === 'denied') throw new Error('host denied tool')
        return { status: 'ok' } as never
      },
      encodeResult: (toolCall, outcome) => {
        trace.outcomes.push(outcome.kind)
        return { callId: toolCall.id, output: outcome.kind }
      },
      createExecution: (toolCall, abortSignal) => ({
        invocation: { tool: { kind: 'local', argv: ['node'] }, arguments: [toolCall.id] },
        context: { cwd: '/workspace', environment: {}, policy: { version: 1, mode: 'workspace-write', workspaceRoot: '/workspace', requiredCapabilities: {} }, signal: abortSignal },
        permissionContext: {
          sessionId: toolCall.correlation.sessionId,
          turnId: toolCall.correlation.turnId,
          workspaceId: toolCall.correlation.workspaceId,
          metadata: { providerToolCallId: toolCall.id, attempt: toolCall.correlation.attempt, step: toolCall.correlation.step },
        },
        approveTool: () => true,
        toolExecutor: { execute: async () => ({ status: 'ok' } as never) },
      }) satisfies ExecuteToolOptions,
    })
    return result.status === 'completed' ? success : failure(result.status)
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'tool failure')
  }
}

function fakeProvider(): ExecutorProvider {
  return {
    manifest: {
      id: 'fake', displayName: 'Fake API', contractVersion: '1', packageName: '@test/fake',
      capabilities: ['local-tools', 'provider-files'],
      configurationSchema: defineStandardSchema((value) => ({ value })),
    },
    create: vi.fn((options: ExecutorProviderCreateOptions) => ({
      run: async (runRequest: RunRequest): Promise<ResultEnvelope> => {
        const trace = options.transport as Trace
        trace.sends += 1
        if (trace.kind === 'success') return success
        if (trace.kind === 'failure') {
          const normalized = normalizeProviderError({ providerId: 'fake', category: 'authentication', message: `authentication failed: ${secret}`, secrets: [secret] })
          trace.providerErrors.push(normalized)
          return failure(normalized.message)
        }
        if (trace.kind === 'cancellation') {
          await new Promise<void>((resolve) => runRequest.signal?.addEventListener('abort', () => resolve(), { once: true }))
          return { status: 'cancelled', data: null, summary: 'cancelled', errors: [{ message: 'aborted' }] }
        }
        if (trace.kind === 'cleanup') {
          const ledger = createRemoteResourceLedger()
          ledger.record({ providerId: 'fake', kind: 'file', id: 'adapter-owned', owner: 'adapter' })
          ledger.observe({ providerId: 'fake', kind: 'file', id: 'host-owned', owner: 'host' })
          await ledger.dispose((resource) => { trace.removed.push(resource.id) })
          return success
        }
        return runTools(trace, runRequest.signal ?? new AbortController().signal)
      },
    })),
  }
}

function fixture(kind: Scenario) {
  const trace: Trace = { kind, sends: 0, calls: [], outcomes: [], removed: [], providerErrors: [] }
  return {
    createOptions: { selection: { providerId: 'fake', model: 'fake-model' }, credential: { kind: 'test' }, transport: trace },
    runRequest: request,
    observations: () => ({ sends: trace.sends, calls: [...trace.calls], outcomes: [...trace.outcomes], removed: [...trace.removed], providerErrors: [...trace.providerErrors] }),
  }
}

describe('defineExecutorProviderConformance', () => {
  expectTypeOf(defineExecutorProviderConformance).toBeFunction()
  const provider = fakeProvider()
  const cancellation = fixture('cancellation')
  const controller = new AbortController()
  const fixtures = {
    success: fixture('success'),
    failure: fixture('failure'),
    cancellation: { ...cancellation, runRequest: { ...request, signal: controller.signal }, abort: () => controller.abort() },
    deniedTool: fixture('denied'),
    malformedTool: fixture('malformed'),
    duplicateTool: fixture('duplicate'),
    boundedTool: fixture('bounded'),
    orderedTools: fixture('ordered'),
    cleanup: { ...fixture('cleanup'), owned: ['adapter-owned'], observed: ['host-owned'] },
    secret,
  }

  const subject: ExecutorProviderConformanceSubject = { name: 'fake provider', provider, fixtures }
  defineExecutorProviderConformance(subject)

  it('creates the provider adapter for every conformance scenario', () => {
    expect(provider.create).toHaveBeenCalledTimes(9)
  })
})
