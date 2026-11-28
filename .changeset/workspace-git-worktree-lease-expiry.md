---
'@brambodev/workspace-git-worktree': minor
---

Add worktree lease renewal and expiry: `WorktreeLedger.touch` and `listRecords`, optional `lastSeenAt` on `WorktreeRecord`, and `expiryOf` / `expiredWorktrees` for selecting lapsed candidates without ever authorising a removal on their own.
