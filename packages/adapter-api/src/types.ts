import type {
  ApiProviderErrorCategory,
  ExecutorAdapter,
  ExecutorManifest,
  ExecutorProvider,
  ExecutorProviderCreateOptions,
  ExecutorSelection,
} from '@brambodev/contracts'

export type { ExecutorManifest, ExecutorProvider, ExecutorProviderCreateOptions, ExecutorSelection }

export interface ExecutorRegistry {
  register(provider: ExecutorProvider): void
  resolve(providerId: string): ExecutorProvider
  create(selection: ExecutorSelection, options: ExecutorProviderCreateOptions): ExecutorAdapter
  list(): readonly ExecutorManifest[]
}

export type IdempotencyProof = 'safe' | 'provider-key' | 'unknown'

export interface ApiRequest<T> {
  readonly send: () => Promise<T>
  readonly signal: AbortSignal
  readonly deadlineAt?: number
  readonly idempotency: IdempotencyProof
}

export interface ApiTransportAttempt {
  readonly kind: 'send' | 'retry'
  readonly attempt: number
  readonly delayMilliseconds?: number
  readonly category?: ApiProviderErrorCategory
}

export interface ApiTransportDependencies {
  readonly now: () => number
  readonly sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>
  readonly random: () => number
  readonly maxAttempts: number
  readonly onAttempt?: (attempt: ApiTransportAttempt) => void
}