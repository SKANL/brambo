---
title: workflow-store-sqlite
audience: Developers integrating @brambodev/workflow-store-sqlite
prerequisites: Node.js >=24.15.0
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/workflow-store-sqlite 0.5.x'
compatibility: Node.js >=24.15.0
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/workflow-store-sqlite

<Badge status="experimental">Experimental</Badge>

*Experimental: tested and usable, but its surface may still change, and it has less platform evidence or fewer in-repo consumers than the stable packages.* [Status criteria](../reference/package-status).

The reference single-authority `RunStore` on `node:sqlite`: CAS revisions, atomic state, event and receipt commits, all-or-nothing leases with monotonic fencing epochs, idempotent command receipts, and only hashed lease tokens on disk. SQLite is loaded lazily, so importing the package has no side effects.

| | |
|---|---|
| World | Durable world |
| Topology tier | 2 |
| Node.js | `>=24.15.0` |
| Depends on | [`contracts`](./contracts) |

## Install

```bash
npm install @brambodev/workflow-store-sqlite
```

## Example

```ts
import { openSqliteRunStore } from '@brambodev/workflow-store-sqlite'

const store = await openSqliteRunStore({ path: './workflow.sqlite' })
try {
  const claim = await store.claim('acme', ['run:run-1', 'workspace:source'], 'host-1', 30_000)
  console.log(claim.status) // 'acquired' or 'contended'
  if (claim.status === 'acquired') await store.release(claim.lease)
} finally {
  await store.close()
}
```

## Ports

- **Implements:** `RunStore` (including `claimImportFence`).
- **Consumes:** `node:sqlite`.

## Errors

`BRAMBO_WORKFLOW_STORE_UNAVAILABLE`, `BRAMBO_WORKFLOW_STORE_BUSY`, `BRAMBO_WORKFLOW_SCHEMA_UNSUPPORTED`, `BRAMBO_WORKFLOW_STORE_INVALID` (`WorkflowStoreError`).

## Limits

- Requires Node.js >=24.15.0, unlike every other package.
- One authoritative host with local storage; shared network mounts, clustering and failover are not claimed.
- 256 events per commit and per page; a 100 ms busy wait.
- Events and receipts are never pruned; schema version 1 only, no migrations.

## See also

- [Durable semantics](../reference/durable-semantics)
- [ADR-008](../explanation/decisions/adr-008)
