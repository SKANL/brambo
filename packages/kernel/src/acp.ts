/** Protocol-neutral session primitives for kernel integrations.
 *
 * This module deliberately models lifecycle and flow-control outcomes without
 * depending on a wire protocol, provider, UI, or transport implementation.
 */

export type SessionState = 'created' | 'active' | 'cancelling' | 'completed' | 'failed' | 'closed'
export type TurnState = 'queued' | 'running' | 'completed' | 'cancelled' | 'failed'

export interface Capability {
  readonly name: string
  readonly version?: string
  readonly supported: boolean
  readonly metadata?: Readonly<Record<string, unknown>>
}

export type AgentErrorCategory =
  | 'invalid-request'
  | 'permission-denied'
  | 'cancelled'
  | 'timeout'
  | 'overloaded'
  | 'session-inactive'
  | 'internal'

/** Immutable, transport-neutral failure information for agent operations. */
export interface AgentError {
  readonly category: AgentErrorCategory
  readonly message: string
  readonly retryable: boolean
  readonly sessionValid: boolean
  readonly recoveryHint?: string
}

export function createAgentError(input: AgentError): AgentError {
  if (!input.message) throw new TypeError('agent error message must be non-empty')
  return Object.freeze({ ...input })
}

export interface ExecutorAffinity {
  readonly sessionId: string
  readonly executorId: string
}

export interface PermissionRequest {
  readonly id: string
  readonly action: string
  readonly reason?: string
  readonly metadata?: Readonly<Record<string, unknown>>
}

export type PermissionDecision =
  | { readonly kind: 'approved' }
  | { readonly kind: 'denied'; readonly reason: string }
  | { readonly kind: 'expired'; readonly reason: string }

export type CancellationReason =
  | { readonly kind: 'user' | 'timeout' | 'shutdown' | 'superseded'; readonly message?: string }
  | { readonly kind: 'error'; readonly message: string; readonly cause?: unknown }

export interface CancellationSignal {
  readonly state: 'active' | 'cancelled'
  readonly reason?: CancellationReason
  onCancel(listener: (reason: CancellationReason) => void): () => void
}

export interface CancellationController {
  readonly signal: CancellationSignal
  cancel(reason: CancellationReason): boolean
}

export type SessionUpdate =
  | { readonly type: 'session.state'; readonly sessionId: string; readonly state: SessionState }
  | { readonly type: 'turn.started'; readonly sessionId: string; readonly turnId: string }
  | { readonly type: 'turn.output'; readonly sessionId: string; readonly turnId: string; readonly text: string }
  | { readonly type: 'turn.completed'; readonly sessionId: string; readonly turnId: string; readonly state: Exclude<TurnState, 'queued' | 'running'> }
  | { readonly type: 'permission.requested'; readonly sessionId: string; readonly request: PermissionRequest }

export type TransitionResult =
  | { readonly ok: true; readonly state: SessionState }
  | { readonly ok: false; readonly reason: 'invalid-state' | 'terminal'; readonly state: SessionState }

export interface SessionSupervisor {
  readonly id: string
  readonly state: SessionState
  readonly turnId?: string
  readonly turnState?: TurnState
  readonly affinity?: ExecutorAffinity
  start(): TransitionResult
  queueTurn(turnId: string): TransitionResult
  beginTurn(turnId: string): { readonly ok: true; readonly state: 'running' } | { readonly ok: false; readonly reason: 'invalid-state' | 'terminal'; readonly state: SessionState }
  completeTurn(): TransitionResult
  /** Cancel the currently queued or running turn while keeping the session usable. */
  cancelTurn(): TransitionResult
  complete(): TransitionResult
  /** Request cancellation of the session; call close() after cleanup is complete. */
  cancel(): TransitionResult
  fail(): TransitionResult
  close(): TransitionResult
}

