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
