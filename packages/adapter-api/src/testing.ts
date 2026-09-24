import { validateApiProviderError, validateEnvelope, validateExecutorManifest } from '@brambodev/contracts'
import type { ExecutorProvider, ExecutorProviderCreateOptions, ResultEnvelope, RunRequest } from '@brambodev/contracts'
import { describe, expect, it } from 'vitest'
import { assertCleanup, assertDeniedToolOutcome, assertRedactedFailure, assertToolFailure } from './conformance-assertions.ts'

/** Captured at the host tool boundary, not synthesized from provider output. */
export interface ExecutorProviderConformanceToolCall {
  readonly id: string
  readonly sessionId: string
  readonly turnId: string
  readonly workspaceId: string
  readonly attempt: number
  readonly step: number
  readonly providerRequestId?: string
}

/** Effects observed by an injected fake transport, host tool, or cleanup handler. */
export interface ExecutorProviderConformanceObservation {
  readonly sends: number
  readonly calls: readonly ExecutorProviderConformanceToolCall[]
  readonly outcomes: readonly string[]
  readonly removed: readonly string[]
  readonly providerErrors: readonly unknown[]
  readonly providerResults: readonly { readonly callId: string; readonly kind: string }[]
}

/** Every scenario creates and runs a fresh adapter from the subject provider. */
export interface ExecutorProviderConformanceCase {
  readonly createOptions: ExecutorProviderCreateOptions
  readonly runRequest: RunRequest
  readonly observations: () => ExecutorProviderConformanceObservation
}

export interface ExecutorProviderConformanceCancellationCase extends ExecutorProviderConformanceCase {
  /** Abort the exact signal supplied in runRequest after run() has started. */
  readonly abort: () => void
}

export interface ExecutorProviderConformanceCleanupCase extends ExecutorProviderConformanceCase {
  readonly owned: readonly string[]
  readonly observed: readonly string[]
}

export interface ExecutorProviderConformanceToolFailureCase extends ExecutorProviderConformanceCase {
  /** Provider request ID captured from the malformed, duplicate, or bounded turn. */
  readonly requestId: string
}

export interface ExecutorProviderConformanceFixtures {
  readonly success: ExecutorProviderConformanceCase
  readonly failure: ExecutorProviderConformanceCase
  readonly cancellation: ExecutorProviderConformanceCancellationCase
  readonly deniedTool: ExecutorProviderConformanceCase
  readonly malformedTool: ExecutorProviderConformanceToolFailureCase
  readonly duplicateTool: ExecutorProviderConformanceToolFailureCase
  readonly boundedTool: ExecutorProviderConformanceToolFailureCase
  readonly orderedTools: ExecutorProviderConformanceCase
  readonly cleanup: ExecutorProviderConformanceCleanupCase
  /** A non-empty sentinel credential placed in the failure scenario's injected transport. */
  readonly secret: string
}

export interface ExecutorProviderConformanceSubject {
  readonly name: string
  readonly provider: ExecutorProvider
  readonly fixtures: ExecutorProviderConformanceFixtures
}

function runCase(subject: ExecutorProviderConformanceSubject, scenario: ExecutorProviderConformanceCase): Promise<ResultEnvelope> {
  return subject.provider.create(scenario.createOptions).run(scenario.runRequest)
}

function expectOneSend(scenario: ExecutorProviderConformanceCase): void {
  expect(scenario.observations().sends).toBe(1)
}

/**
 * Runs provider-created adapters against deterministic, instrumented scenarios.
 * Consumers inject fake transport and host boundaries into createOptions; the
 * suite never accepts a pre-built adapter or a pre-computed result envelope.
 */
