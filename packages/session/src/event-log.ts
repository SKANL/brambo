import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { SessionEvent, SessionEventLog } from '@brambodev/contracts'

export interface MemorySessionEventLog extends SessionEventLog {
  readonly events: readonly SessionEvent[]
  replay<T>(sessionId: string, initial: T, reducer: (state: T, event: SessionEvent) => T): T
}

export function createMemorySessionEventLog(): MemorySessionEventLog {
  const events: SessionEvent[] = []
  const next = new Map<string, number>()
  return {
    get events() { return [...events] },
    append<T>(event: Omit<SessionEvent<T>, 'sequence'>): SessionEvent<T> {
      if (!event.sessionId.trim()) throw new Error('session event requires a sessionId')
      const sequence = next.get(event.sessionId) ?? 0
      const persisted = { ...event, sequence } as SessionEvent<T>
      events.push(persisted)
      next.set(event.sessionId, sequence + 1)
      return persisted
    },
    read(sessionId: string): readonly SessionEvent[] {
      return events.filter((event) => event.sessionId === sessionId).map((event) => ({ ...event }))
    },
    replay<T>(sessionId: string, initial: T, reducer: (state: T, event: SessionEvent) => T): T {
      return this.read(sessionId).reduce(reducer, initial)
    },
  }
}

export interface AppendOnlySessionEventLog extends SessionEventLog {
  readonly filePath: string
  replay<T>(sessionId: string, initial: T, reducer: (state: T, event: SessionEvent) => T): T
}

/**
 * A deliberately boring JSONL store: one complete event per line, append-only,
 * with sequence numbers recovered from the existing file at startup. The file
 * is host-owned; this helper never interprets vendor output or invents a
 * provider-specific persistence format.
 */
export function createAppendOnlySessionEventLog(filePath: string): AppendOnlySessionEventLog {
  mkdirSync(dirname(filePath), { recursive: true })
  const events = readEvents(filePath)
  const next = new Map<string, number>()
  for (const event of events) next.set(event.sessionId, Math.max(next.get(event.sessionId) ?? 0, event.sequence + 1))
  return {
    filePath,
    append<T>(event: Omit<SessionEvent<T>, 'sequence'>): SessionEvent<T> {
      if (!event.sessionId.trim()) throw new Error('session event requires a sessionId')
      const persisted = { ...event, sequence: next.get(event.sessionId) ?? 0 } as SessionEvent<T>
      appendFileSync(filePath, `${JSON.stringify(persisted)}\n`, 'utf8')
      next.set(event.sessionId, persisted.sequence + 1)
      return persisted
    },
    read(sessionId: string): readonly SessionEvent[] {
      return readEvents(filePath).filter((event) => event.sessionId === sessionId)
    },
    replay<T>(sessionId: string, initial: T, reducer: (state: T, event: SessionEvent) => T): T {
      return this.read(sessionId).reduce(reducer, initial)
    },
  }
}

function readEvents(filePath: string): SessionEvent[] {
  let source: string
  try { source = readFileSync(filePath, 'utf8') } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  return source.split(/\r?\n/).filter(Boolean).map((line, index) => {
    let parsed: unknown
    try { parsed = JSON.parse(line) } catch { throw new Error(`invalid session event JSON at line ${index + 1}`) }
    if (!parsed || typeof parsed !== 'object' || typeof (parsed as { sessionId?: unknown }).sessionId !== 'string' || typeof (parsed as { sequence?: unknown }).sequence !== 'number') {
      throw new Error(`invalid session event shape at line ${index + 1}`)
    }
    return parsed as SessionEvent
  })
}
