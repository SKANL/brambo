import { validateDriverManifest, validateRunSnapshot } from '@brambodev/contracts'
import type { CapabilityId, DriverManifest, JsonObject, JsonValue, ProviderBinding, RunSnapshot, WorkspaceRef } from '@brambodev/contracts'

export const CONTINUATION_CAPABILITIES = Object.freeze({ native: 'native-continuation', reconstruction: 'context-reconstruction' })
export interface ContinuationIdentity {
  readonly key: RunSnapshot['key']
  readonly sessionId: string
  readonly workflowId: string
  readonly workflowVersion: string
  readonly revision: number
  readonly workspace: WorkspaceRef
}
/** Host-assembled evidence, already authorized for provider disclosure. No loading occurs here. */
export type AuthorizedContinuationContext = JsonObject & {
  readonly schemaVersion: 1
  readonly identity: JsonObject
  readonly snapshot: JsonValue
  /** Complete contiguous interval (after, latestCursor], not a truncated replay page. */
  readonly events: JsonObject
  /** Explicit immutable refs, including the snapshot's current workspace revision. */
  readonly artifacts: JsonValue[]
  /** Host-negotiated driver/runtime/policy intersection, not advertised driver capabilities. */
  readonly capabilities: string[]
  /** Current host compatibility/availability evidence; persisted metadata alone is insufficient. */
  readonly native?: JsonObject
}
export type ContinuationBlockReason = 'workflow-version-mismatch' | 'context-missing' | 'context-invalid' | 'context-over-budget' | 'evidence-mismatch' | 'required-capability-unavailable' | 'native-incompatible'
export type ContinuationSelection = {
  readonly mode: 'fresh' | 'native' | 'reconstructed'
  readonly context: JsonValue
  readonly identity: ContinuationIdentity
  readonly binding?: ProviderBinding
} | { readonly mode: 'blocked'; readonly reason: ContinuationBlockReason; readonly message: string }
export interface ContinuationOptions {
  readonly snapshot: RunSnapshot
  readonly driver: DriverManifest
  readonly providerId: string
  readonly accountRef: string
  readonly workflowVersion: string
  readonly required: readonly CapabilityId[]
  readonly authorizedContext: JsonValue
  readonly maxContextBytes: number
}
const block = (reason: ContinuationBlockReason, message: string): ContinuationSelection => ({ mode: 'blocked', reason, message })
function record(value: JsonValue | undefined): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : undefined
}
/** JSON object key order is not compatibility semantics. Arrays retain their order. */
export function sameContinuationEvidence(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameContinuationEvidence(v, b[i]))
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && sameContinuationEvidence(left[key], right[key]))
}
export function continuationIdentity(snapshot: RunSnapshot): ContinuationIdentity {
  return { key: snapshot.key, sessionId: snapshot.sessionId, workflowId: snapshot.workflowId, workflowVersion: snapshot.workflowVersion, revision: snapshot.revision, workspace: snapshot.workspace }
}
function coherentEvidence(context: JsonObject, snapshot: RunSnapshot): boolean {
  if (context['schemaVersion'] !== 1 || !sameContinuationEvidence(context['identity'], continuationIdentity(snapshot)) || !sameContinuationEvidence(context['snapshot'], snapshot)) return false
  const events = record(context['events'])
  if (!events || !Number.isSafeInteger(events['after']) || !Number.isSafeInteger(events['latestCursor'])) return false
  const after = events['after'] as number, latest = events['latestCursor'] as number, items = events['items']
  if (after < 0 || latest < after || !Array.isArray(items) || items.length !== latest - after) return false
  if (!items.every((item, index) => {
    const event = record(item)
    return event?.['schemaVersion'] === 1 && sameContinuationEvidence(event['key'], snapshot.key) && event['cursor'] === after + index + 1 &&
      typeof event['type'] === 'string' && event['type'].trim().length > 0 && Object.hasOwn(event, 'payload') &&
      typeof event['occurredAt'] === 'string' && Number.isFinite(Date.parse(event['occurredAt']))
  })) return false
  const artifacts = context['artifacts']
  return Array.isArray(artifacts) && artifacts.some(ref => sameContinuationEvidence(ref, snapshot.workspace)) && artifacts.every(ref => {
    const artifact = record(ref)
    return artifact?.['namespace'] === snapshot.key.namespace && typeof artifact['workspaceId'] === 'string' && artifact['workspaceId'].length > 0 && typeof artifact['revision'] === 'string' && artifact['revision'].length > 0
  })
}

