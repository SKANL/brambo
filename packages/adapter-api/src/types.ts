import type {
  ApiProviderErrorCategory,
  ExecutorAdapter,
  ExecutorManifest,
  ExecutorProvider,
  ExecutorProviderCreateOptions,
  ExecutorSelection,
  ToolResult,
} from '@brambodev/contracts'
import type { ExecuteToolOptions } from '@brambodev/session'
import type { ExecutorCapability } from '@brambodev/contracts'

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

/** A provider-issued call normalized before it reaches the host execution boundary. */
export interface ProviderToolCall {
  /** Provider-scoped immutable correlation ID. IDs may not be replayed within a loop. */
  readonly id: string
  readonly arguments: unknown
  /** Validates the provider arguments against the host-declared tool schema before approval. */
  readonly validateArguments: (value: unknown) => void | Promise<void>
  /** A host-declared property; provider preference alone never authorizes parallel execution. */
  readonly concurrencySafe: boolean
  /** Provider and Brambo identities that must be bound to the host authorization request. */
  readonly correlation: ProviderToolCallCorrelation
}

/** Immutable identifiers retained across provider parsing, approval, and execution. */
export interface ProviderToolCallCorrelation {
  /** Present when the provider protocol exposes the outbound request identifier. */
  readonly providerRequestId?: string
  /** Present when the provider protocol exposes the inbound response identifier. */
  readonly providerResponseId?: string
  readonly sessionId: string
  readonly turnId: string
  readonly workspaceId: string
  readonly attempt: number
  readonly step: number
}

/** A normalized outcome passed to the provider encoder exactly once for every dispatched call. */
export type ProviderToolExecutionOutcome =
  | { readonly kind: 'result'; readonly result: ToolResult }
  | { readonly kind: 'error'; readonly error: unknown }

/** Provider-specific result payload retaining the provider call correlation ID. */
export interface EncodedProviderToolResult {
  readonly callId: string
  readonly output: unknown
}

/** Converts a host tool outcome to the provider's valid tool-result representation. */
export type ProviderToolResultEncoder = (call: ProviderToolCall, outcome: ProviderToolExecutionOutcome) => EncodedProviderToolResult

/** One provider response in a bounded local-tool turn. */
export interface ProviderTurn<TState> {
  readonly state: TState
  readonly calls?: readonly ProviderToolCall[]
  /** Provider asks for parallel calls; execution additionally requires every call to be safe and policy capacity. */
  readonly parallel?: boolean
  /** The provider has produced its final non-tool response. */
  readonly complete?: boolean
}

export interface LocalToolLoopLimits {
  readonly maxSteps: number
  readonly maxConcurrentCalls: number
}

export interface LocalToolLoopOptions<TState> {
  readonly state: TState
  readonly signal: AbortSignal
  readonly limits: LocalToolLoopLimits
  readonly next: (state: TState, priorResults: readonly EncodedProviderToolResult[]) => Promise<ProviderTurn<TState>>
  /** The only permitted local execution boundary. */
  readonly executeTool: (options: ExecuteToolOptions) => Promise<ToolResult>
  readonly encodeResult: ProviderToolResultEncoder
  /** Builds the fully host-composed request that is passed unchanged to executeTool. */
  readonly createExecution: (call: ProviderToolCall, signal: AbortSignal) => ExecuteToolOptions
}

export type LocalToolLoopStatus = 'completed' | 'cancelled' | 'max-steps'

export interface LocalToolLoopResult<TState> {
  readonly status: LocalToolLoopStatus
  readonly state: TState
  readonly results: readonly EncodedProviderToolResult[]
}

/** Host policy for provider-hosted operations that execute beyond Brambo's local tool boundary. */
export interface RemoteCapabilityPolicy {
  /** Each capability needs its own positive host grant. */
  readonly allowedCapabilities: readonly ExecutorCapability[]
  /** Required for operations that cause provider-side network egress. */
  readonly allowEgress: boolean
  /** Required before a provider file may be retained remotely. */
  readonly allowRetention: boolean
  /** Required before an adapter may create a remotely deletable file. */
  readonly allowDeletion: boolean
}

export interface RemoteCapabilityRequest {
  readonly capability: ExecutorCapability
  readonly advertised: readonly ExecutorCapability[]
  readonly selected: readonly ExecutorCapability[]
  readonly policy: RemoteCapabilityPolicy
}

/** Evidence that one remote capability has passed all mandatory host checks. */
export interface RemoteCapabilityGrant {
  readonly capability: ExecutorCapability
}

export type RemoteResourceKind = 'file' | 'conversation' | 'remote-mcp'

export interface OwnedRemoteResource {
  readonly providerId: string
  readonly kind: RemoteResourceKind
  readonly id: string
  readonly owner: 'adapter'
}

export interface ObservedRemoteResource {
  readonly providerId: string
  readonly kind: RemoteResourceKind
  readonly id: string
  readonly owner: 'host'
}

/** Tracks adapter-created resources before their handles are exposed to callers. */
export interface RemoteResourceLedger {
  record(resource: OwnedRemoteResource): void
  observe(resource: ObservedRemoteResource): void
  dispose(remove: (resource: OwnedRemoteResource) => Promise<void>): Promise<void>
}
