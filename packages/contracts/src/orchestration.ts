export type OrchestrationTaskId = string
export type OrchestrationTaskStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'blocked'

export interface OrchestrationTaskContext {
  readonly signal: AbortSignal
  readonly getResult: (taskId: OrchestrationTaskId) => unknown
}

export interface OrchestrationTask<T = unknown> {
  readonly id: OrchestrationTaskId
  readonly dependsOn?: readonly OrchestrationTaskId[]
  /** Maximum attempts for this task; one means no retry. */
  readonly maxAttempts?: number
  readonly run: (context: OrchestrationTaskContext) => Promise<T>
}

export interface OrchestrationTaskRecord<T = unknown> {
  readonly id: OrchestrationTaskId
  readonly status: OrchestrationTaskStatus
  readonly result?: T
  readonly error?: unknown
  readonly attempts: number
}

export interface OrchestrationResult {
  readonly status: 'succeeded' | 'failed' | 'cancelled'
  readonly tasks: readonly OrchestrationTaskRecord[]
}

export interface OrchestrationOptions {
  readonly concurrency?: number
  readonly signal?: AbortSignal
  /** Previously persisted records used to resume completed work. */
  readonly initialRecords?: readonly OrchestrationTaskRecord[]
}

export interface OrchestrationStateStore {
  load(): readonly OrchestrationTaskRecord[]
  save(records: readonly OrchestrationTaskRecord[]): void
}
