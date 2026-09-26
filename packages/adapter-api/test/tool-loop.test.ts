import { describe, expect, it, vi } from 'vitest'
import { runLocalToolLoop, type EncodedProviderToolResult, type LocalToolLoopOptions, type ProviderToolCall, type ProviderTurn } from '../src/index.ts'
import type { ExecuteToolOptions } from '@brambodev/session'

interface State { readonly step: number }

const tool = (id: string, options: Partial<ProviderToolCall> = {}): ProviderToolCall => ({
  id,
  arguments: { path: `${id}.ts` },
  concurrencySafe: false,
  validateArguments: () => undefined,
  correlation: {
    providerRequestId: 'provider-request-1',
    providerResponseId: 'provider-response-1',
    sessionId: 'session-1',
    turnId: 'turn-1',
    workspaceId: 'workspace-1',
    attempt: 1,
    step: 1,
  },
  ...options,
})

function turn(state: State, calls: readonly ProviderToolCall[] = [], complete = false): ProviderTurn<State> {
  return { state, calls, complete }
}

function fixture(overrides: Partial<LocalToolLoopOptions<State>> = {}): LocalToolLoopOptions<State> {
  return {
    state: { step: 0 },
    signal: new AbortController().signal,
    limits: { maxSteps: 4, maxConcurrentCalls: 2 },
    next: async (state) => turn(state, [], true),
    executeTool: async () => ({ status: 'ok' } as never),
    encodeResult: (call, outcome): EncodedProviderToolResult => ({
      callId: call.id,
      output: outcome.kind === 'result' ? outcome.result.status : 'error',
    }),
    createExecution: (call, signal) => ({
      invocation: { tool: { kind: 'local', argv: ['node'] }, arguments: [call.id] },
      context: { cwd: '/workspace', environment: {}, policy: { version: 1, mode: 'workspace-write', workspaceRoot: '/workspace', requiredCapabilities: {} }, signal },
      permissionContext: {
        sessionId: call.correlation.sessionId,
        turnId: call.correlation.turnId,
        workspaceId: call.correlation.workspaceId,
        metadata: {
          providerRequestId: call.correlation.providerRequestId,
          providerResponseId: call.correlation.providerResponseId,
          providerToolCallId: call.id,
          attempt: call.correlation.attempt,
          step: call.correlation.step,
        },
      },
      approveTool: () => true,
      toolExecutor: { execute: async () => ({ status: 'ok' } as never) },
    }) satisfies ExecuteToolOptions,
    ...overrides,
  }
}

function oneCallThenFinal(id: string): LocalToolLoopOptions<State>['next'] {
  let calls = 0
  return async (state) => calls++ === 0 ? turn({ step: state.step + 1 }, [tool(id)]) : turn(state, [], true)
}

function duplicateCall(id: string): LocalToolLoopOptions<State>['next'] {
  let calls = 0
  return async (state) => turn({ step: state.step + 1 }, [tool(id)], calls++ > 1)
}

