---
title: resources
audience: Developers integrating @brambodev/resources
prerequisites: Node.js >=20
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/resources 0.5.x'
compatibility: Node.js >=20
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/resources

<Badge status="experimental">Experimental</Badge>

*Experimental: tested and usable, but its surface may still change, and it has less platform evidence or fewer in-repo consumers than the stable packages.* [Status criteria](../reference/package-status).

Provider-neutral measurement for reclaiming agent-created filesystem state: hardlink-aware unique-byte accounting, a reparse-safe tree scan, a reclaim classification, a collision-safe identity, and the plan a human approves.

| | |
|---|---|
| World | Supporting |
| Topology tier | 1 |
| Node.js | `>=20` |
| Depends on | None (leaf) |

## Install

```bash
npm install @brambodev/resources
```

## Example

```ts
import { buildReclaimPlan, classifyWorktree, reclaimIdentity, scanTree } from '@brambodev/resources'

const measured = await scanTree('/home/me/.brambo/trees/w-1')
if (measured.kind === 'measured') {
  console.log(measured.logicalBytes, measured.uniqueBytes)
}

const verdict = classifyWorktree({ dirtyPaths: 0, unpushedCommits: 0, commitReachableFromRemote: true })
const plan = buildReclaimPlan([
  {
    identity: reclaimIdentity({ repositoryPath: '/srv/repo', worktreeId: 'w-1' }),
    verdict,
    logicalBytes: measured.kind === 'measured' ? measured.logicalBytes : 0,
    uniqueBytes: measured.kind === 'measured' ? measured.uniqueBytes : 0,
  },
])
console.log(plan.totals.uniqueBytes)
```

## Ports

- **Implements:** Nothing. It is a leaf: no filesystem ownership, no executor, no workspace port.
- **Consumes:** Nothing. The clock is an argument, never read.

## Errors

`RangeError` for an impossible measurement (negative size, non-positive lease window, negative count) and `TypeError` for a missing repository or worktree id, or two candidates sharing one identity. A tree that is not there is not an error: `scanTree` answers `{ kind: 'absent' }`.

## Limits

- It measures and classifies; it removes nothing. Removal stays behind `@brambodev/workspace-git-worktree`.
- Unique bytes follow the inode link count. Filesystems that clone blocks (reflink) or compress are not modelled, so the figure is an upper bound on what a removal frees.
- `reclaimIdentity` does not fold case; a caller on a case-insensitive volume passes a canonical path.
- Reparse points and revisited directories are skipped and counted, never followed.

## See also

- [workspace-git-worktree](./workspace-git-worktree)
- [Design principles](../explanation/principles)
