---
'@brambodev/cli': minor
---

Add `brambo workspace audit [--ttl-hours <n>]`: prints every worktree brambo owns with git's own observation, the hardlink-aware measurement and the lease verdict, plus the plan that splits what is safe to reclaim from what needs a human. Read only; it removes nothing.
