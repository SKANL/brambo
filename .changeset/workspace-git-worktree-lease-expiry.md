---
'@brambodev/workspace-git-worktree': minor
---

Add worktree lease renewal, expiry and audit: `WorktreeLedger.touch` and `listRecords`, optional `lastSeenAt` on `WorktreeRecord`, `expiryOf` / `expiredWorktrees` for selecting lapsed candidates, and `auditWorktrees` / `observeWorktree` / `planVerdict`, which compose git observation with `@brambodev/resources` measurement into a reclaim plan. Expiry fails closed on undatable records, an unobservable worktree is never reclaimable, and no path here removes anything.
