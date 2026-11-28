/**
 * What a worktree's git state says about whether its content is already safe.
 *
 * Every field is an OBSERVATION, never a guess: the counts come from
 * `git status --porcelain` and `git rev-list`, and the reachability flag from
 * asking whether any remote-tracking ref contains the worktree's `HEAD`.
 */
export interface WorktreeState {
  /** Paths `git status --porcelain` reports, tracked and untracked alike. */
  readonly dirtyPaths: number
  /** Commits `HEAD` carries that no remote-tracking ref reaches. */
  readonly unpushedCommits: number
  /** Whether at least one remote-tracking ref contains this worktree's `HEAD`. */
  readonly commitReachableFromRemote: boolean
}

/**
 * `reclaimable` means the worktree's content is already preserved somewhere this
 * machine does not own, so deleting it loses nothing.
 *
 * `needs-review` means it is not, and a human decides. The verdict is
 * deliberately two-valued: the 2026-11 audit found that "old" and "small" are
 * not evidence of anything, while a single dirty path, a single unpushed commit
 * or a commit no remote can reach was — in every case observed — real work that
 * a blind removal would have destroyed.
 */
export type ReclaimVerdict = 'reclaimable' | 'needs-review'

/**
 * Classifies one worktree from observations already taken.
 *
 * Every risk check is exhaustive before the safe answer is returned, so no
 * ordering of fields can let a worktree with lost work be called reclaimable.
 */
export function classifyWorktree(state: WorktreeState): ReclaimVerdict {
  if (!Number.isInteger(state.dirtyPaths) || state.dirtyPaths < 0) {
    throw new RangeError(`dirtyPaths must be a non-negative integer, received ${state.dirtyPaths}`)
  }
  if (!Number.isInteger(state.unpushedCommits) || state.unpushedCommits < 0) {
    throw new RangeError(
      `unpushedCommits must be a non-negative integer, received ${state.unpushedCommits}`,
    )
  }
  if (state.dirtyPaths > 0) return 'needs-review'
  if (state.unpushedCommits > 0) return 'needs-review'
  if (!state.commitReachableFromRemote) return 'needs-review'
  return 'reclaimable'
}
