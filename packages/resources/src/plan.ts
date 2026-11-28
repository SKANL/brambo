import type { ReclaimVerdict } from './classify.ts'

/**
 * One worktree as a reclaim plan sees it: already classified, already measured.
 *
 * `identity` must come from `reclaimIdentity`, which folds the repository in.
 * A display name is not an identity: the 2026-11 audit met two worktrees called
 * `v040-integraciones` in different repositories, and the plan below refuses
 * that pair rather than letting one overwrite the other's backup.
 */
export interface ReclaimCandidate {
  readonly identity: string
  readonly verdict: ReclaimVerdict
  /** Every name's size added up: what a naive report shows. */
  readonly logicalBytes: number
  /** What a removal would actually free, hardlinks charged their share. */
  readonly uniqueBytes: number
}

export interface ReclaimTotals {
  readonly logicalBytes: number
  readonly uniqueBytes: number
  readonly reclaimableUniqueBytes: number
  readonly needsReviewUniqueBytes: number
}

export interface ReclaimPlan {
  /** Safe now, largest unique footprint first. */
  readonly reclaimable: readonly ReclaimCandidate[]
  /** A human decides, largest unique footprint first. */
  readonly needsReview: readonly ReclaimCandidate[]
  readonly totals: ReclaimTotals
}

/**
 * Turns classified, measured candidates into the plan a human approves.
 *
 * The split is the whole product: `reclaimable` is what can go without a
 * decision, `needsReview` is what cannot. Totals report unique bytes, never
 * logical ones — 8 of 62 worktrees classified clean in the 2026-11 audit freed
 * 0.17 GB because their content was hardlinked `node_modules`, and a plan that
 * had promised logical bytes would have been wrong by two orders of magnitude.
 *
 * Ordering is deterministic (`uniqueBytes` descending, then identity) so two
 * runs over the same machine print the same plan and a diff between them means
 * something changed.
 */
export function buildReclaimPlan(candidates: readonly ReclaimCandidate[]): ReclaimPlan {
  const seen = new Set<string>()
  let logicalBytes = 0
  let uniqueBytes = 0
  let reclaimableUniqueBytes = 0
  let needsReviewUniqueBytes = 0

  for (const candidate of candidates) {
    if (seen.has(candidate.identity)) {
      throw new TypeError(
        `two reclaim candidates share the identity '${candidate.identity}'; one backup would overwrite the other`,
      )
    }
    seen.add(candidate.identity)
    assertBytes(candidate.logicalBytes, 'logicalBytes', candidate.identity)
    assertBytes(candidate.uniqueBytes, 'uniqueBytes', candidate.identity)
    logicalBytes += candidate.logicalBytes
    uniqueBytes += candidate.uniqueBytes
    if (candidate.verdict === 'reclaimable') reclaimableUniqueBytes += candidate.uniqueBytes
    else needsReviewUniqueBytes += candidate.uniqueBytes
  }

  return {
    reclaimable: sortedByFootprint(
      candidates.filter((candidate) => candidate.verdict === 'reclaimable'),
    ),
    needsReview: sortedByFootprint(
      candidates.filter((candidate) => candidate.verdict !== 'reclaimable'),
    ),
    totals: { logicalBytes, uniqueBytes, reclaimableUniqueBytes, needsReviewUniqueBytes },
  }
}

function sortedByFootprint(candidates: ReclaimCandidate[]): ReclaimCandidate[] {
  return candidates.sort(
    (left, right) =>
      right.uniqueBytes - left.uniqueBytes ||
      (left.identity < right.identity ? -1 : left.identity > right.identity ? 1 : 0),
  )
}

function assertBytes(value: number, field: string, identity: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `candidate '${identity}' reports an impossible ${field} of ${value}; a plan cannot under-report what a removal frees`,
    )
  }
}
