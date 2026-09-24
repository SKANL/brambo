export type SessionEventKind =
  | 'session.started'
  | 'session.observation'
  | 'session.effect'
  | 'session.result'
  | 'session.failed'
  | 'session.cancelled'
  | 'session.completed'

export interface SessionEvent<T = unknown> {
  readonly sessionId: string
  /** Monotonic position in the owning event log (starts at 1). */
  readonly cursor: number
  readonly sequence: number
  readonly kind: SessionEventKind
  /** Wire-stable event type; defaults to `kind` for legacy callers. */
  readonly type: string
  readonly version: number
  readonly occurredAt: string
  readonly turnId?: string
  readonly correlationId?: string
  readonly causationId?: string
  readonly payload: T
}

export type SessionEventInput<T = unknown> = Omit<SessionEvent<T>, 'cursor' | 'sequence' | 'kind' | 'type' | 'version' | 'occurredAt'> & {
  readonly kind?: SessionEventKind
  readonly type?: string
  readonly version?: number
  readonly occurredAt?: string
}

export type SessionEventReplayStatus = 'ok' | 'empty' | 'overflow'

export interface SessionEventReplay<T = unknown> {
  readonly status: SessionEventReplayStatus
  readonly requestedCursor: number
  readonly events: readonly SessionEvent<T>[]
  readonly oldestAvailableCursor?: number
  readonly latestCursor?: number
}

export interface SessionEventLog {
  append<T>(event: SessionEventInput<T>): SessionEvent<T>
  read(sessionId: string): readonly SessionEvent[]
  readAfter<T = unknown>(sessionId: string, cursor: number): SessionEventReplay<T>
  oldestCursor(sessionId?: string): number | undefined
  latestCursor(sessionId?: string): number | undefined
  replayStatus(sessionId: string, cursor: number): SessionEventReplayStatus
}
