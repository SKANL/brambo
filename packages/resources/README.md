# @brambodev/resources

Provider-neutral measurement core for reclaiming agent-created filesystem state.

Three pure functions, no filesystem access and no runtime dependencies:

- `uniqueBytes(files)` — what a measurement actually occupies once hardlinks are charged
  their share. A file with four links contributes a quarter of its size to each name, so
  the same pnpm store inode measured across many worktrees is counted once.
- `classifyWorktree(state)` — whether a worktree may be reclaimed. Any dirty path, any
  unpushed commit, or a commit no remote can reach is `needs-review`, never `reclaimable`.
- `reclaimIdentity(target)` — an identity derived from repository plus worktree id, so two
  worktrees that share a directory name in different repositories never collide.

The scanning and reclaim verbs that consume these live above this package; this boundary
stays pure so the arithmetic that a reclaim plan rests on is testable without a disk.
