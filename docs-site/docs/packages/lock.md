---
title: lock
audience: Developers integrating @brambodev/lock
prerequisites: Node.js >=20
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/lock 0.5.x'
compatibility: Node.js >=20
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/lock

<Badge status="stable">Stable</Badge>

*Stable: covered by its tests (and its contract suite where the port has one) and exercised by brambo's own session or CLI path. brambo is pre-1.0, so breaking changes remain possible and are called out in the changelog.* [Status criteria](../reference/package-status).

A portable lockfile protocol for machine-scoped write serialization: exclusive create, a holder document, stale-lock breaking with reported evidence, and ownership-safe release. Used by the registry, projection and git-worktree ledgers.

| | |
|---|---|
| World | Supporting |
| Topology tier | 1 |
| Node.js | `>=20` |
| Depends on | [`contracts`](./contracts) |

## Install

```bash
npm install @brambodev/lock
```

## Example

```ts
import { acquireLock } from '@brambodev/lock'

const lock = await acquireLock('./state.lock', { timeoutMs: 2_000, onStaleBreak: (broken) => console.warn('broke stale lock', broken) })
try {
  // exclusive section
} finally {
  await lock.release()
}
```

## Ports

- **Implements:** `acquireLock`.
- **Consumes:** The local file system.

## Errors

`BRAMBO_LOCK_CONTENTION` (bounded wait expired), `BRAMBO_LOCK_UNAVAILABLE` (lock medium failed).

## Limits

- Defaults: 2 s wait, 25 ms poll, 30 min stale age, 60 s grace for corrupt locks.
- Machine-scoped; not a distributed lock.

## See also

- [Design principles](../explanation/principles)
