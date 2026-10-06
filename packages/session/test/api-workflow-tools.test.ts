import { describe, expect, it, vi } from 'vitest'
import type { JsonObject, ToolCall } from '@brambodev/contracts'
import { createWorkflowToolDispatcher } from '../src/index.ts'
import { options, tool } from './workflow-tools.fixture.ts'

describe('API driver durable workflow tool authorization', () => {
  it('denies a provider call before journal admission or effect execution', async () => {
    const providerCall: ToolCall = { id: 'provider-call-denied', toolId: 'write', arguments: { path: 'protected.ts' } }
    const execute = vi.fn(async () => ({ written: true }))
    const journal = options([tool(execute)])
    const dispatchTool = createWorkflowToolDispatcher({ ...journal, authorize: async () => false })

    await expect(dispatchTool(providerCall, new AbortController().signal)).rejects.toThrow(/authorization/)

    expect(execute).not.toHaveBeenCalled()
    expect(journal.records.size).toBe(0)
  })

  it('reauthorizes the exact provider call and signal before replayable execution', async () => {
    const controller = new AbortController()
    const providerCall: ToolCall = {
      id: 'provider-call-1',
      toolId: 'write',
      arguments: { path: 'src/example.ts' },
    }
    const execute = vi.fn(async (_arguments: JsonObject, signal: AbortSignal) => {
      expect(signal).toBe(controller.signal)
      return { written: true }
    })
    const authorize = vi.fn(async (_principal: unknown, _registeredTool: unknown, call: ToolCall) =>
      call.id === providerCall.id && call.toolId === providerCall.toolId && (call.arguments.path as string) === 'src/example.ts')
    const journal = options([tool(execute)])
    const dispatchTool = createWorkflowToolDispatcher({ ...journal, authorize })

    await expect(dispatchTool(providerCall, controller.signal)).resolves.toEqual({ written: true })
    await expect(dispatchTool(providerCall, controller.signal)).resolves.toEqual({ written: true })

    expect(authorize).toHaveBeenCalledWith(expect.anything(), expect.anything(), providerCall)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(journal.records.get(providerCall.id)).toMatchObject({ payload: JSON.stringify(providerCall), result: { written: true } })
  })

  it('marks uncertain non-idempotent journal admission as terminal instead of a retryable tool error', async () => {
    const execute = vi.fn(async () => ({ written: true }))
    const fixture = options([tool(execute)])
    const dispatchTool = createWorkflowToolDispatcher({
      ...fixture,
      journal: { ...fixture.journal, async begin() { return 'uncertain' as const } },
    })

    await expect(dispatchTool({ id: 'uncertain-call', toolId: 'write', arguments: {} }, new AbortController().signal))
      .rejects.toMatchObject({ name: 'UncertainToolEffectError' })

    expect(execute).not.toHaveBeenCalled()
  })

  it('marks a non-idempotent effect uncertain when journal settlement fails after execution', async () => {
    const execute = vi.fn(async () => ({ written: true }))
    const fixture = options([tool(execute)])
    const dispatchTool = createWorkflowToolDispatcher({
      ...fixture,
      journal: { ...fixture.journal, async finish() { throw new Error('journal settlement unavailable') } },
    })

    await expect(dispatchTool({ id: 'settlement-call', toolId: 'write', arguments: {} }, new AbortController().signal))
      .rejects.toMatchObject({ name: 'UncertainToolEffectError' })

    expect(execute).toHaveBeenCalledTimes(1)
  })
})
