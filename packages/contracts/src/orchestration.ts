export type OrchestrationTaskId = string
export type OrchestrationTaskStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'blocked'

export interface OrchestrationTaskContext {
  readonly signal: AbortSignal
  readonly getResult: (taskId: OrchestrationTaskId) => unknown
}

export interface OrchestrationTask<T = unknown> {
  readonly id: OrchestrationTaskId
  readonly dependsOn?: readonly OrchestrationTaskId[]
  readonly run: (context: OrchestrationTaskContext) => Promise<T>
}

export interface OrchestrationTaskRecord<T = unknown> {
  readonly id: OrchestrationTaskId
  readonly status: OrchestrationTaskStatus
  readonly result?: T
  readonly error?: unknown
}

export interface OrchestrationResult {
  readonly status: 'succeeded' | 'failed' | 'cancelled'
  readonly tasks: readonly OrchestrationTaskRecord[]
}

export interface OrchestrationOptions {
  readonly concurrency?: number
  readonly signal?: AbortSignal
}