export function createSessionSupervisor(id: string, options: { readonly affinity?: ExecutorAffinity } = {}): SessionSupervisor {
  if (!id) throw new TypeError('session id must be non-empty')
  if (options.affinity && options.affinity.sessionId !== id) {
    throw new TypeError('executor affinity must reference the supervised session')
  }
  let state: SessionState = 'created'
  let turnId: string | undefined
  let turnState: TurnState | undefined
  const turnIds = new Set<string>()
  const terminal = (): TransitionResult => ({ ok: false, reason: 'terminal', state })
  const invalid = (): TransitionResult => ({ ok: false, reason: 'invalid-state', state })
  const turnTerminal = () => ({ ok: false as const, reason: 'terminal' as const, state })
  const turnInvalid = () => ({ ok: false as const, reason: 'invalid-state' as const, state })
  return {
    id,
    get state() { return state },
    get turnId() { return turnId },
    get turnState() { return turnState },
    affinity: options.affinity,
    start() {
      if (state === 'closed' || state === 'completed' || state === 'failed') return terminal()
      if (state !== 'created') return invalid()
      state = 'active'
      return { ok: true, state }
    },
    queueTurn(nextTurnId) {
      if (state === 'closed' || state === 'completed' || state === 'failed') return terminal()
      if (!nextTurnId || turnIds.has(nextTurnId) || state !== 'active' || (turnState !== undefined && turnState !== 'completed' && turnState !== 'cancelled' && turnState !== 'failed')) return invalid()
      turnIds.add(nextTurnId)
      turnId = nextTurnId
      turnState = 'queued'
      return { ok: true, state }
    },
    beginTurn(nextTurnId) {
      if (state === 'closed' || state === 'completed' || state === 'failed') return turnTerminal()
      if (state !== 'active' || !nextTurnId || turnId !== nextTurnId || turnState !== 'queued') return turnInvalid()
      turnState = 'running'
      return { ok: true, state: 'running' }
    },
    completeTurn() {
      if (state === 'closed' || state === 'completed' || state === 'failed') return terminal()
      if (state !== 'active' || turnState !== 'running') return invalid()
      turnState = 'completed'
      return { ok: true, state }
    },
    cancelTurn() {
      if (state === 'closed' || state === 'completed' || state === 'failed') return terminal()
      if (state !== 'active' || (turnState !== 'queued' && turnState !== 'running')) return invalid()
      turnState = 'cancelled'
      return { ok: true, state }
    },
    complete() {
      if (state === 'closed' || state === 'completed' || state === 'failed') return terminal()
      if (state !== 'active' || (turnState !== undefined && turnState !== 'completed' && turnState !== 'cancelled' && turnState !== 'failed')) return invalid()
      state = 'completed'
      return { ok: true, state }
    },
    cancel() {
      if (state === 'closed' || state === 'completed' || state === 'failed') return terminal()
      if (state !== 'active') return invalid()
      state = 'cancelling'
      if (turnState === 'queued' || turnState === 'running') turnState = 'cancelled'
      return { ok: true, state }
    },
    fail() {
      if (state === 'closed' || state === 'completed' || state === 'failed') return terminal()
      if (state === 'created') return invalid()
      state = 'failed'
      if (turnState === 'queued' || turnState === 'running') turnState = 'failed'
      return { ok: true, state }
    },
    close() {
      if (state === 'closed') return { ok: true, state }
      if (state !== 'active' && state !== 'cancelling' && state !== 'completed' && state !== 'failed') return invalid()
      state = 'closed'
      return { ok: true, state }
    },
  }
}