/** Select once before dispatch. A native attempt must never fall back after executing. */
export function selectContinuation(options: ContinuationOptions): ContinuationSelection {
  try {
    validateRunSnapshot(options.snapshot)
    validateDriverManifest(options.driver)
    const snapshot = JSON.parse(JSON.stringify(options.snapshot)) as RunSnapshot
    const identity = continuationIdentity(snapshot)
    if (snapshot.workflowVersion !== options.workflowVersion) return block('workflow-version-mismatch', 'Resolve the registered workflow version before continuing.')
    if (!Number.isSafeInteger(options.maxContextBytes) || options.maxContextBytes < 1) return block('context-over-budget', 'Provide a positive UTF-8 context byte budget.')
    if (typeof options.providerId !== 'string' || !options.providerId.trim() || typeof options.accountRef !== 'string' || !options.accountRef.trim()) return block('context-invalid', 'Provide the authorized provider and account references.')
    const fresh = snapshot.revision === 0 && snapshot.status === 'pending' && !snapshot.binding && snapshot.tasks.every(task => task.attempt === 0 && task.phase === 'pending')
    if (fresh && options.authorizedContext === null && options.required.length === 0) return { mode: 'fresh', context: null, identity }
    if (options.authorizedContext === null) return block('context-missing', 'Load authorized durable context before continuing.')
    // Reuse the contract JSON validator before serialization; no getters, prototypes or cycles.
    validateRunSnapshot({ ...snapshot, context: options.authorizedContext })
    const serialized = JSON.stringify(options.authorizedContext)
    if (Buffer.byteLength(serialized, 'utf8') > options.maxContextBytes) return block('context-over-budget', 'Assemble a complete authorized context within the UTF-8 byte budget; do not truncate evidence.')
    const context = record(JSON.parse(serialized) as JsonValue)
    if (!context || !coherentEvidence(context, snapshot)) return block('evidence-mismatch', 'Reload coherent snapshot, ordered events and immutable workspace/artifact references.')
    const capabilities = context['capabilities']
    if (!Array.isArray(capabilities) || capabilities.some(id => typeof id !== 'string')) return block('context-invalid', 'Provide explicitly negotiated continuation capabilities.')
    const effective = new Set(capabilities.filter(id => typeof id === 'string' && options.driver.capabilities.includes(id)))
    if (options.required.some(id => !effective.has(id))) return block('required-capability-unavailable', 'Negotiate every required capability before continuing.')
    const current = record(context['native'])
    const candidate = record(current?.['binding'])
    const binding = snapshot.binding
    const native = effective.has(CONTINUATION_CAPABILITIES.native) && current?.['available'] === true && binding?.nativeSessionId &&
      binding.driverId === options.driver.id && binding.driverVersion === options.driver.version && binding.providerId === options.providerId && binding.accountRef === options.accountRef &&
      sameContinuationEvidence(candidate, binding)
    if (native) return { mode: 'native', context, identity, binding }
    if (options.required.includes(CONTINUATION_CAPABILITIES.native)) return block('native-incompatible', 'Obtain current compatible native binding evidence or explicitly remove the native requirement.')
    if (fresh) return { mode: 'fresh', context, identity }
    if (!effective.has(CONTINUATION_CAPABILITIES.reconstruction)) return block('required-capability-unavailable', 'Negotiate context-reconstruction before resuming without native continuation.')
    return { mode: 'reconstructed', context, identity }
  } catch {
    return block('context-invalid', 'Provide valid durable snapshot, driver and authorized JSON evidence.')
  }
}
