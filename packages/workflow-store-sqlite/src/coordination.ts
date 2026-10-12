import { createHash, randomBytes } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { validateLease } from '@brambodev/contracts'
import type { ClaimResult, Lease } from '@brambodev/contracts'
import { sqliteOperation, transaction, WorkflowStoreError } from './sqlite.ts'

interface ClaimInput {
  readonly namespace: string
  readonly resources: readonly string[]
  readonly ownerId: string
  readonly ttlMs: number
}

function invalid(message: string): never {
  throw new WorkflowStoreError('BRAMBO_WORKFLOW_STORE_INVALID', message)
}

function checkedInput(input: ClaimInput): { namespace: string; resources: string[]; ownerId: string; ttlMs: number } {
  if (!Array.isArray(input.resources) || input.resources.length === 0) invalid('A lease must claim at least one resource')
  if (!Number.isSafeInteger(input.ttlMs) || input.ttlMs <= 0) invalid('Lease duration must be a positive safe integer')
  if (!input.resources.every((resource) => typeof resource === 'string')) invalid('Lease resources must be strings')
  const resources = [...new Set(input.resources)].sort()
  validateLease({
    namespace: input.namespace, ownerId: input.ownerId, token: 'validation-probe', expiresAt: 1,
    epochs: Object.fromEntries(resources.map((resource) => [resource, 1])),
  })
  return { namespace: input.namespace, resources, ownerId: input.ownerId, ttlMs: input.ttlMs }
}

function clockNow(now: () => number): number {
  const value = now()
  if (!Number.isSafeInteger(value) || value < 0) invalid('Invalid authority clock')
  return value
}

