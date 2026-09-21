export type DelegationStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface DelegationRequest<T = unknown> {
  readonly id: string
  readonly input: T
  readonly parentId?: string
}

export interface DelegationRecord<T = unknown, R = unknown> {
  readonly id: string
  readonly status: DelegationStatus
  readonly input: T
  readonly result?: R
  readonly error?: unknown
  readonly parentId?: string
}

export interface DelegationHandler<T = unknown, R = unknown> {
  execute(request: DelegationRequest<T>, signal: AbortSignal): Promise<R>
}

export interface DelegationStateStore {
  load(): readonly DelegationRecord[]
  save(records: readonly DelegationRecord[]): void
}
