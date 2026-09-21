import { describe, expect, it } from 'vitest'
import { createAppendOnlySessionEventLog, createMemorySessionEventLog } from '../src/event-log.ts'
import { runSession } from '../src/run-session.ts'
import { createSessionReceipt } from '../src/receipt.ts'

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
    const receipt = createSessionReceipt({ target, sessionId: 's', eventLog: log, result: 'allow', issuedAt: '2026-09-20T00:00:00Z' })
    expect(receipt.eventHash).toMatch(/^[0-9a-f]{64}$/)
  })
})
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
