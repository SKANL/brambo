import { BramboError, BRAMBO_ERROR_CODES } from './errors.ts'
import type { StandardSchemaV1 } from './standard-schema.ts'
import { defineStandardSchema } from './standard-schema.ts'
import type { JsonObject, JsonValue } from './tool-execution.ts'

export type RunStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'blocked'
export type TaskPhase = RunStatus | 'uncertain'
export interface RunKey { readonly namespace: string; readonly runId: string }
export interface WorkspaceRef { readonly namespace: string; readonly workspaceId: string; readonly revision: string }
export interface Principal { readonly namespace: string; readonly subject: string }
export interface ProviderBinding {
  readonly driverId: string
  readonly driverVersion: string
  readonly providerId: string
  readonly accountRef: string
  readonly nativeSessionId?: string
  readonly compatibility: JsonObject
}
export interface TaskCheckpoint {
  readonly taskId: string
  readonly phase: TaskPhase
  readonly attempt: number
  /** Current effect pointer, not a journal of all effects. */
  readonly effectId?: string
  readonly result?: JsonValue
  readonly workspace?: WorkspaceRef
  readonly error?: { readonly code: string; readonly message: string }
}
export interface RunSnapshot {
  readonly schemaVersion: 1
  readonly key: RunKey
  readonly revision: number
  readonly workflowId: string
  readonly workflowVersion: string
  readonly sessionId: string
  readonly status: RunStatus
  readonly workspace: WorkspaceRef
  readonly binding?: ProviderBinding
  readonly tasks: readonly TaskCheckpoint[]
  readonly context: JsonValue
  readonly lineage?: RunKey
  readonly cancelRequested: boolean
}
export interface RunEvent {
  readonly schemaVersion: 1
  readonly key: RunKey
  /** Monotonic within this run, not across tenants. */
  readonly cursor: number
  readonly type: string
  readonly payload: JsonValue
  readonly occurredAt: string
}
/** Caller intent only: an authenticated host supplies actor provenance separately. */
export interface Command {
  readonly key: RunKey
  readonly clientId: string
  readonly idempotencyKey: string
  readonly kind: 'start' | 'continue' | 'cancel'
  readonly payload: JsonValue
}
export interface CommandReceipt {
  readonly id: string
  readonly command: Command
  readonly actor: Principal
  readonly phase: 'accepted' | 'running' | 'completed' | 'blocked'
  readonly outcome?: JsonValue
}
/** Transient authority. Never persist the token in workflow records or provider context. */
export interface Lease {
  readonly namespace: string
  readonly ownerId: string
  readonly token: string
  readonly expiresAt: number
  /** Exact resource set: run:<id>, task:<runId>:<taskId>, workspace:<id>. */
  readonly epochs: Readonly<Record<string, number>>
}
export interface ReplayPage {
  readonly status: 'ok' | 'empty' | 'overflow'
  readonly events: readonly RunEvent[]
  readonly latestCursor: number
  readonly nextCursor: number
  readonly snapshot?: RunSnapshot
}
export interface CommitInput {
  readonly snapshot: RunSnapshot
  readonly expectedRevision: number
  /** Parent owner authority; independent of a child's publication lease. */
  readonly lease: Lease
  readonly events: readonly { readonly type: string; readonly payload: JsonValue }[]
  readonly receipt?: CommandReceipt
}
export type CommitResult = { readonly status: 'committed'; readonly snapshot: RunSnapshot } |
  { readonly status: 'conflict' | 'stale-lease' }
export type Admission = { readonly status: 'accepted' | 'duplicate'; readonly receipt: CommandReceipt } |
  { readonly status: 'conflict' }
export type ClaimResult = { readonly status: 'acquired'; readonly lease: Lease } | { readonly status: 'contended' }

/** Canonical claim required to commit a run while keeping its workspace writable. */
export function leaseResources(key: RunKey, workspaceId: string): readonly string[] {
  durableKey(key)
  durableId(workspaceId)
  return ['run:' + key.runId, 'workspace:' + workspaceId]
}

/** Durable APIs are additive; legacy synchronous stores remain unchanged. */
export interface PendingFilter {
  readonly key: RunKey
  readonly kind?: Command['kind']
}

/** A scoped pending query must apply this filter before its bounded page limit. */
export function validatePendingFilter(value: unknown, namespace: string): PendingFilter {
  const record = durableRecord(value, ['key'], ['kind'])
  const key = durableKey(record['key'])
  if (key.namespace !== namespace) durableReject('pending filter namespace mismatch')
  if (Object.hasOwn(record, 'kind') && !['start', 'continue', 'cancel'].includes(record['kind'] as string)) durableReject('invalid pending filter kind')
  return value as PendingFilter
}

