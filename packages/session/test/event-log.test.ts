import { describe, expect, it } from 'vitest'
import { createAppendOnlySessionEventLog, createMemorySessionEventLog } from '../src/event-log.ts'
import { runSession } from '../src/run-session.ts'
import { createSessionReceipt } from '../src/receipt.ts'

describe('memory session event log', () => {
  it('assigns a monotonic log cursor while preserving per-session sequence and causal metadata', () => {
    const log = createMemorySessionEventLog()
    const first = log.append({
      sessionId: 'a',
      kind: 'session.started',
      occurredAt: '2026-09-20T00:00:00Z',
      payload: { value: 1 },
      correlationId: 'prompt-1',
      turnId: 'turn-1',
      version: 2,
    })
    const other = log.append({ sessionId: 'b', kind: 'session.started', occurredAt: '2026-09-20T00:00:00Z', payload: {} })
    const second = log.append({
      sessionId: 'a',
      kind: 'session.completed',
      occurredAt: '2026-09-20T00:00:01Z',
      payload: { value: 2 },
      causationId: first.cursor.toString(),
    })

    expect([first.cursor, other.cursor, second.cursor]).toEqual([1, 2, 3])
    expect([first.sequence, other.sequence, second.sequence]).toEqual([0, 0, 1])
    expect(first).toMatchObject({ type: 'session.started', version: 2, correlationId: 'prompt-1', turnId: 'turn-1' })
    expect(second).toMatchObject({ type: 'session.completed', causationId: '1', version: 1 })
  })

  it('reads events after a cursor and reports an explicit overflow for a bounded log', () => {
    const log = createMemorySessionEventLog({ maxEvents: 2 })
    log.append({ sessionId: 's', kind: 'session.started', occurredAt: 'now', payload: 1 })
    log.append({ sessionId: 's', kind: 'session.observation', occurredAt: 'now', payload: 2 })
    const third = log.append({ sessionId: 's', kind: 'session.effect', occurredAt: 'now', payload: 3 })

    expect(log.readAfter('s', 1)).toMatchObject({ status: 'ok', events: [{ cursor: 2 }, { cursor: 3 }], latestCursor: 3 })
    expect(log.readAfter('s', 0)).toMatchObject({ status: 'overflow', events: [], oldestAvailableCursor: 2, latestCursor: 3 })
    expect(log.oldestCursor('s')).toBe(2)
    expect(log.latestCursor('s')).toBe(third.cursor)
    expect(log.replayStatus('s', 0)).toBe('overflow')
  })

  it('uses an injected clock and accepts protocol type as a kind-compatible input', () => {
    const log = createMemorySessionEventLog({ clock: () => '2026-09-20T00:00:00.123Z' })
    const event = log.append({ sessionId: 's', type: 'session.observation', payload: null })
    expect(event).toMatchObject({ kind: 'session.observation', type: 'session.observation', occurredAt: '2026-09-20T00:00:00.123Z' })
  })

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

  it('persists JSONL events and resumes sequence numbers after reopening', async () => {
    const root = await mkdtemp(join(tmpdir(), 'brambo-events-'))
    try {
      const filePath = join(root, 'events.jsonl')
      const first = createAppendOnlySessionEventLog(filePath)
      first.append({ sessionId: 's', kind: 'session.started', occurredAt: '2026-09-20T00:00:00Z', payload: null })
      const reopened = createAppendOnlySessionEventLog(filePath)
      reopened.append({ sessionId: 's', kind: 'session.completed', occurredAt: '2026-09-20T00:00:01Z', payload: null })
      expect(reopened.read('s').map((event) => event.sequence)).toEqual([0, 1])
      expect((await readFile(filePath, 'utf8')).trim().split('\n')).toHaveLength(2)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('creates a receipt from the exact session event stream', () => {
    const log = createMemorySessionEventLog()
    log.append({ sessionId: 's', kind: 'session.started', occurredAt: '2026-09-20T00:00:00Z', payload: null })
    const target = { baseRef: 'main', paths: [] as const }
    const receipt = createSessionReceipt({ target, sessionId: 's', eventLog: log, result: 'allow', issuedAt: '2026-09-20T00:00:00Z', delegations: [{ id: 'child', status: 'succeeded', input: null, result: null }] })
    expect(receipt.eventHash).toMatch(/^[0-9a-f]{64}$/)
    expect(receipt.delegationHash).toMatch(/^[0-9a-f]{64}$/)
  })
})
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
