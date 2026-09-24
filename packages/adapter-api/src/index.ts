export { createExecutorRegistry } from './registry.ts'
export type { ExecutorProviderDiscoveryOptions, ExecutorProviderDiscoveryResult, ExecutorProviderDiscoveryDiagnostic, ExecutorProviderDiscoveryRejectionReason } from './discovery.ts'
import type { ExecutorProviderDiscoveryOptions, ExecutorProviderDiscoveryResult } from './discovery.ts'

/** Keep optional discovery code out of the normal executor/CLI module graph. */
export async function discoverExecutorProviders(options: ExecutorProviderDiscoveryOptions): Promise<ExecutorProviderDiscoveryResult> {
  return (await import('./discovery.ts')).discoverExecutorProviders(options)
}
export { redactProviderMetadata, normalizeProviderError } from './redaction.ts'
export { createApiEventStream } from './stream.ts'
export { executeWithRetry } from './transport.ts'
export { runLocalToolLoop } from './tool-loop.ts'
export { authorizeRemoteCapability, createRemoteResourceLedger } from './remote-capability.ts'
export type {
  ApiRequest,
  ApiTransportAttempt,
  ApiTransportDependencies,
  EncodedProviderToolResult,
  ExecutorRegistry,
  IdempotencyProof,
  LocalToolLoopLimits,
  LocalToolLoopOptions,
  LocalToolLoopResult,
  LocalToolLoopStatus,
  ProviderToolCall,
  ProviderToolCallCorrelation,
  ProviderToolExecutionOutcome,
  ProviderToolResultEncoder,
  ProviderTurn,
  ObservedRemoteResource,
  OwnedRemoteResource,
  RemoteCapabilityGrant,
  RemoteCapabilityPolicy,
  RemoteCapabilityRequest,
  RemoteResourceKind,
  RemoteResourceLedger,
} from './types.ts'
export type { ProviderFailureInput } from './redaction.ts'
export type { ApiEventStream, ApiEventStreamOptions, ApiEventStreamSnapshot, ApiStreamEvent } from './stream.ts'

export type {
  ExecutorProviderConformanceCancellationCase,
  ExecutorProviderConformanceCase,
  ExecutorProviderConformanceCleanupCase,
  ExecutorProviderConformanceFixtures,
  ExecutorProviderConformanceObservation,
  ExecutorProviderConformanceSubject,
  ExecutorProviderConformanceToolCall,
  ExecutorProviderConformanceToolFailureCase,
} from './testing.ts'
