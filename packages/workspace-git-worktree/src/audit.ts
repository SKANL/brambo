import { stat } from 'node:fs/promises'
import {
  buildReclaimPlan,
  classifyWorktree,
  reclaimIdentity,
  scanTree,
  type ReclaimPlan,
  type ReclaimVerdict,
  type ScanOutcome,
} from '@brambodev/resources'
import { expiryOf, type ExpiryOptions, type ExpiryVerdict } from './expiry.ts'
import { git } from './git.ts'
import { WorktreeLedger, type WorktreeRecord } from './ledger.ts'

/** What git itself reports about one checkout. Every field is an observation. */
export interface WorktreeObservation {
  readonly dirtyPaths: number
  readonly unpushedCommits: number
  readonly commitReachableFromRemote: boolean
}

/**
 * A checkout that could be asked, or one that is no longer there.
 *
 * Absence is its own answer rather than an empty observation: a directory that
 * vanished cannot prove anything about where its commit went, and treating "no
 * output" as "clean" is how a removal gets authorised by a missing tree.
 */
export type ObservedWorktree =
  | { readonly kind: 'observed'; readonly observation: WorktreeObservation }
  | { readonly kind: 'absent' }

export interface WorktreeAuditEntry {
  readonly record: WorktreeRecord
  /** Repository plus worktree id, never a display name. */
  readonly identity: string
  readonly expiry: ExpiryVerdict
  readonly classification: ReclaimVerdict
  readonly observation: WorktreeObservation
  readonly measurement: ScanOutcome
}

export interface WorktreeAudit {
  readonly entries: readonly WorktreeAuditEntry[]
  readonly plan: ReclaimPlan
}

/**
 * A lapsed lease on its own reclaims nothing: only a lapsed lease on a tree that
 * git reports clean and remotely anchored is `reclaimable`. Keeping the two
 * facts separate means a caller can see WHY a candidate is held back.
 */
export function planVerdict(expiry: ExpiryVerdict, classification: ReclaimVerdict): ReclaimVerdict {
  return expiry === 'expired' && classification === 'reclaimable' ? 'reclaimable' : 'needs-review'
}

/**
 * Reads one checkout's git state. Read-only: no fetch, no worktree mutation.
 *
 * `--not --remotes` and `branch -r --contains` answer with the remote-tracking
 * refs this repository already has. The caller decides whether those are fresh;
 * this verb never reaches the network, because an audit that fetches is an audit
 * that changes what it measures.
 */
export async function observeWorktree(path: string): Promise<ObservedWorktree> {
  let stats
  try {
    stats = await stat(path)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return { kind: 'absent' }
    throw error
  }
  if (!stats.isDirectory()) return { kind: 'absent' }

  const status = await git(path, ['status', '--porcelain'])
  const dirtyPaths = status.split(/\r?\n/).filter((line) => line.trim() !== '').length

  const counted = Number.parseInt((await git(path, ['rev-list', '--count', 'HEAD', '--not', '--remotes'])).trim(), 10)
  const unpushedCommits = Number.isFinite(counted) && counted >= 0 ? counted : 0

  const containing = (await git(path, ['branch', '-r', '--contains', 'HEAD']))
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')

  return {
    kind: 'observed',
    observation: {
      dirtyPaths,
      unpushedCommits,
      commitReachableFromRemote: containing.length > 0,
    },
  }
}

/**
 * One pass over every worktree brambo owns: git state, measurement, lease and
 * the plan a human approves.
 *
 * A record whose directory is gone keeps `needs-review` even when its lease has
 * lapsed, because nothing could be observed about its commit. Reporting it as
 * reclaimable would let a missing tree authorise its own retirement.
 */
export async function auditWorktrees(
  stateDir: string,
  options: ExpiryOptions,
): Promise<WorktreeAudit> {
  const records = await new WorktreeLedger(stateDir).listRecords()
  const entries: WorktreeAuditEntry[] = []

  for (const record of records) {
    const measurement = await scanTree(record.path)
    const observed = await observeWorktree(record.path)
    const observation: WorktreeObservation =
      observed.kind === 'observed'
        ? observed.observation
        : { dirtyPaths: 0, unpushedCommits: 0, commitReachableFromRemote: false }

    entries.push({
      record,
      identity: reclaimIdentity({ repositoryPath: record.repoPath, worktreeId: record.id }),
      expiry: expiryOf(record, options),
      classification: classifyWorktree(observation),
      observation,
      measurement,
    })
  }

  const plan = buildReclaimPlan(
    entries.map((entry) => ({
      identity: entry.identity,
      verdict: planVerdict(entry.expiry, entry.classification),
      logicalBytes: entry.measurement.kind === 'measured' ? entry.measurement.logicalBytes : 0,
      uniqueBytes: entry.measurement.kind === 'measured' ? entry.measurement.uniqueBytes : 0,
    })),
  )

  return { entries, plan }
}