export function defineExecutorProviderConformance(subject: ExecutorProviderConformanceSubject): void {
  describe(`ExecutorProvider conformance: ${subject.name}`, () => {
    it('publishes a valid manifest and returns a valid success envelope', async () => {
      expect(subject.name).not.toHaveLength(0)
      validateExecutorManifest(subject.provider.manifest)
      expect(validateEnvelope(await runCase(subject, subject.fixtures.success)).status).toBe('ok')
      expectOneSend(subject.fixtures.success)
    })

    it('returns a non-empty, normalized, redacted failure envelope', async () => {
      const result = validateEnvelope(await runCase(subject, subject.fixtures.failure))
      expect(result.status).toBe('failed')
      expect(result.errors?.length).toBeGreaterThan(0)
      assertRedactedFailure(result, subject.fixtures.secret)
      const normalizedErrors = subject.fixtures.failure.observations().providerErrors
      expect(normalizedErrors.length).toBeGreaterThan(0)
      for (const error of normalizedErrors) {
        validateApiProviderError(error)
        assertRedactedFailure(error, subject.fixtures.secret)
      }
      expectOneSend(subject.fixtures.failure)
    })

    it('propagates a real abort and does not send again afterward', async () => {
      const scenario = subject.fixtures.cancellation
      expect(scenario.runRequest.signal).toBeInstanceOf(AbortSignal)
      const pending = runCase(subject, scenario)
      await Promise.resolve()
      const sendsBeforeAbort = scenario.observations().sends
      scenario.abort()
      expect(scenario.runRequest.signal?.aborted).toBe(true)
      expect(validateEnvelope(await pending).status).toBe('cancelled')
      expect(sendsBeforeAbort).toBe(1)
      expectOneSend(scenario)
    })

    it('passes a denied tool through the host boundary once with correlation and error output', async () => {
      const scenario = subject.fixtures.deniedTool
      validateEnvelope(await runCase(subject, scenario))
      const observation = scenario.observations()
      expect(observation.calls).toEqual([{
        id: expect.any(String), sessionId: expect.any(String), turnId: expect.any(String),
        workspaceId: expect.any(String), attempt: 1, step: 1, providerRequestId: expect.any(String),
      }])
      assertDeniedToolOutcome(observation.outcomes, observation.providerResults, observation.calls[0]!.id)
    })

    it('rejects malformed tool arguments before host execution', async () => {
      const scenario = subject.fixtures.malformedTool
      const result = await runCase(subject, scenario)
      const observation = scenario.observations()
      assertToolFailure(result, observation.providerErrors, 'protocol', scenario.requestId)
      expect(observation.calls).toEqual([])
    })

    it('rejects a replayed provider call ID before second host execution', async () => {
      const scenario = subject.fixtures.duplicateTool
      const result = await runCase(subject, scenario)
      const observation = scenario.observations()
      assertToolFailure(result, observation.providerErrors, 'protocol', scenario.requestId)
      expect(observation.calls.map((call) => call.id)).toEqual(['replay'])
      expect(observation.calls[0]?.providerRequestId).toBe(scenario.requestId)
    })

    it('bounds the tool loop without a second host execution', async () => {
      const scenario = subject.fixtures.boundedTool
      const result = await runCase(subject, scenario)
      const observation = scenario.observations()
      assertToolFailure(result, observation.providerErrors, 'tool-failure', scenario.requestId)
      expect(observation.calls).toHaveLength(1)
      expect(observation.calls[0]?.providerRequestId).toBe(scenario.requestId)
    })

    it('preserves host tool call order and correlation', async () => {
      const scenario = subject.fixtures.orderedTools
      validateEnvelope(await runCase(subject, scenario))
      const calls = scenario.observations().calls
      expect(calls.map((call) => call.id)).toEqual(['first', 'second'])
      expect(calls.map((call) => [call.sessionId, call.turnId, call.workspaceId, call.attempt, call.step])).toEqual([
        [expect.any(String), expect.any(String), expect.any(String), 1, 1],
        [expect.any(String), expect.any(String), expect.any(String), 1, 1],
      ])
    })

    it('disposes exactly the adapter-owned resources', async () => {
      const scenario = subject.fixtures.cleanup
      expect(validateEnvelope(await runCase(subject, scenario)).status).toBe('ok')
      assertCleanup({ owned: scenario.owned, observed: scenario.observed, removed: scenario.observations().removed })
    })
  })
}
