import { describe, expect, it } from 'vitest'
import { createMemorySessionEventLog } from '../src/event-log.ts'

describe('memory session event log', () => {
  it('assigns monotonic per-session sequence numbers and replays in order', () => {
    const log = createMemorySessionEventLog()
    log.append({ sessionId: 'a', kind: 'session.started', occurredAt: '2026-09-20T00:00:00Z', payload: { value: 1 } })
    log.append({ sessionId: 'b', kind: 'session.started', occurredAt: '2026-09-20T00:00:00Z', payload: {} })
    log.append({ sessionId: 'a', kind: 'session.completed', occurredAt: '2026-09-20T00:00:01Z', payload: { value: 2 } })
    expect(log.read('a').map((event) => event.sequence)).toEqual([0, 1])
    expect(log.replay('a', 0, (state, event) => state + (event.payload as { value?: number }).value!)).toBe(3)
  })

  it('rejects events without an owning session', () => {
    const log = createMemorySessionEventLog()
    expect(() => log.append({ sessionId: '', kind: 'session.started', occurredAt: 'now', payload: null })).toThrow('sessionId')
  })
})
