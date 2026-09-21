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
  readonly sequence: number
  readonly kind: SessionEventKind
  readonly occurredAt: string
  readonly payload: T
}

export interface SessionEventLog {
  append<T>(event: Omit<SessionEvent<T>, 'sequence'>): SessionEvent<T>
  read(sessionId: string): readonly SessionEvent[]
}