export function createCancellationController(): CancellationController {
  let reason: CancellationReason | undefined
  const listeners = new Set<(reason: CancellationReason) => void>()
  const signal: CancellationSignal = {
    get state() { return reason ? 'cancelled' : 'active' },
    get reason() { return reason },
    onCancel(listener) {
      if (reason) listener(reason)
      else listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  return {
    signal,
    cancel(nextReason) {
      if (reason) return false
      reason = nextReason
      for (const listener of listeners) listener(nextReason)
      listeners.clear()
      return true
    },
  }
}

export interface PermissionBroker {
  readonly pending: number
  request(request: PermissionRequest, options?: PermissionRequestOptions): Promise<PermissionDecision>
  decide(id: string, decision: PermissionDecision): boolean
  expire(id: string, reason?: string): boolean
}

export interface PermissionRequestOptions {
  readonly timeoutMs?: number
  readonly timer?: PermissionTimer
}

export interface PermissionTimer {
  setTimeout(callback: () => void, timeoutMs: number): unknown
  clearTimeout(handle: unknown): void
}

const defaultPermissionTimer: PermissionTimer = {
  setTimeout: (callback, timeoutMs) => globalThis.setTimeout(callback, timeoutMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
}

export function createPermissionBroker(): PermissionBroker {
  const pending = new Map<string, { readonly resolve: (decision: PermissionDecision) => void; readonly timer?: PermissionTimer; readonly handle?: unknown }>()
  return {
    get pending() { return pending.size },
    request(request, options = {}) {
      if (!request.id || !request.action) return Promise.reject(new TypeError('permission request requires id and action'))
      if (pending.has(request.id)) return Promise.reject(new TypeError(`permission request '${request.id}' is already pending`))
      if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 0)) {
        return Promise.reject(new TypeError('permission timeout must be a finite non-negative number'))
      }
      const timer = options.timer ?? defaultPermissionTimer
      return new Promise((resolve) => {
        const entry: { resolve: (decision: PermissionDecision) => void; timer?: PermissionTimer; handle?: unknown } = { resolve }
        if (options.timeoutMs !== undefined) {
          entry.timer = timer
          entry.handle = timer.setTimeout(() => this.expire(request.id), options.timeoutMs)
        }
        pending.set(request.id, entry)
      })
    },
    decide(id, decision) {
      const entry = pending.get(id)
      if (!entry) return false
      pending.delete(id)
      if (entry.timer && entry.handle !== undefined) entry.timer.clearTimeout(entry.handle)
      entry.resolve(decision)
      return true
    },
    expire(id, reason = 'permission request expired') {
      return this.decide(id, { kind: 'expired', reason })
    },
  }
}

export type QueueEnqueueResult =
  | { readonly status: 'accepted'; readonly size: number }
  | { readonly status: 'overloaded'; readonly size: number; readonly capacity: number }
  | { readonly status: 'closed'; readonly size: number }
export type QueueDequeueResult<T> =
  | { readonly status: 'item'; readonly value: T; readonly size: number }
  | { readonly status: 'empty'; readonly size: 0 }

export interface BoundedQueue<T> {
  readonly capacity: number
  readonly size: number
  readonly closed: boolean
  enqueue(value: T): QueueEnqueueResult
  dequeue(): QueueDequeueResult<T>
  close(): void
}

export function createBoundedQueue<T>(capacity: number): BoundedQueue<T> {
  if (!Number.isSafeInteger(capacity) || capacity < 1) throw new TypeError('queue capacity must be a positive integer')
  const values: T[] = []
  let closed = false
  return {
    capacity,
    get size() { return values.length },
    get closed() { return closed },
    enqueue(value) {
      if (closed) return { status: 'closed', size: values.length }
      if (values.length >= capacity) return { status: 'overloaded', size: values.length, capacity }
      values.push(value)
      return { status: 'accepted', size: values.length }
    },
    dequeue() {
      if (values.length === 0) return { status: 'empty', size: 0 }
      return { status: 'item', value: values.shift() as T, size: values.length }
    },
    close() { closed = true },
  }
}

export interface ReplayEntry<T> {
  readonly cursor: number
  readonly update: T
}

export type ReplayAppendResult<T> =
  | { readonly status: 'accepted'; readonly entry: ReplayEntry<T>; readonly latestCursor: number }
  | { readonly status: 'overloaded'; readonly entry: ReplayEntry<T>; readonly droppedCursor: number; readonly latestCursor: number }
  | { readonly status: 'closed'; readonly latestCursor: number }

export interface ReplayReadResult<T> {
  readonly status: 'ok' | 'overflow'
  readonly requestedCursor: number
  readonly oldestCursor: number
  readonly latestCursor: number
  readonly closed: boolean
  readonly entries: readonly ReplayEntry<T>[]
}

export interface ReplayableUpdateLog<T> {
  readonly capacity: number
  readonly closed: boolean
  readonly oldestCursor: number
  readonly latestCursor: number
  append(update: T): ReplayAppendResult<T>
  readAfter(cursor: number): ReplayReadResult<T>
  close(): void
}

export function createReplayableUpdateLog<T>(capacity: number): ReplayableUpdateLog<T> {
  if (!Number.isSafeInteger(capacity) || capacity < 1) throw new TypeError('replay capacity must be a positive integer')
  const entries: ReplayEntry<T>[] = []
  let latestCursor = 0
  let closed = false
  return {
    capacity,
    get closed() { return closed },
    get oldestCursor() { return entries[0]?.cursor ?? 0 },
    get latestCursor() { return latestCursor },
    append(update) {
      if (closed) return { status: 'closed', latestCursor }
      const entry = Object.freeze({ cursor: ++latestCursor, update })
      entries.push(entry)
      if (entries.length <= capacity) return { status: 'accepted', entry, latestCursor }
      const dropped = entries.shift()!
      return { status: 'overloaded', entry, droppedCursor: dropped.cursor, latestCursor }
    },
    readAfter(cursor) {
      if (!Number.isSafeInteger(cursor) || cursor < 0) throw new TypeError('replay cursor must be a non-negative integer')
      const oldestCursor = entries[0]?.cursor ?? 0
      const overflow = entries.length > 0 && cursor < oldestCursor - 1
      return {
        status: overflow ? 'overflow' : 'ok',
        requestedCursor: cursor,
        oldestCursor,
        latestCursor,
        closed,
        entries: Object.freeze(entries.filter((entry) => entry.cursor > cursor)),
      }
    },
    close() { closed = true },
  }
}

export interface PromptAdmission {
  readonly clientId: string
  readonly idempotencyKey: string
  readonly payload: unknown
}

export interface PromptReceipt {
  readonly id: string
  readonly clientId: string
  readonly idempotencyKey: string
  readonly payload: unknown
}

export type PromptAdmissionResult =
  | { readonly status: 'accepted'; readonly receipt: PromptReceipt }
  | { readonly status: 'duplicate'; readonly receipt: PromptReceipt }
  | { readonly status: 'conflict'; readonly error: AgentError }
  | { readonly status: 'closed' }

export interface PromptAdmissionStore {
  readonly size: number
  readonly closed: boolean
  admit(input: PromptAdmission): PromptAdmissionResult
  close(): void
}

function stablePromptValue(value: unknown, seen = new Set<object>()): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return `string:${JSON.stringify(value)}`
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return `${typeof value}:${String(value)}`
  if (typeof value === 'undefined') return 'undefined'
  if (typeof value !== 'object') throw new TypeError('prompt payload must contain serializable values')
  if (seen.has(value)) throw new TypeError('prompt payload must not be cyclic')
  seen.add(value)
  if (Array.isArray(value)) {
    const result = `[${value.map((item) => stablePromptValue(item, seen)).join(',')}]`
    seen.delete(value)
    return result
  }
  const result = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stablePromptValue((value as Record<string, unknown>)[key], seen)}`).join(',')
  seen.delete(value)
  return `{${result}}`
}

export function createPromptAdmissionStore(): PromptAdmissionStore {
  const records = new Map<string, { readonly fingerprint: string; readonly receipt: PromptReceipt }>()
  let closed = false
  let nextReceipt = 0
  return {
    get size() { return records.size },
    get closed() { return closed },
    admit(input) {
      if (closed) return { status: 'closed' }
      if (!input.clientId || !input.idempotencyKey) throw new TypeError('clientId and idempotencyKey must be non-empty')
      const key = `${input.clientId}\u0000${input.idempotencyKey}`
      const fingerprint = stablePromptValue(input.payload)
      const existing = records.get(key)
      if (existing) {
        return existing.fingerprint === fingerprint
          ? { status: 'duplicate', receipt: existing.receipt }
          : { status: 'conflict', error: createAgentError({ category: 'invalid-request', message: 'idempotency key was reused with a different payload', retryable: false, sessionValid: true, recoveryHint: 'use a new idempotency key' }) }
      }
      const receipt = Object.freeze({ id: `receipt-${++nextReceipt}`, clientId: input.clientId, idempotencyKey: input.idempotencyKey, payload: input.payload })
      records.set(key, { fingerprint, receipt })
      return { status: 'accepted', receipt }
    },
    close() { closed = true },
  }
}
