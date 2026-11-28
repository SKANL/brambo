/** The pair a reclaim operation is addressed by. */
export interface ReclaimTarget {
  /** Absolute path of the repository the worktree was cut from. */
  readonly repositoryPath: string
  /** The worktree's id inside that repository. */
  readonly worktreeId: string
}

/**
 * Strips trailing `/` and `\` without a pattern.
 *
 * Deliberately not a regular expression: `[/\\]+$` over caller-supplied input is
 * the shape CodeQL reports as a potential runaway match, and a linear scan from
 * the end does the same work in one pass with nothing to backtrack.
 */
function trimTrailingSeparators(value: string): string {
  let end = value.length
  while (end > 0) {
    const code = value.charCodeAt(end - 1)
    if (code !== 0x2f && code !== 0x5c) break
    end -= 1
  }
  return value.slice(0, end)
}

/**
 * An identity for one worktree that no other worktree can share.
 *
 * The repository is part of the key because a directory name is not unique
 * across roots: the 2026-11 audit met two worktrees called `v040-integraciones`
 * in different repositories, and using the name alone made their backups
 * overwrite each other, destroying one 196-byte working diff.
 *
 * Trailing separators are stripped because `/srv/repo` and `/srv/repo/` name one
 * repository, and an identity that disagrees with itself is not an identity.
 * Case is NOT folded: this function reads no environment, so a caller on a
 * case-insensitive volume passes a canonical path rather than relying on a rule
 * that is invisible here.
 */
export function reclaimIdentity(target: ReclaimTarget): string {
  const repository = trimTrailingSeparators(target.repositoryPath)
  if (repository === '') {
    throw new TypeError('a reclaim identity needs a repository path')
  }
  if (target.worktreeId === '') {
    throw new TypeError('a reclaim identity needs a worktree id')
  }
  return `${repository}::${target.worktreeId}`
}
