import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type {
  SessionEvent,
  SessionEventInput,
  SessionEventLog,
  SessionEventReplay,
  SessionEventReplayStatus,
} from '@brambodev/contracts'

export interface SessionEventLogOptions {
  readonly maxEvents?: number
  readonly clock?: () => string
}

export interface MemorySessionEventLog extends SessionEventLog {
  readonly events: readonly SessionEvent[]
  replay<T>(sessionId: string, initial: T, reducer: (state: T, event: SessionEvent) => T): T
}

export function createMemorySessionEventLog(options: SessionEventLogOptions = {}): MemorySessionEventLog {
  const maxEvents = validateMaxEvents(options.maxEvents)
  const clock = options.clock ?? (() => new Date().toISOString())
  let events: SessionEvent[] = []
  const nextSequence = new Map<string, number>()
  let nextCursor = 1

  return {
    get events() { return events.map(copyEvent) },
    append<T>(event: SessionEventInput<T>): SessionEvent<T> {
      const persisted = createEvent(event, nextSequence, nextCursor++, clock)
      events = retain([...events, persisted], maxEvents)
      return copyEvent(persisted)
    },
    read(sessionId: string): readonly SessionEvent[] {
      return events.filter((event) => event.sessionId === sessionId).map(copyEvent)
    },
    readAfter<T>(sessionId: string, cursor: number): SessionEventReplay<T> {
      return readAfter(events, sessionId, cursor)
    },
    oldestCursor(sessionId?: string): number | undefined {
      return bounds(events, sessionId).oldest
    },
    latestCursor(sessionId?: string): number | undefined {
      return bounds(events, sessionId).latest
    },
    replayStatus(sessionId: string, cursor: number): SessionEventReplayStatus {
      return readAfter(events, sessionId, cursor).status
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

export function createAppendOnlySessionEventLog(filePath: string, options: SessionEventLogOptions = {}): AppendOnlySessionEventLog {
  mkdirSync(dirname(filePath), { recursive: true })
  const maxEvents = validateMaxEvents(options.maxEvents)
  const clock = options.clock ?? (() => new Date().toISOString())
  const allEvents = readEvents(filePath)
  let retained = retain(allEvents, maxEvents)
  const nextSequence = new Map<string, number>()
  for (const event of allEvents) nextSequence.set(event.sessionId, Math.max(nextSequence.get(event.sessionId) ?? 0, event.sequence + 1))
  let nextCursor = Math.max(0, ...allEvents.map((event) => event.cursor)) + 1

  return {
    filePath,
    append<T>(event: SessionEventInput<T>): SessionEvent<T> {
      const persisted = createEvent(event, nextSequence, nextCursor++, clock)
      appendFileSync(filePath, `${JSON.stringify(persisted)}\n`, 'utf8')
      retained = retain([...retained, persisted], maxEvents)
      return copyEvent(persisted)
    },
    read(sessionId: string): readonly SessionEvent[] {
      return retained.filter((event) => event.sessionId === sessionId).map(copyEvent)
    },
    readAfter<T>(sessionId: string, cursor: number): SessionEventReplay<T> {
      return readAfter(retained, sessionId, cursor)
    },
    oldestCursor(sessionId?: string): number | undefined {
      return bounds(retained, sessionId).oldest
    },
    latestCursor(sessionId?: string): number | undefined {
      return bounds(retained, sessionId).latest
    },
    replayStatus(sessionId: string, cursor: number): SessionEventReplayStatus {
      return readAfter(retained, sessionId, cursor).status
    },
    replay<T>(sessionId: string, initial: T, reducer: (state: T, event: SessionEvent) => T): T {
      return this.read(sessionId).reduce(reducer, initial)
    },
  }
}

function createEvent<T>(event: SessionEventInput<T>, nextSequence: Map<string, number>, cursor: number, clock: () => string): SessionEvent<T> {
  if (!event.sessionId.trim()) throw new Error('session event requires a sessionId')
  const kind = event.kind ?? event.type
  if (!kind?.trim()) throw new Error('session event requires a kind or type')
  if (event.type !== undefined && !event.type.trim()) throw new Error('session event type cannot be empty')
  const sequence = nextSequence.get(event.sessionId) ?? 0
  const persisted = { ...event, kind: event.kind ?? kind as SessionEvent['kind'], type: event.type ?? kind, occurredAt: event.occurredAt ?? clock(), cursor, sequence, version: event.version ?? 1 } as SessionEvent<T>
  nextSequence.set(event.sessionId, sequence + 1)
  return persisted
}

function readAfter<T>(events: readonly SessionEvent[], sessionId: string, cursor: number): SessionEventReplay<T> {
  if (!Number.isInteger(cursor) || cursor < 0) throw new Error('session event cursor must be a non-negative integer')
  const scoped = events.filter((event) => event.sessionId === sessionId)
  const { oldest, latest } = bounds(scoped)
  if (oldest === undefined || latest === undefined) return { status: 'empty', requestedCursor: cursor, events: [] }
  if (cursor < oldest - 1) return { status: 'overflow', requestedCursor: cursor, events: [], oldestAvailableCursor: oldest, latestCursor: latest }
  return {
    status: 'ok',
    requestedCursor: cursor,
    events: scoped.filter((event) => event.cursor > cursor).map(copyEvent) as readonly SessionEvent<T>[],
    oldestAvailableCursor: oldest,
    latestCursor: latest,
  }
}

function bounds(events: readonly SessionEvent[], sessionId?: string): { oldest: number | undefined; latest: number | undefined } {
  const scoped = sessionId === undefined ? events : events.filter((event) => event.sessionId === sessionId)
  return { oldest: scoped[0]?.cursor, latest: scoped.at(-1)?.cursor }
}

function retain(events: SessionEvent[], maxEvents: number | undefined): SessionEvent[] {
  return maxEvents === undefined || events.length <= maxEvents ? events : events.slice(-maxEvents)
}

function validateMaxEvents(maxEvents: number | undefined): number | undefined {
  if (maxEvents === undefined) return undefined
  if (!Number.isInteger(maxEvents) || maxEvents < 1) throw new Error('maxEvents must be a positive integer')
  return maxEvents
}

function copyEvent<T>(event: SessionEvent<T>): SessionEvent<T> {
  return { ...event }
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
    const value = parsed as Partial<SessionEvent> & Pick<SessionEvent, 'sessionId' | 'sequence'>
    return { ...value, cursor: typeof value.cursor === 'number' ? value.cursor : index + 1, type: typeof value.type === 'string' ? value.type : value.kind, version: typeof value.version === 'number' ? value.version : 1 } as SessionEvent
  })
}
