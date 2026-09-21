import { describe, expect, it } from 'vitest'
import { createMemorySessionEventLog } from '../src/event-log.ts'
import { runSession } from '../src/run-session.ts'

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

  it('records the run lifecycle without making the log authoritative for the result', async () => {
    const log = createMemorySessionEventLog()
    const result = await runSession({
      prompt: 'hello',
      eventLog: log,
      createAdapter: () => ({ run: async () => ({ status: 'ok', data: null, summary: 'ok' }) }),
      createProvider: () => ({
        async create() { return { id: 'session-1', rootPath: '/tmp/session-1', capabilities: ['read'] as const } },
        async acquire() { return { id: 'session-1', rootPath: '/tmp/session-1', capabilities: ['read'] as const } },
        async release() {},
        async dispose() {},
      }),
    })
    expect(result.status).toBe('ok')
    expect(log.read('session-1').map((event) => event.kind)).toEqual(['session.started', 'session.result', 'session.completed'])
  })
})
