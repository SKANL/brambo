import { WorktreeLedger, type WorktreeRecord } from './ledger.ts'

/** A lease window and the instant it is judged against. */
export interface ExpiryOptions {
  /** How long a worktree may go unrenewed before it is a reclaim candidate. */
  readonly ttlMs: number
  /** Milliseconds since the epoch, injected so expiry needs no clock and no wait. */
  readonly now: number
}

export type ExpiryVerdict = 'expired' | 'held'

/**
 * Whether one worktree's lease has lapsed.
 *
 * `lastSeenAt` is the renewal stamp; a record written before leases existed has
 * none, and `createdAt` is the honest fallback: it is the last moment brambo is
 * known to have had a reason for the tree to exist.
 *
 * A record whose timestamps cannot be parsed is `held`, never `expired`. Failing
 * closed here is not defensiveness for its own sake: an expired verdict feeds a
 * removal, and a removal of a worktree with a commit on a detached HEAD destroys
 * that commit. Corrupt metadata must not be able to authorise that.
 */
export function expiryOf(record: WorktreeRecord, options: ExpiryOptions): ExpiryVerdict {
  if (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0) {
    throw new RangeError(`a lease window must be a positive number of milliseconds, received ${options.ttlMs}`)
  }
  const lastSeen = Date.parse(record.lastSeenAt ?? record.createdAt)
  if (!Number.isFinite(lastSeen) || !Number.isFinite(options.now)) return 'held'
  return options.now - lastSeen >= options.ttlMs ? 'expired' : 'held'
}

/**
 * Every owned record whose lease has lapsed, in id order.
 *
 * This produces CANDIDATES, not removals. A lapsed lease says nobody renewed the
 * worktree; it says nothing about whether removing it loses work. That question
 * is `classifyWorktree`'s, and the removal itself still goes through
 * `removeWorktree`, which refuses a tree git reports as dirty.
 */
export async function expiredWorktrees(
  stateDir: string,
  options: ExpiryOptions,
): Promise<WorktreeRecord[]> {
  const records = await new WorktreeLedger(stateDir).listRecords()
  return records
    .filter((record) => expiryOf(record, options) === 'expired')
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
}