describe('runLocalToolLoop', () => {
  it('uses the supplied executeTool boundary for every provider call', async () => {
    const execute = vi.fn(async () => ({ status: 'ok' } as never))
    const createExecution = vi.fn(fixture().createExecution)

    await runLocalToolLoop(fixture({ executeTool: execute, createExecution, next: oneCallThenFinal('call_1') }))

    expect(execute).toHaveBeenCalledTimes(1)
    expect(createExecution).toHaveBeenCalledWith(expect.objectContaining({ id: 'call_1' }), expect.any(AbortSignal))
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ permissionContext: expect.objectContaining({ metadata: expect.objectContaining({ providerToolCallId: 'call_1' }) }) }))
  })

  it('rejects duplicate provider call IDs before second approval', async () => {
    const execute = vi.fn(async () => ({ status: 'ok' } as never))

    await expect(runLocalToolLoop(fixture({ executeTool: execute, next: duplicateCall('call_1') }))).rejects.toThrow(/duplicate tool call/i)

    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('dispatches no later tool after abort and returns cancelled', async () => {
    const controller = new AbortController()
    const execute = vi.fn(async () => {
      controller.abort()
      return { status: 'ok' } as never
    })

    const result = await runLocalToolLoop(fixture({
      signal: controller.signal,
      executeTool: execute,
      next: async (state) => turn(state, [tool('first'), tool('second')]),
    }))

    expect(result.status).toBe('cancelled')
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('encodes denied tool output once without retry', async () => {
    const denied = new Error('tool invocation was denied by the host')
    const execute = vi.fn(async () => { throw denied })
    const encodeResult = vi.fn(fixture().encodeResult)
    const received: EncodedProviderToolResult[][] = []
    let turns = 0

    await runLocalToolLoop(fixture({
      executeTool: execute,
      encodeResult,
      next: async (state, priorResults) => {
        received.push([...priorResults])
        return turns++ === 0 ? turn(state, [tool('denied')]) : turn(state, [], true)
      },
    }))

    expect(execute).toHaveBeenCalledTimes(1)
    expect(encodeResult).toHaveBeenCalledTimes(1)
    expect(received[1]).toEqual([{ callId: 'denied', output: 'error' }])
  })

  it('fails malformed arguments before approval', async () => {
    const execute = vi.fn(async () => ({ status: 'ok' } as never))

    await expect(runLocalToolLoop(fixture({
      executeTool: execute,
      next: async (state) => turn(state, [tool('valid'), tool('invalid', { validateArguments: () => { throw new Error('malformed arguments') } })]),
    }))).rejects.toThrow(/malformed arguments/i)

    expect(execute).not.toHaveBeenCalled()
  })

  it('stops at maxSteps without dispatching a maxSteps plus one tool', async () => {
    const execute = vi.fn(async () => ({ status: 'ok' } as never))
    let number = 0

    const result = await runLocalToolLoop(fixture({
      limits: { maxSteps: 1, maxConcurrentCalls: 1 },
      executeTool: execute,
      next: async (state) => turn(state, [tool(`call_${++number}`)]),
    }))

    expect(result.status).toBe('max-steps')
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('preserves provider order after requested safe parallel calls', async () => {
    const completions: string[] = []
    const execute = vi.fn(async (options: ExecuteToolOptions) => {
      const id = options.permissionContext?.metadata?.providerToolCallId as string
      await new Promise((resolve) => setTimeout(resolve, id === 'first' ? 10 : 0))
      completions.push(id)
      return { status: 'ok' } as never
    })
    let turns = 0
    let observed: readonly EncodedProviderToolResult[] = []

    await runLocalToolLoop(fixture({
      executeTool: execute,
      next: async (state, results) => {
        observed = results
        return turns++ === 0
          ? { state, calls: [tool('first', { concurrencySafe: true }), tool('second', { concurrencySafe: true })], parallel: true }
          : turn(state, [], true)
      },
    }))

    expect(completions).toEqual(['second', 'first'])
    expect(observed.map((result) => result.callId)).toEqual(['first', 'second'])
  })

  it('rejects an encoded result with an unknown provider call ID', async () => {
    const encodeResult = vi.fn(() => ({ callId: 'unknown', output: 'unexpected' }))

    await expect(runLocalToolLoop(fixture({
      encodeResult,
      next: oneCallThenFinal('known'),
    }))).rejects.toThrow(/result ID/i)

    expect(encodeResult).toHaveBeenCalledTimes(1)
  })

  it('fails closed before local execution when Brambo authorization and approval hooks are absent', async () => {
    const execute = vi.fn(async () => ({ status: 'ok' } as never))
    const createExecution = (call: ProviderToolCall, signal: AbortSignal): ExecuteToolOptions => {
      const execution = fixture().createExecution(call, signal)
      const { approveTool, permissionAuthorizer, ...withoutHooks } = execution
      void approveTool
      void permissionAuthorizer
      return withoutHooks
    }

    await expect(runLocalToolLoop(fixture({ executeTool: execute, createExecution, next: oneCallThenFinal('unapproved') }))).rejects.toThrow(/authorization or approval hook/i)

    expect(execute).not.toHaveBeenCalled()
  })

  it('waits for inflight calls and starts no queued call after a parallel terminal failure', async () => {
    const started: string[] = []
    let releaseSecond!: () => void
    const secondStarted = new Promise<void>((resolve) => { releaseSecond = resolve })
    let releaseExecution!: () => void
    const waitForSecond = new Promise<void>((resolve) => { releaseExecution = resolve })
    const execute = vi.fn(async (execution: ExecuteToolOptions) => {
      const id = execution.permissionContext?.metadata?.providerToolCallId as string
      started.push(id)
      if (id === 'second') {
        releaseSecond()
        await waitForSecond
      }
      return { status: 'ok' } as never
    })
    const encodeResult = vi.fn((call: ProviderToolCall, outcome: unknown): EncodedProviderToolResult => {
      if (call.id === 'first') throw new Error('terminal encoder failure')
      return fixture().encodeResult(call, outcome as never)
    })
    const loop = runLocalToolLoop(fixture({
      executeTool: execute,
      encodeResult,
      next: async (state) => ({ state, calls: [tool('first', { concurrencySafe: true }), tool('second', { concurrencySafe: true }), tool('third', { concurrencySafe: true })], parallel: true }),
    }))

    await secondStarted
    releaseExecution()
    await expect(loop).rejects.toThrow(/terminal encoder failure/i)

    expect(started).toEqual(expect.arrayContaining(['first', 'second']))
    expect(started).not.toContain('third')
  })

  it('executes an immutable provider-call snapshot after asynchronous validation', async () => {
    let releaseValidation!: () => void
    const validationStarted = new Promise<void>((resolve) => { releaseValidation = resolve })
    let continueValidation!: () => void
    const validationGate = new Promise<void>((resolve) => { continueValidation = resolve })
    const sourceCall = tool('captured', {
      arguments: { path: 'original.ts' },
      validateArguments: async () => {
        releaseValidation()
        await validationGate
      },
    })
    const createExecution = vi.fn(fixture().createExecution)
    const loop = runLocalToolLoop(fixture({
      createExecution,
      next: (() => {
        let turns = 0
        return async (state: State) => turns++ === 0 ? turn(state, [sourceCall]) : turn(state, [], true)
      })(),
    }))

    await validationStarted
    Object.assign(sourceCall as unknown as Record<string, unknown>, { id: 'mutated', arguments: { path: 'mutated.ts' } })
    continueValidation()
    const result = await loop

    expect(result.results).toEqual([{ callId: 'captured', output: 'ok' }])
    expect(createExecution).toHaveBeenCalledWith(expect.objectContaining({ id: 'captured', arguments: { path: 'original.ts' } }), expect.any(AbortSignal))
  })

  it('awaits asynchronous validators and fails before approval when they reject', async () => {
    const execute = vi.fn(async () => ({ status: 'ok' } as never))

    await expect(runLocalToolLoop(fixture({
      executeTool: execute,
      next: async (state) => turn(state, [tool('async-invalid', { validateArguments: async () => { throw new Error('async malformed arguments') } })]),
    }))).rejects.toThrow(/async malformed arguments/i)

    expect(execute).not.toHaveBeenCalled()
  })

  it('requires the captured execution correlation context before approval', async () => {
    const execute = vi.fn(async () => ({ status: 'ok' } as never))
    const createExecution = (call: ProviderToolCall, signal: AbortSignal): ExecuteToolOptions => ({
      ...fixture().createExecution(call, signal),
      permissionContext: { metadata: { providerToolCallId: 'wrong-id' } },
    })

    await expect(runLocalToolLoop(fixture({ executeTool: execute, createExecution, next: oneCallThenFinal('correlated') }))).rejects.toThrow(/correlation context/i)

    expect(execute).not.toHaveBeenCalled()
  })

})