function expiresAtFor(time: number, ttlMs: number): number {
  const expiresAt = time + ttlMs
  if (!Number.isSafeInteger(expiresAt)) invalid('Lease expiration exceeds the supported clock range')
  return expiresAt
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function resourcesFor(lease: Lease): string[] {
  return Object.keys(lease.epochs).sort()
}

/** Requires exact immutable claim membership, current token/epoch/expiry, and unexpired authority. */
export function isSqliteLeaseCurrent(db: DatabaseSync, lease: Lease, now: number): boolean {
  validateLease(lease)
  if (lease.expiresAt <= now) return false
  const hash = tokenHash(lease.token)
  const resources = resourcesFor(lease)
  const claim = db.prepare('SELECT owner_id, resources FROM lease_claims WHERE namespace = ? AND token_hash = ?')
    .get(lease.namespace, hash)
  if (claim?.['owner_id'] !== lease.ownerId || claim['resources'] !== JSON.stringify(resources)) return false
  for (const [resource, epoch] of Object.entries(lease.epochs)) {
    const row = db.prepare('SELECT epoch, owner_id, token_hash, expires_at FROM resource_epochs WHERE namespace = ? AND resource = ?')
      .get(lease.namespace, resource)
    if (row?.['epoch'] !== epoch || row['owner_id'] !== lease.ownerId || row['token_hash'] !== hash ||
        row['expires_at'] !== lease.expiresAt) return false
  }
  return true
}

function matchingClaim(db: DatabaseSync, lease: Lease): boolean {
  const hash = tokenHash(lease.token)
  const claim = db.prepare('SELECT owner_id, resources FROM lease_claims WHERE namespace = ? AND token_hash = ?')
    .get(lease.namespace, hash)
  return claim?.['owner_id'] === lease.ownerId &&
    claim['resources'] === JSON.stringify(resourcesFor(lease)) &&
    Object.entries(lease.epochs).every(([resource, epoch]) => {
      const row = db.prepare('SELECT epoch, owner_id, token_hash, expires_at FROM resource_epochs WHERE namespace = ? AND resource = ?')
        .get(lease.namespace, resource)
      return row?.['epoch'] === epoch && row['owner_id'] === lease.ownerId && row['token_hash'] === hash &&
        row['expires_at'] === lease.expiresAt
    })
}

export function claimSqliteLease(db: DatabaseSync, input: ClaimInput, now: () => number): ClaimResult {
  const checked = checkedInput(input)
  return transaction(db, () => {
    const time = clockNow(now)
    const expiresAt = expiresAtFor(time, checked.ttlMs)
    const existing = checked.resources.map((resource) =>
      db.prepare('SELECT epoch, owner_id, token_hash, expires_at FROM resource_epochs WHERE namespace = ? AND resource = ?')
        .get(checked.namespace, resource))
    if (existing.some((row) => row?.['token_hash'] !== null && row?.['token_hash'] !== undefined &&
        row['owner_id'] !== null && row['expires_at'] !== null && Number(row['expires_at']) > time)) {
      return { status: 'contended' as const }
    }

    const token = randomBytes(32).toString('base64url')
    const hash = tokenHash(token)
    const epochs: Record<string, number> = {}
    for (let index = 0; index < checked.resources.length; index++) {
      const resource = checked.resources[index]!
      const prior = existing[index]?.['epoch']
      const epoch = prior === undefined ? 1 : Number(prior) + 1
      if (!Number.isSafeInteger(epoch) || epoch < 1) invalid('Resource fencing epoch is invalid')
      epochs[resource] = epoch
    }
    // Claims whose token no longer holds any unexpired resource row are not current (released,
    // superseded or expired). Fencing epochs live in resource_epochs, which is never pruned.
    db.prepare('DELETE FROM lease_claims WHERE namespace = ? AND token_hash NOT IN ' +
      '(SELECT token_hash FROM resource_epochs WHERE namespace = ? AND token_hash IS NOT NULL AND expires_at > ?)')
      .run(checked.namespace, checked.namespace, time)
    db.prepare('INSERT INTO lease_claims(namespace, token_hash, owner_id, resources) VALUES (?, ?, ?, ?)')
      .run(checked.namespace, hash, checked.ownerId, JSON.stringify(checked.resources))
    const update = db.prepare('INSERT INTO resource_epochs(namespace, resource, epoch, owner_id, token_hash, expires_at)\n' +
      'VALUES (?, ?, ?, ?, ?, ?)\n' +
      'ON CONFLICT(namespace, resource) DO UPDATE SET\n' +
      'epoch = excluded.epoch, owner_id = excluded.owner_id, token_hash = excluded.token_hash, expires_at = excluded.expires_at')
    for (const [resource, epoch] of Object.entries(epochs)) {
      update.run(checked.namespace, resource, epoch, checked.ownerId, hash, expiresAt)
    }
    const lease = validateLease({ namespace: checked.namespace, ownerId: checked.ownerId, token, expiresAt, epochs })
    return { status: 'acquired' as const, lease }
  })
}

export function renewSqliteLease(db: DatabaseSync, lease: Lease, ttlMs: number, now: () => number): ClaimResult {
  validateLease(lease)
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) invalid('Lease duration must be a positive safe integer')
  return transaction(db, () => {
    const time = clockNow(now)
    if (!isSqliteLeaseCurrent(db, lease, time)) return { status: 'contended' as const }
    const expiresAt = expiresAtFor(time, ttlMs)
    const update = db.prepare('UPDATE resource_epochs SET expires_at = ?\n' +
      'WHERE namespace = ? AND resource = ? AND epoch = ? AND owner_id = ? AND token_hash = ? AND expires_at = ?')
    const hash = tokenHash(lease.token)
    for (const [resource, epoch] of Object.entries(lease.epochs)) {
      const result = update.run(expiresAt, lease.namespace, resource, epoch, lease.ownerId, hash, lease.expiresAt)
      if (result.changes !== 1) invalid('Lease changed during atomic renewal')
    }
    return { status: 'acquired' as const, lease: { ...lease, expiresAt } }
  })
}

export function releaseSqliteLease(db: DatabaseSync, lease: Lease): void {
  validateLease(lease)
  transaction(db, () => {
    if (!matchingClaim(db, lease)) return
    const hash = tokenHash(lease.token)
    const release = db.prepare('UPDATE resource_epochs SET owner_id = NULL, token_hash = NULL, expires_at = NULL\n' +
      'WHERE namespace = ? AND resource = ? AND epoch = ? AND owner_id = ? AND token_hash = ? AND expires_at = ?')
    for (const [resource, epoch] of Object.entries(lease.epochs)) {
      const result = release.run(lease.namespace, resource, epoch, lease.ownerId, hash, lease.expiresAt)
      if (result.changes !== 1) invalid('Lease changed during atomic release')
    }
    db.prepare('DELETE FROM lease_claims WHERE namespace = ? AND token_hash = ?').run(lease.namespace, hash)
  })
}

export function validSqliteLease(db: DatabaseSync, lease: Lease, now: () => number): boolean {
  validateLease(lease)
  return sqliteOperation(() => {
    db.exec('BEGIN')
    try {
      const valid = isSqliteLeaseCurrent(db, lease, clockNow(now))
      db.exec('COMMIT')
      return valid
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  })
}
