import { validateEnvelope, validateExecutorManifest } from '@brambodev/contracts'
import type { ExecutorAdapter, ExecutorProvider, ExecutorProviderCreateOptions, RunRequest } from '@brambodev/contracts'
import { describe, expect, it } from 'vitest'
import { assertCleanup, assertRedactedFailure } from './conformance-assertions.ts'

export interface ExecutorProviderConformanceToolLoopFixture {
  /** Number of times the host local-tool boundary was invoked for a single provider call. */
  readonly attempts: number
  /** Calls with malformed arguments must fail before host execution. */
  readonly malformedExecutionAttempts: number
  /** Replayed provider call IDs must fail before host execution. */
  readonly duplicateExecutionAttempts: number
  /** The fixture must drive the provider past its configured tool-loop bound. */
  readonly status: 'max-steps'
}

export interface ExecutorProviderConformanceCleanupFixture {
  /** Adapter-created IDs that the adapter must dispose. */
  readonly owned: readonly string[]
  /** Host-owned IDs that the adapter must retain. */
  readonly observed: readonly string[]
  /** IDs removed by adapter-owned remote-resource cleanup. */
  readonly removed: readonly string[]
}

export interface ExecutorProviderConformanceFixtures {
  readonly successfulAdapter: ExecutorAdapter
  readonly failedAdapter: ExecutorAdapter
  readonly cancelledAdapter: ExecutorAdapter
  readonly toolLoop: () => Promise<ExecutorProviderConformanceToolLoopFixture>
  readonly redactedFailure: () => Promise<unknown>
  readonly ownedResourceCleanup: () => Promise<ExecutorProviderConformanceCleanupFixture>
  /** A sentinel credential that must not appear in a normalized failure. */
  readonly secret: string
}

export interface ExecutorProviderConformanceSubject {
  readonly name: string
  readonly provider: ExecutorProvider
  readonly createOptions: ExecutorProviderCreateOptions
  readonly runRequest: RunRequest
  readonly fixtures: ExecutorProviderConformanceFixtures
}

/**
 * Defines black-box provider checks that official and third-party adapters run
 * against their own deterministic fixtures. The fixtures deliberately expose
 * observable host-boundary effects rather than credentials or raw provider I/O.
 */
export function defineExecutorProviderConformance(subject: ExecutorProviderConformanceSubject): void {
  describe(`ExecutorProvider conformance: ${subject.name}`, () => {
    it('publishes a valid manifest and creates an adapter', async () => {
      expect(subject.name).not.toHaveLength(0)
      validateExecutorManifest(subject.provider.manifest)
      const adapter = subject.provider.create(subject.createOptions)
      const envelope = await adapter.run(subject.runRequest)
      expect(validateEnvelope(envelope).status).toBe('ok')
    })

    it('returns valid success and non-empty failure envelopes', async () => {
      const success = await subject.fixtures.successfulAdapter.run(subject.runRequest)
      const failure = await subject.fixtures.failedAdapter.run(subject.runRequest)

      expect(validateEnvelope(success).status).toBe('ok')
      expect(validateEnvelope(failure)).toMatchObject({ status: 'failed', errors: [{ message: expect.any(String) }] })
    })

    it('propagates cancellation through a valid cancelled envelope', async () => {
      const cancelled = await subject.fixtures.cancelledAdapter.run(subject.runRequest)

      expect(validateEnvelope(cancelled)).toMatchObject({ status: 'cancelled', errors: [{ message: expect.any(String) }] })
    })

    it('does not retry tools and rejects malformed or duplicate calls before execution', async () => {
      const toolLoop = await subject.fixtures.toolLoop()

      expect(toolLoop).toEqual({
        attempts: 1,
        malformedExecutionAttempts: 0,
        duplicateExecutionAttempts: 0,
        status: 'max-steps',
      })
    })

    it('does not leak the fixture secret in normalized failures', async () => {
      const failure = await subject.fixtures.redactedFailure()

      assertRedactedFailure(failure, subject.fixtures.secret)
    })

    it('disposes only resources owned by the adapter', async () => {
      const cleanup = await subject.fixtures.ownedResourceCleanup()
      assertCleanup(cleanup)
    })
  })
}
