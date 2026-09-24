import { describe, expect, it, vi } from 'vitest'
import { createApiEventStream } from '../src/index.ts'

describe('ApiEventStream', () => {
  it('bounds retained events while retaining monotonic sequence', () => {
    const stream = createApiEventStream({ maxRetainedEvents: 2 })
    stream.append({ kind: 'text.delta', sequence: 1, data: 'a' })
    stream.append({ kind: 'text.delta', sequence: 2, data: 'b' })
    stream.append({ kind: 'text.delta', sequence: 3, data: 'c' })

    expect(stream.snapshot()).toMatchObject({ dropped: 1, events: [{ sequence: 2 }, { sequence: 3 }] })
  })

  it('rejects non-monotonic sequences before notifying observers', () => {
    const onEvent = vi.fn()
    const stream = createApiEventStream({ maxRetainedEvents: 2, onEvent })
    stream.append({ kind: 'text.delta', sequence: 1, data: 'a' })

    expect(() => stream.append({ kind: 'text.delta', sequence: 1, data: 'b' })).toThrow(/sequence/i)
    expect(onEvent).toHaveBeenCalledTimes(1)
  })
})