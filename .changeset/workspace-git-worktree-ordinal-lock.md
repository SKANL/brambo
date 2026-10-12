---
'@brambodev/workspace-git-worktree': patch
---

Take a cross-process file lock around ordinal reservation so concurrent brambo processes never issue the same worktree ordinal.
