import type { ApiProviderErrorCategory } from '@brambodev/contracts'
import type { ApiRequest, ApiTransportDependencies, IdempotencyProof } from './types.ts'

const RETRYABLE_CATEGORIES: ReadonlySet<ApiProviderErrorCategory> = new Set(['rate-limit', 'timeout', 'unavailable'])
const BASE_DELAY_MILLISECONDS = 100
const MAX_DELAY_MILLISECONDS = 30_000
const transportErrors = new WeakSet<object>()

function transportError<T extends object>(error: T): T {
  transportErrors.add(error)
  return error
}

function cancelledError() {
  return transportError({ category: 'cancelled' as const, providerId: 'transport', message: 'API request was cancelled', requestAccepted: false })
}

function deadlineError() {
  return transportError({ category: 'timeout' as const, providerId: 'transport', message: 'API request deadline expired', requestAccepted: false })
}

function assertActive(request: ApiRequest<unknown>, dependencies: ApiTransportDependencies): void {
  if (request.signal.aborted) throw cancelledError()
  if (request.deadlineAt !== undefined && dependencies.now() >= request.deadlineAt) throw deadlineError()
}

async function awaitSend<T>(send: () => Promise<T>, request: ApiRequest<T>, dependencies: ApiTransportDependencies): Promise<T> {
  let removeAbortListener: (() => void) | undefined
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined

  const abort = new Promise<never>((_, reject) => {
    const onAbort = () => reject(cancelledError())
    request.signal.addEventListener('abort', onAbort, { once: true })
    removeAbortListener = () => request.signal.removeEventListener('abort', onAbort)
  })
  const deadline = request.deadlineAt === undefined
    ? undefined
    : new Promise<never>((_, reject) => {
      deadlineTimer = setTimeout(() => reject(deadlineError()), Math.max(0, request.deadlineAt! - dependencies.now()))
    })

  try {
    return await Promise.race(deadline === undefined ? [send(), abort] : [send(), abort, deadline])
  } finally {
    removeAbortListener?.()
    if (deadlineTimer !== undefined) clearTimeout(deadlineTimer)
  }
}

function isRetryableError(error: unknown, idempotency: IdempotencyProof): error is { category: ApiProviderErrorCategory; requestAccepted: false } {
  if (idempotency === 'unknown' || typeof error !== 'object' || error === null) return false
  const candidate = error as { category?: unknown; requestAccepted?: unknown }
  return candidate.requestAccepted === false && typeof candidate.category === 'string' && RETRYABLE_CATEGORIES.has(candidate.category as ApiProviderErrorCategory)
}

function jitterDelay(attempt: number, random: () => number): number {
  const cap = Math.min(MAX_DELAY_MILLISECONDS, BASE_DELAY_MILLISECONDS * 2 ** (attempt - 1))
  return Math.floor(Math.max(0, Math.min(1, random())) * cap)
}

export async function executeWithRetry<T>(request: ApiRequest<T>, dependencies: ApiTransportDependencies): Promise<T> {
  if (!Number.isInteger(dependencies.maxAttempts) || dependencies.maxAttempts < 1) {
    throw new RangeError('maxAttempts must be a positive integer')
  }

  for (let attempt = 1; attempt <= dependencies.maxAttempts; attempt += 1) {
    assertActive(request, dependencies)
    dependencies.onAttempt?.({ kind: 'send', attempt })
    assertActive(request, dependencies)
    try {
      const result = await awaitSend(request.send, request, dependencies)
      assertActive(request, dependencies)
      return result
    } catch (error) {
      if (request.signal.aborted) throw cancelledError()
      if (request.deadlineAt !== undefined && dependencies.now() >= request.deadlineAt) throw deadlineError()
      if (typeof error === 'object' && error !== null && transportErrors.has(error)) throw error
      if (!isRetryableError(error, request.idempotency) || attempt === dependencies.maxAttempts) throw error

      const delayMilliseconds = jitterDelay(attempt, dependencies.random)
      assertActive(request, dependencies)
      if (request.deadlineAt !== undefined && dependencies.now() + delayMilliseconds >= request.deadlineAt) throw deadlineError()
      dependencies.onAttempt?.({ kind: 'retry', attempt, delayMilliseconds, category: error.category })
      assertActive(request, dependencies)
      if (request.deadlineAt !== undefined && dependencies.now() + delayMilliseconds >= request.deadlineAt) throw deadlineError()
      try {
        await dependencies.sleep(delayMilliseconds, request.signal)
      } catch (sleepError) {
        if (request.signal.aborted) throw cancelledError()
        throw sleepError
      }
    }
  }

  throw new Error('retry loop exited without a result')
}