export interface RunStore {
  /** Atomically create and admit; actor comes from the trusted host, never the body. */
  create(snapshot: RunSnapshot, command: Command, actor: Principal): Promise<Admission>
  admit(command: Command, actor: Principal): Promise<Admission>
  get(key: RunKey): Promise<RunSnapshot | undefined>
  receipt(namespace: string, id: string): Promise<CommandReceipt | undefined>
  pending(namespace: string, limit: number, filter?: PendingFilter): Promise<readonly CommandReceipt[]>
  /** CAS requires current run and applicable workspace epochs in the parent lease. */
  commit(input: CommitInput): Promise<CommitResult>
  events(key: RunKey, after: number, limit: number): Promise<ReplayPage>
  /** Acquire sorted unique resources atomically; retain epochs after release. */
  claim(namespace: string, resources: readonly string[], ownerId: string, ttlMs: number): Promise<ClaimResult>
  /** The host assigns exactly one renewal owner per lease. */
  renew(lease: Lease, ttlMs: number): Promise<ClaimResult>
  release(lease: Lease): Promise<void>
  /** Current authority check, not authorization for arbitrary resource scope. */
  valid(lease: Lease): Promise<boolean>
  close(): Promise<void>
}

// Shared validation primitives stay in this lower contracts module, with no
// kernel/provider imports. They are internal to the package, not root exports.
/** @internal */
export function durableReject(message: string): never {
  throw new BramboError(BRAMBO_ERROR_CODES.contractEnvelopeInvalid, `schema violation: ${message}`)
}
/** @internal */
export function durableRecord(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) durableReject('expected a plain object')
  const allowed = new Set([...required, ...optional])
  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) durableReject('unexpected object field')
    const descriptor = descriptors[key]
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) durableReject('fields must be enumerable data properties')
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) durableReject(`missing ${key}`)
  }
  return value as Record<string, unknown>
}
/** @internal */
export function durableString(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) durableReject('expected a non-empty string')
}
/** @internal */
export function durableId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) durableReject('unsafe scoped identifier')
}
/** @internal */
export function durableInteger(value: unknown, minimum = 0): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || Object.is(value, -0)) {
    durableReject('expected a safe nonnegative integer')
  }
}
/** @internal */
export function durableJson(value: unknown): asserts value is JsonValue {
  // An explicit traversal avoids stack overflow on deeply nested untrusted JSON.
  // Active-path tracking rejects cycles but admits repeated noncyclic values.
  const active = new Set<object>()
  const stack: { value: unknown; leaving?: boolean }[] = [{ value }]
  while (stack.length > 0) {
    const entry = stack.pop()!
    const current = entry.value
    if (entry.leaving) { active.delete(current as object); continue }
    if (current === null || typeof current === 'string' || typeof current === 'boolean') continue
    if (typeof current === 'number') {
      if (!Number.isFinite(current) || Object.is(current, -0)) durableReject('JSON numbers must round-trip without loss')
      continue
    }
    if (typeof current !== 'object') durableReject('unsupported JSON value')
    if (active.has(current)) durableReject('cyclic JSON value')
    const array = Array.isArray(current)
    if (array ? Object.getPrototypeOf(current) !== Array.prototype :
        ![Object.prototype, null].includes(Object.getPrototypeOf(current))) durableReject('prototype-bearing JSON value')
    active.add(current)
    stack.push({ value: current, leaving: true })
    const descriptors = Object.getOwnPropertyDescriptors(current)
    const keys = Reflect.ownKeys(current)
    if (array && keys.length !== current.length + 1) durableReject('sparse or decorated JSON array')
    for (const key of keys) {
      if (array && key === 'length') continue
      if (typeof key !== 'string') durableReject('symbol JSON key')
      const descriptor = descriptors[key]
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) durableReject('JSON must contain enumerable data properties')
      if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= current.length)) durableReject('decorated JSON array')
      stack.push({ value: descriptor.value })
    }
  }
}
/** @internal */
export function durableSchema<T>(validate: (value: unknown) => T): StandardSchemaV1<T> {
  return defineStandardSchema<T>((value) => {
    try { return { value: validate(value) } } catch (error) {
      if (!(error instanceof BramboError)) throw error
      return { issues: [{ message: error.message }] }
    }
  })
}
/** @internal */
export function durableKey(value: unknown): RunKey {
  const record = durableRecord(value, ['namespace', 'runId'])
  durableId(record['namespace']); durableId(record['runId'])
  return value as RunKey
}
/** @internal */
export function durableWorkspace(value: unknown, namespace?: string): WorkspaceRef {
  const record = durableRecord(value, ['namespace', 'workspaceId', 'revision'])
  durableId(record['namespace']); durableId(record['workspaceId']); durableString(record['revision'])
  if (namespace !== undefined && record['namespace'] !== namespace) durableReject('workspace namespace mismatch')
  return value as WorkspaceRef
}
/** @internal */
export function durableBinding(value: unknown): ProviderBinding {
  const record = durableRecord(value, ['driverId', 'driverVersion', 'providerId', 'accountRef', 'compatibility'], ['nativeSessionId'])
  durableId(record['driverId']); durableId(record['providerId'])
  durableString(record['driverVersion']); durableString(record['accountRef'])
  if (Object.hasOwn(record, 'nativeSessionId')) durableString(record['nativeSessionId'])
  durableJson(record['compatibility'])
  if (record['compatibility'] === null || typeof record['compatibility'] !== 'object' || Array.isArray(record['compatibility'])) {
    durableReject('compatibility must be a JSON object')
  }
  return value as ProviderBinding
}
const RUN_STATUSES: readonly unknown[] = ['pending', 'running', 'succeeded', 'failed', 'cancelled', 'blocked']

