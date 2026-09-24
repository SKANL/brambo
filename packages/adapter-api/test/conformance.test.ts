import { defineStandardSchema } from '@brambodev/contracts'
import type { ExecutorAdapter, ExecutorProvider, ExecutorProviderCreateOptions, ResultEnvelope, RunRequest } from '@brambodev/contracts'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { defineExecutorProviderConformance } from '@brambodev/adapter-api/testing'
import { createRemoteResourceLedger } from '../src/remote-capability.ts'
import { runLocalToolLoop } from '../src/tool-loop.ts'
import type { LocalToolLoopOptions, ProviderToolCall } from '../src/types.ts'
import type { ExecuteToolOptions } from '@brambodev/session'

const createOptions: ExecutorProviderCreateOptions = {
  selection: { providerId: 'fake', model: 'fake-model' },
  credential: { kind: 'test' },
}

const runRequest: RunRequest = {
  prompt: 'inspect the adapter',
  workspace: { id: 'workspace-1', rootPath: '/workspace', capabilities: ['read'] },
}

function envelope(status: ResultEnvelope['status']): ResultEnvelope {
  return status === 'ok'
    ? { status, data: null, summary: 'complete' }
    : { status, data: null, summary: status, errors: [{ message: status }] }
}

function fakeProvider(): ExecutorProvider {
  return {
    manifest: {
      id: 'fake',
      displayName: 'Fake API',
      contractVersion: '1',
      packageName: '@test/fake',
      capabilities: ['streaming', 'local-tools'],
      configurationSchema: defineStandardSchema((value) => ({ value })),
    },
    create: vi.fn(() => ({ run: vi.fn(async () => envelope('ok')) }) as ExecutorAdapter),
  }
}

function toolCall(id: string, validateArguments: ProviderToolCall['validateArguments'] = () => undefined): ProviderToolCall {
  return {
    id,
    arguments: { path: 'index.ts' },
    validateArguments,
    concurrencySafe: false,
    correlation: { sessionId: 'session-1', turnId: 'turn-1', workspaceId: 'workspace-1', attempt: 1, step: 1 },
  }
}

function toolLoopOptions(next: LocalToolLoopOptions<number>['next'], executeTool: LocalToolLoopOptions<number>['executeTool']): LocalToolLoopOptions<number> {
  return {
    state: 0,
    signal: new AbortController().signal,
    limits: { maxSteps: 1, maxConcurrentCalls: 1 },
    next,
    executeTool,
    encodeResult: (call, outcome) => ({ callId: call.id, output: outcome.kind }),
    createExecution: (call, signal) => ({
      invocation: { tool: { kind: 'local', argv: ['node'] }, arguments: [call.id] },
      context: { cwd: '/workspace', environment: {}, policy: { version: 1, mode: 'workspace-write', workspaceRoot: '/workspace', requiredCapabilities: {} }, signal },
      permissionContext: {
        sessionId: call.correlation.sessionId,
        turnId: call.correlation.turnId,
        workspaceId: call.correlation.workspaceId,
        metadata: { providerToolCallId: call.id, attempt: call.correlation.attempt, step: call.correlation.step },
      },
      approveTool: () => true,
      toolExecutor: { execute: async () => ({ status: 'ok' } as never) },
    }) satisfies ExecuteToolOptions,
  }
}

async function observeToolLoop(): Promise<{ attempts: number; malformedExecutionAttempts: number; duplicateExecutionAttempts: number; status: 'max-steps' }> {
  let attempts = 0
  const executeTool = async () => { attempts += 1; return { status: 'ok' } as never }
  let callNumber = 0
  const bounded = await runLocalToolLoop(toolLoopOptions(async (state) => ({ state, calls: [toolCall(`call-${++callNumber}`)] }), executeTool))

  let malformedExecutionAttempts = 0
  await expect(runLocalToolLoop(toolLoopOptions(async (state) => ({ state, calls: [toolCall('invalid', () => { throw new Error('invalid arguments') })] }), async () => {
    malformedExecutionAttempts += 1
    return { status: 'ok' } as never
  }))).rejects.toThrow(/invalid arguments/)

  let duplicateExecutionAttempts = 0
  await expect(runLocalToolLoop(toolLoopOptions(async (state) => ({ state, calls: [toolCall('replay'), toolCall('replay')] }), async () => {
    duplicateExecutionAttempts += 1
    return { status: 'ok' } as never
  }))).rejects.toThrow(/duplicate tool call/i)

  return { attempts, malformedExecutionAttempts, duplicateExecutionAttempts, status: bounded.status as 'max-steps' }
}

describe('defineExecutorProviderConformance', () => {
  expectTypeOf(defineExecutorProviderConformance).toBeFunction()
  const provider = fakeProvider()
  const successfulAdapter = { run: vi.fn(async () => envelope('ok')) }
  const failedAdapter = { run: vi.fn(async () => envelope('failed')) }
  const cancelledAdapter = { run: vi.fn(async () => envelope('cancelled')) }
  const dispose = async () => {
    const ledger = createRemoteResourceLedger()
    const owned = ['owned-resource']
    const observed = ['host-resource']
    const removed: string[] = []
    ledger.record({ providerId: 'fake', kind: 'file', id: owned[0]!, owner: 'adapter' })
    ledger.observe({ providerId: 'fake', kind: 'file', id: observed[0]!, owner: 'host' })
    await ledger.dispose((resource) => { removed.push(resource.id) })
    return { owned, observed, removed }
  }

  defineExecutorProviderConformance({
    name: 'fake provider',
    provider,
    createOptions,
    runRequest,
    fixtures: {
      successfulAdapter,
      failedAdapter,
      cancelledAdapter,
      toolLoop: observeToolLoop,
      redactedFailure: async () => new Error('authentication failed: [REDACTED]'),
      ownedResourceCleanup: dispose,
      secret: 'sk-test-secret',
    },
  })

  it('uses the caller-supplied options to create the fake provider adapter', () => {
    expect(provider.create).toHaveBeenCalledWith(createOptions)
  })
})
