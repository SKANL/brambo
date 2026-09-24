export interface ApiStreamEvent {
  readonly kind: string
  readonly sequence: number
  readonly data?: unknown
}

export interface ApiEventStreamOptions {
  readonly maxRetainedEvents: number
  /** Trusted consumers receive the original event immediately; retained diagnostics are copied. */
  readonly onEvent?: (event: ApiStreamEvent) => void
}

export interface ApiEventStreamSnapshot {
  readonly dropped: number
  readonly events: readonly ApiStreamEvent[]
}

export interface ApiEventStream {
  append(event: ApiStreamEvent): void
  snapshot(): ApiEventStreamSnapshot
}

function protocolError(message: string): Error & { readonly category: 'protocol'; readonly providerId: 'stream'; readonly requestAccepted: false } {
  return Object.assign(new Error(message), { category: 'protocol' as const, providerId: 'stream' as const, requestAccepted: false as const })
}

function ownEventValue(event: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(event, key)
  return descriptor?.enumerable && 'value' in descriptor ? descriptor.value : undefined
}

function copyData(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (value === null || typeof value !== 'object') return value
  const existing = seen.get(value)
  if (existing !== undefined) return existing
  if (Array.isArray(value)) {
    const copy: unknown[] = []
    seen.set(value, copy)
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      if (descriptor !== undefined && 'value' in descriptor) copy[index] = copyData(descriptor.value, seen)
    }
    return copy
  }
  const copy: Record<string, unknown> = {}
  seen.set(value, copy)
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor !== undefined && 'value' in descriptor) Object.defineProperty(copy, key, { configurable: true, enumerable: true, value: copyData(descriptor.value, seen), writable: true })
  }
  return copy
}

function eventSnapshot(event: ApiStreamEvent): ApiStreamEvent {
  const value = event as unknown as object
  const kind = ownEventValue(value, 'kind')
  const sequence = ownEventValue(value, 'sequence')
  if (typeof kind !== 'string' || kind.length === 0) throw protocolError('Provider stream event kind must be a non-empty string')
  if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < 0) throw protocolError('Provider stream event sequence must be a non-negative safe integer')
  const data = ownEventValue(value, 'data')
  return data === undefined
    ? Object.freeze({ kind, sequence })
    : Object.freeze({ kind, sequence, data: copyData(data) })
}

export function createApiEventStream(options: ApiEventStreamOptions): ApiEventStream {
  if (!Number.isSafeInteger(options.maxRetainedEvents) || options.maxRetainedEvents < 1) {
    throw new RangeError('maxRetainedEvents must be a positive safe integer')
  }

  const events: ApiStreamEvent[] = []
  let dropped = 0
  let lastSequence = -1

  return Object.freeze({
    append(event: ApiStreamEvent): void {
      const snapshot = eventSnapshot(event)
      if (snapshot.sequence <= lastSequence) throw protocolError('Provider stream event sequence must be strictly increasing')
      lastSequence = snapshot.sequence
      options.onEvent?.(event)
      events.push(snapshot)
      if (events.length > options.maxRetainedEvents) {
        events.shift()
        dropped += 1
      }
    },
    snapshot(): ApiEventStreamSnapshot {
      return Object.freeze({ dropped, events: Object.freeze(events.map((event) => eventSnapshot(event))) })
    },
  })
}