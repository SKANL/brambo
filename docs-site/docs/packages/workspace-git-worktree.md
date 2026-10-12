---
title: workspace-git-worktree
audience: Developers integrating @brambodev/workspace-git-worktree
prerequisites: Node.js >=20
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/workspace-git-worktree 0.5.x'
compatibility: Node.js >=20
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/workspace-git-worktree

<Badge status="stable">Stable</Badge>

*Stable: covered by its tests (and its contract suite where the port has one) and exercised by brambo's own session or CLI path. brambo is pre-1.0, so breaking changes remain possible and are called out in the changelog.* [Status criteria](../reference/package-status).

A `WorkspaceProvider` over real git worktrees. Each workspace is a detached `git worktree` at `<stateDir>/trees/w-<n>` with a durable ownership record; ordinals are reserved under a cross-process file lock and never reused. Removal refuses work that would be lost.

| | |
|---|---|
| World | Session world |
| Topology tier | 2 |
| Node.js | `>=20` |
| Depends on | [`contracts`](./contracts), [`kernel`](./kernel), [`lock`](./lock) |

## Install

```bash
npm install @brambodev/workspace-git-worktree
```

## Example

```ts
import { GitWorktreeWorkspaceProvider, inspectWorktrees, removeWorktree } from '@brambodev/workspace-git-worktree'

const stateDir = '/src/project/.brambo/workspaces'
const provider = new GitWorktreeWorkspaceProvider({ repoPath: '/src/project', stateDir })
const handle = await provider.create()
await provider.release(handle)
await provider.dispose()

const inspection = await inspectWorktrees(stateDir)
console.log(inspection)
console.log((await removeWorktree(stateDir, handle.id)).kind) // 'removed' | 'retired' | 'refused' | 'unknown'
```

## Ports

- **Implements:** `WorkspaceProvider`; kernel `workspace` plugin (`createGitWorktreeWorkspacePlugin`).
- **Consumes:** `git` on `PATH`; `@brambodev/lock`.

## Errors

`BRAMBO_CONTRACT_WORKSPACE_*` (including `_CONTENTION` and `_REMOVAL_REFUSED`), `BRAMBO_CONTRACT_PROVIDER_DISPOSED`; git failures are `BRAMBO_CONTRACT_WORKSPACE_UNAVAILABLE` with git's message.

## Limits

- git commands run with no timeout.
- Worktrees are detached; no branch is created.
- `removeWorktree` refuses a dirty tree or a HEAD commit no ref contains; there is no override.
- Removal intents from another host are never taken over.

## See also

- [Use a workspace provider](../how-to/use-workspace-provider)
- [Executors and workspaces](../guides/executors-and-workspaces)