export function validateRunSnapshot(value: unknown): RunSnapshot {
  durableJson(value)
  const record = durableRecord(value, ['schemaVersion', 'key', 'revision', 'workflowId', 'workflowVersion', 'sessionId', 'status', 'workspace', 'tasks', 'context', 'cancelRequested'], ['binding', 'lineage'])
  if (record['schemaVersion'] !== 1) durableReject('unsupported schema version')
  const key = durableKey(record['key'])
  durableInteger(record['revision']); durableId(record['workflowId'])
  durableString(record['workflowVersion']); durableId(record['sessionId'])
  if (!RUN_STATUSES.includes(record['status'])) durableReject('invalid run status')
  durableWorkspace(record['workspace'], key.namespace)
  if (Object.hasOwn(record, 'binding')) durableBinding(record['binding'])
  if (Object.hasOwn(record, 'lineage') && durableKey(record['lineage']).namespace !== key.namespace) durableReject('lineage namespace mismatch')
  if (typeof record['cancelRequested'] !== 'boolean') durableReject('cancelRequested must be boolean')
  if (!Array.isArray(record['tasks'])) durableReject('tasks must be an array')
  const ids = new Set<string>()
  for (const value of record['tasks']) {
    const task = durableRecord(value, ['taskId', 'phase', 'attempt'], ['effectId', 'result', 'workspace', 'error'])
    durableId(task['taskId']); durableInteger(task['attempt'])
    if (ids.has(task['taskId'])) durableReject('duplicate task ID')
    ids.add(task['taskId'])
    if (![...RUN_STATUSES, 'uncertain'].includes(task['phase'])) durableReject('invalid task phase')
    if (Object.hasOwn(task, 'effectId')) durableId(task['effectId'])
    if (Object.hasOwn(task, 'workspace')) durableWorkspace(task['workspace'], key.namespace)
    if (Object.hasOwn(task, 'error')) {
      const error = durableRecord(task['error'], ['code', 'message'])
      durableString(error['code']); durableString(error['message'])
    }
  }
  return value as unknown as RunSnapshot
}
export function validateCommand(value: unknown): Command {
  durableJson(value)
  const record = durableRecord(value, ['key', 'clientId', 'idempotencyKey', 'kind', 'payload'])
  durableKey(record['key']); durableId(record['clientId']); durableString(record['idempotencyKey'])
  if (!['start', 'continue', 'cancel'].includes(record['kind'] as string)) durableReject('invalid command kind')
  return value as unknown as Command
}
export function validateCommandReceipt(value: unknown): CommandReceipt {
  durableJson(value)
  const record = durableRecord(value, ['id', 'command', 'actor', 'phase'], ['outcome'])
  durableId(record['id'])
  const command = validateCommand(record['command'])
  const actor = durableRecord(record['actor'], ['namespace', 'subject'])
  durableId(actor['namespace']); durableString(actor['subject'])
  if (actor['namespace'] !== command.key.namespace) durableReject('receipt actor namespace mismatch')
  if (!['accepted', 'running', 'completed', 'blocked'].includes(record['phase'] as string)) durableReject('invalid receipt phase')
  return value as unknown as CommandReceipt
}
export function validateLease(value: unknown): Lease {
  durableJson(value)
  const record = durableRecord(value, ['namespace', 'ownerId', 'token', 'expiresAt', 'epochs'])
  durableId(record['namespace']); durableId(record['ownerId']); durableString(record['token'])
  if (typeof record['expiresAt'] !== 'number' || !Number.isFinite(record['expiresAt']) || record['expiresAt'] < 0) durableReject('invalid lease expiration')
  const epochs = record['epochs']
  if (epochs === null || typeof epochs !== 'object' || Array.isArray(epochs) || Object.keys(epochs).length === 0) durableReject('lease must cover resources')
  for (const [resource, epoch] of Object.entries(epochs)) {
    const [kind, ...ids] = resource.split(':')
    if (!((kind === 'run' || kind === 'workspace') && ids.length === 1 || kind === 'task' && ids.length === 2)) {
      durableReject('invalid scoped resource key')
    }
    ids.forEach(durableId); durableInteger(epoch, 1)
  }
  return value as unknown as Lease
}
export const RUN_SNAPSHOT_SCHEMA = durableSchema(validateRunSnapshot)
export const COMMAND_SCHEMA = durableSchema(validateCommand)
export const COMMAND_RECEIPT_SCHEMA = durableSchema(validateCommandReceipt)
export const LEASE_SCHEMA = durableSchema(validateLease)
