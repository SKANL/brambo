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
