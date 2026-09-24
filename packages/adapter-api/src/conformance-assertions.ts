export interface CleanupObservation {
  readonly owned: readonly string[]
  readonly observed: readonly string[]
  readonly removed: readonly string[]
}

export function assertCleanup(observation: CleanupObservation): void {
  const owned = new Set(observation.owned)
  const observed = new Set(observation.observed)
  const removed = new Set(observation.removed)
  if (owned.size === 0 || observed.size === 0) throw new Error('cleanup fixture must include owned and observed resources')
  if (owned.size !== observation.owned.length || observed.size !== observation.observed.length || removed.size !== observation.removed.length) {
    throw new Error('cleanup fixture resource IDs must be unique')
  }
  if ([...owned].some((id) => observed.has(id))) throw new Error('cleanup fixture ownership must be unambiguous')
  if (owned.size !== removed.size || [...owned].some((id) => !removed.has(id))) {
    throw new Error('adapter cleanup must remove exactly its owned resources')
  }
}

export function assertRedactedFailure(failure: unknown, secret: string): void {
  if (secret.length === 0) throw new Error('redaction fixture must provide a non-empty sentinel')
  if (failure === null || (typeof failure !== 'object' && typeof failure !== 'string')) {
    throw new Error('redaction fixture must provide a failure observation')
  }
  const seen = new WeakSet<object>()
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      if (value.includes(secret)) throw new Error('provider failure leaked the fixture secret')
      return
    }
    if (value === null || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === 'string') visit(key)
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (descriptor !== undefined && 'value' in descriptor) visit(descriptor.value)
    }
  }
  visit(failure)
}

export function assertToolFailure(envelopeValue: unknown, providerErrors: readonly unknown[], category: ApiProviderErrorCategory, requestId: string): void {
  const envelope = validateEnvelope(envelopeValue)
  if (envelope.status !== 'failed') throw new Error('tool failure must produce a failed envelope')
  if (requestId.length === 0) throw new Error('tool failure fixture must provide a request ID')
  const normalized = providerErrors.map(validateApiProviderError)
  const matching = normalized.find((error) => error.category === category && error.requestId === requestId)
  if (matching === undefined) throw new Error('tool failure must retain its category and provider request correlation')
  if (!envelope.errors?.some((error) => error.message === matching.message)) {
    throw new Error('normalized tool failure must reach the result envelope')
  }
}

export function assertDeniedToolOutcome(outcomes: readonly string[], providerResults: readonly { readonly callId: string; readonly kind: string }[], callId: string): void {
  if (callId.length === 0 || outcomes.length !== 1 || outcomes[0] !== 'error') {
    throw new Error('denied tool must encode one error outcome')
  }
  if (providerResults.length !== 1 || providerResults[0]?.callId !== callId || providerResults[0].kind !== 'error') {
    throw new Error('denied tool result must reach the matching provider call')
  }
}
import { validateApiProviderError, validateEnvelope } from '@brambodev/contracts'
import type { ApiProviderErrorCategory } from '@brambodev/contracts'
