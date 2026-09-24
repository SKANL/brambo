import { describe, expect, it, vi } from 'vitest'
import { executeWithRetry } from '../src/index.ts'
import type { ApiTransportDependencies } from '../src/index.ts'

function dependencies(overrides: Partial<ApiTransportDependencies> = {}): ApiTransportDependencies {
  return {
    now: () => 0,
    sleep: vi.fn(async () => {}),
    random: () => 0.5,
    maxAttempts: 3,
    ...overrides,
  }
}

describe('executeWithRetry', () => {
  it('does not retry a possible accepted side effect', async () => {
    const send = vi.fn().mockRejectedValue({ category: 'unavailable', requestAccepted: true })
    await expect(executeWithRetry({ send, signal: new AbortController().signal, idempotency: 'unknown' }, dependencies())).rejects.toMatchObject({
      category: 'unavailable',
    })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('retries a 429 before acceptance within deadline', async () => {
    const send = vi.fn().mockRejectedValueOnce({ category: 'rate-limit', requestAccepted: false }).mockResolvedValue('ok')
    const sleep = vi.fn(async () => {})

    await expect(executeWithRetry({ send, signal: new AbortController().signal, deadlineAt: 200, idempotency: 'safe' }, dependencies({ sleep }))).resolves.toBe('ok')
    expect(send).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('does not sleep past deadline', async () => {
    const send = vi.fn().mockRejectedValue({ category: 'rate-limit', requestAccepted: false })
    const sleep = vi.fn(async () => {})

    await expect(executeWithRetry({ send, signal: new AbortController().signal, deadlineAt: 25, idempotency: 'safe' }, dependencies({ sleep, random: () => 1 }))).rejects.toMatchObject({
      category: 'timeout',
    })
    expect(send).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('does not retry an unknown-idempotency request before acceptance', async () => {
    const send = vi.fn().mockRejectedValue({ category: 'unavailable', requestAccepted: false })

    await expect(executeWithRetry({ send, signal: new AbortController().signal, idempotency: 'unknown' }, dependencies())).rejects.toMatchObject({
      category: 'unavailable',
    })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('does not retry after abort', async () => {
    const controller = new AbortController()
    const send = vi.fn(async () => {
      controller.abort()
      throw { category: 'unavailable', requestAccepted: false }
    })

    await expect(executeWithRetry({ send, signal: controller.signal, idempotency: 'safe' }, dependencies())).rejects.toMatchObject({
      category: 'cancelled',
    })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('emits only safe retry metadata', async () => {
    const error = { category: 'timeout', requestAccepted: false, authorization: 'secret' }
    const send = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('ok')
    const observations: unknown[] = []

    await executeWithRetry({ send, signal: new AbortController().signal, idempotency: 'safe' }, dependencies({
      onAttempt: (observation) => observations.push(observation),
    }))

    expect(observations[1]).toEqual({ kind: 'retry', attempt: 1, delayMilliseconds: 50, category: 'timeout' })
  })
  it('checks abort immediately before sending after an observation', async () => {
    const controller = new AbortController()
    const send = vi.fn().mockResolvedValue('unexpected')

    await expect(executeWithRetry({ send, signal: controller.signal, idempotency: 'safe' }, dependencies({
      onAttempt: (observation) => {
        if (observation.kind === 'send') controller.abort()
      },
    }))).rejects.toMatchObject({ category: 'cancelled' })
    expect(send).not.toHaveBeenCalled()
  })
  it('emits observations for each send and retry', async () => {
    const send = vi.fn().mockRejectedValueOnce({ category: 'timeout', requestAccepted: false }).mockResolvedValue('ok')
    const onAttempt = vi.fn()

    await executeWithRetry({ send, signal: new AbortController().signal, idempotency: 'provider-key' }, dependencies({ onAttempt }))

    expect(onAttempt).toHaveBeenCalledWith({ kind: 'send', attempt: 1 })
    expect(onAttempt).toHaveBeenCalledWith(expect.objectContaining({ kind: 'retry', attempt: 1 }))
    expect(onAttempt).toHaveBeenCalledWith({ kind: 'send', attempt: 2 })
  })
})