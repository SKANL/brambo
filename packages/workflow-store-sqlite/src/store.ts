import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import {
  validateCommand, validateCommandReceipt, validateLease, validateRunSnapshot,
} from '@brambodev/contracts'
import type {
  Admission, Command, CommandReceipt, CommitInput, CommitResult, Lease, Principal,
  ReplayPage, RunEvent, RunKey, RunSnapshot, RunStore,
} from '@brambodev/contracts'
import { initializeSchema } from './schema.ts'
import { openDatabase, sqliteOperation, transaction, WorkflowStoreError } from './sqlite.ts'

// Object key order is not part of a JSON command's intent. Arrays retain order.
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`
}
function invalid(message: string): never {
  throw new WorkflowStoreError('BRAMBO_WORKFLOW_STORE_INVALID', message)
}
function integer(value: number, minimum = 0): void {
  if (!Number.isSafeInteger(value) || value < minimum) invalid('Expected a safe nonnegative integer')
}
function scopedKey(key: RunKey): void {
  validateCommand({ key, clientId: 'probe', idempotencyKey: 'probe', kind: 'start', payload: null })
}
function namespace(value: string): void { scopedKey({ namespace: value, runId: 'probe' }) }
function decodeReceipt(row: Record<string, unknown> | undefined): CommandReceipt | undefined {
  return row ? validateCommandReceipt(JSON.parse(String(row['receipt']))) : undefined
}
function decodeEvent(row: Record<string, unknown>, key: RunKey): RunEvent {
  const value: unknown = JSON.parse(String(row['event']))
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Invalid persisted event')
  const event = value as RunEvent
  const fields = ['schemaVersion', 'key', 'cursor', 'type', 'payload', 'occurredAt']
  if (Object.keys(event).length !== fields.length || fields.some((field) => !Object.hasOwn(event, field)) ||
      event.schemaVersion !== 1 || canonical(event.key) !== canonical(key) || event.cursor !== row['cursor'] ||
      typeof event.type !== 'string' || !event.type.trim() || typeof event.occurredAt !== 'string' ||
      !Number.isFinite(Date.parse(event.occurredAt))) invalid('Invalid persisted event envelope')
  integer(event.cursor, 1)
  validateCommand({ key: event.key, clientId: 'event', idempotencyKey: 'event', kind: 'continue', payload: event.payload })
  return event
}

class SqliteRunStore implements RunStore {
  private closed = false
  private readonly db: DatabaseSync
  private readonly now: () => number
  constructor(db: DatabaseSync, now: () => number) { this.db = db; this.now = now }
  private assertOpen(): void { if (this.closed) invalid('Workflow store is closed') }
  private run(key: RunKey): RunSnapshot | undefined {
    const row = this.db.prepare('SELECT snapshot FROM runs WHERE namespace = ? AND run_id = ?').get(key.namespace, key.runId)
    return row ? validateRunSnapshot(JSON.parse(String(row['snapshot']))) : undefined
  }
  private existing(command: Command): CommandReceipt | undefined {
    return decodeReceipt(this.db.prepare('SELECT receipt FROM receipts WHERE namespace = ? AND client_id = ? AND idempotency_key = ?')
      .get(command.key.namespace, command.clientId, command.idempotencyKey))
  }
  private checkedReceipt(command: Command, actor: Principal): CommandReceipt {
    return validateCommandReceipt({ id: randomUUID(), command: validateCommand(command), actor, phase: 'accepted' })
  }
  private duplicate(previous: CommandReceipt, proposed: CommandReceipt): Admission {
    return canonical(previous.command) === canonical(proposed.command) && canonical(previous.actor) === canonical(proposed.actor)
      ? { status: 'duplicate', receipt: previous } : { status: 'conflict' }
  }
  private insert(receipt: CommandReceipt): Admission {
    const { command } = receipt
    this.db.prepare('INSERT INTO receipts(namespace, id, client_id, idempotency_key, run_id, phase, receipt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(command.key.namespace, receipt.id, command.clientId, command.idempotencyKey, command.key.runId, receipt.phase, JSON.stringify(receipt))
    return { status: 'accepted', receipt: JSON.parse(JSON.stringify(receipt)) as CommandReceipt }
  }
  async create(snapshot: RunSnapshot, command: Command, actor: Principal): Promise<Admission> {
    this.assertOpen(); validateRunSnapshot(snapshot)
    const proposed = this.checkedReceipt(command, actor)
    if (snapshot.revision !== 0 || command.kind !== 'start' || canonical(snapshot.key) !== canonical(command.key)) {
      invalid('Creation requires revision zero and a matching start command')
    }
    return transaction(this.db, () => {
      const previous = this.existing(command)
      if (previous) return this.duplicate(previous, proposed)
      if (this.run(snapshot.key)) return { status: 'conflict' }
      this.db.prepare('INSERT INTO runs VALUES (?, ?, ?, ?)')
        .run(snapshot.key.namespace, snapshot.key.runId, snapshot.revision, JSON.stringify(snapshot))
      return this.insert(proposed)
    })
  }
  async admit(command: Command, actor: Principal): Promise<Admission> {
    this.assertOpen()
    const proposed = this.checkedReceipt(command, actor)
    return transaction(this.db, () => {
      const previous = this.existing(command)
      if (previous) return this.duplicate(previous, proposed)
      if (!this.run(command.key)) return { status: 'conflict' }
      return this.insert(proposed)
    })
  }
  async get(key: RunKey): Promise<RunSnapshot | undefined> {
    this.assertOpen(); scopedKey(key); return sqliteOperation(() => this.run(key))
  }
  async receipt(scope: string, id: string): Promise<CommandReceipt | undefined> {
    this.assertOpen(); namespace(scope)
    if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) invalid('Invalid receipt ID')
    return sqliteOperation(() => decodeReceipt(this.db.prepare('SELECT receipt FROM receipts WHERE namespace = ? AND id = ?').get(scope, id)))
  }
  async pending(scope: string, limit: number): Promise<readonly CommandReceipt[]> {
    this.assertOpen(); namespace(scope); integer(limit, 1)
    return sqliteOperation(() => this.db.prepare("SELECT receipt FROM receipts WHERE namespace = ? AND phase IN ('accepted', 'running') ORDER BY ordinal LIMIT ?")
      .all(scope, Math.min(limit, 256)).map((row) => decodeReceipt(row)!))
  }
  private authority(lease: Lease, current: RunSnapshot, next: RunSnapshot): boolean {
    if (lease.namespace !== current.key.namespace) return false
    const required = [`run:${current.key.runId}`, `workspace:${current.workspace.workspaceId}`, `workspace:${next.workspace.workspaceId}`]
    if (required.some((resource) => !Object.hasOwn(lease.epochs, resource))) return false
    const now = this.now()
    if (!Number.isFinite(now) || now < 0) invalid('Invalid authority clock')
    const hash = createHash('sha256').update(lease.token).digest('hex')
    const claim = this.db.prepare('SELECT owner_id, resources FROM lease_claims WHERE namespace = ? AND token_hash = ?').get(lease.namespace, hash)
    if (claim?.['owner_id'] !== lease.ownerId || claim['resources'] !== JSON.stringify(Object.keys(lease.epochs).sort())) return false
    return Object.entries(lease.epochs).every(([resource, epoch]) => {
      const row = this.db.prepare('SELECT * FROM resource_epochs WHERE namespace = ? AND resource = ?').get(lease.namespace, resource)
      return row?.['epoch'] === epoch && row['owner_id'] === lease.ownerId && row['token_hash'] === hash &&
        row['expires_at'] === lease.expiresAt && lease.expiresAt > now
    })
  }
  async commit(input: CommitInput): Promise<CommitResult> {
    this.assertOpen(); validateRunSnapshot(input.snapshot); validateLease(input.lease); integer(input.expectedRevision)
    if (input.snapshot.revision !== input.expectedRevision + 1) invalid('Commit must advance revision exactly once')
    if (!Array.isArray(input.events) || input.events.length > 256) invalid('Commit event batch exceeds 256')
    for (const event of input.events) {
      if (typeof event.type !== 'string' || event.type.trim() === '') invalid('Invalid event type')
      validateCommand({ key: input.snapshot.key, clientId: 'event', idempotencyKey: 'event', kind: 'continue', payload: event.payload })
    }
    if (input.receipt) validateCommandReceipt(input.receipt)
    return transaction(this.db, () => {
      const next = input.snapshot
      const current = this.run(next.key)
      if (!current || current.revision !== input.expectedRevision) return { status: 'conflict' }
      if (!this.authority(input.lease, current, next)) return { status: 'stale-lease' }
      if (next.workflowId !== current.workflowId || next.workflowVersion !== current.workflowVersion || next.sessionId !== current.sessionId ||
          canonical(next.lineage ?? null) !== canonical(current.lineage ?? null)) invalid('Run identity is immutable')
      if (input.receipt) {
        const previous = decodeReceipt(this.db.prepare('SELECT receipt FROM receipts WHERE namespace = ? AND id = ?').get(next.key.namespace, input.receipt.id))
        if (!previous || canonical(previous.command) !== canonical(input.receipt.command) || canonical(previous.actor) !== canonical(input.receipt.actor) ||
            canonical(previous.command.key) !== canonical(next.key)) invalid('Receipt provenance is immutable')
      }
      const row = this.db.prepare('SELECT COALESCE(MAX(cursor), 0) AS cursor FROM events WHERE namespace = ? AND run_id = ?').get(next.key.namespace, next.key.runId)
      let cursor = Number(row?.['cursor'])
      const time = this.now()
      if (!Number.isFinite(time) || time < 0) invalid('Invalid authority clock')
      const occurredAt = new Date(time).toISOString()
      this.db.prepare('UPDATE runs SET revision = ?, snapshot = ? WHERE namespace = ? AND run_id = ?')
        .run(next.revision, JSON.stringify(next), next.key.namespace, next.key.runId)
      for (const event of input.events) {
        integer(++cursor, 1)
        const stored: RunEvent = { schemaVersion: 1, key: next.key, cursor, type: event.type, payload: event.payload, occurredAt }
        this.db.prepare('INSERT INTO events VALUES (?, ?, ?, ?)').run(next.key.namespace, next.key.runId, cursor, JSON.stringify(stored))
      }
      if (input.receipt) this.db.prepare('UPDATE receipts SET phase = ?, receipt = ? WHERE namespace = ? AND id = ?')
        .run(input.receipt.phase, JSON.stringify(input.receipt), next.key.namespace, input.receipt.id)
      return { status: 'committed', snapshot: JSON.parse(JSON.stringify(next)) as RunSnapshot }
    })
  }
  async events(key: RunKey, after: number, limit: number): Promise<ReplayPage> {
    this.assertOpen(); scopedKey(key); integer(after); integer(limit, 1)
    // One read transaction makes latestCursor and the page a consistent observation.
    return sqliteOperation(() => {
      this.db.exec('BEGIN')
      try {
        const latest = this.db.prepare('SELECT COALESCE(MAX(cursor), 0) AS cursor FROM events WHERE namespace = ? AND run_id = ?').get(key.namespace, key.runId)
        const events = this.db.prepare('SELECT cursor, event FROM events WHERE namespace = ? AND run_id = ? AND cursor > ? ORDER BY cursor LIMIT ?')
          .all(key.namespace, key.runId, after, Math.min(limit, 256)).map((row) => decodeEvent(row, key))
        this.db.exec('COMMIT')
        return { status: events.length ? 'ok' : 'empty', events, latestCursor: Number(latest?.['cursor']), nextCursor: events.at(-1)?.cursor ?? after }
      } catch (error) { this.db.exec('ROLLBACK'); throw error }
    })
  }
  private unavailable(): never {
    this.assertOpen()
    throw new WorkflowStoreError('BRAMBO_WORKFLOW_LEASE_UNAVAILABLE', 'Public lease operations are not implemented yet')
  }
  async claim(): Promise<never> { return this.unavailable() }
  async renew(): Promise<never> { return this.unavailable() }
  async release(): Promise<never> { return this.unavailable() }
  async valid(): Promise<never> { return this.unavailable() }
  async close(): Promise<void> { if (!this.closed) { this.db.close(); this.closed = true } }
}

export async function openSqliteRunStore(options: { path: string; now?: () => number }): Promise<RunStore> {
  if (typeof options.path !== 'string' || options.path.trim() === '') invalid('SQLite path is required')
  const db = await openDatabase(options.path)
  try { initializeSchema(db); return new SqliteRunStore(db, options.now ?? Date.now) }
  catch (error) { db.close(); throw error }
}
