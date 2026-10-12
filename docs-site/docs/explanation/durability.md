---
title: Durability model
audience: Platform engineers evaluating the durable world
prerequisites: Node.js >=20; Node.js >=24.15.0 for the SQLite store
outcome: Understand what survives a crash, what is replayed, and what is refused
scope: RunStore, leases, receipts, effect journal and artifacts in 0.5.x
compatibility: Node.js >=20; workflow-store-sqlite requires Node.js >=24.15.0
translationStatus: original
---
import Diagram from '@site/src/components/Diagram'
import DurableLease from '@site/src/components/diagrams/DurableLease'

# Durability model

The durable world makes one promise: **a run's committed state is never overwritten by a writer that lost its claim, and work is never silently repeated when brambo cannot prove repeating it is safe.** It does not promise distributed consensus, exactly-once side effects, or process isolation.

<Diagram><DurableLease /></Diagram>

## Snapshots and revisions

A run is a `RunSnapshot`: its status, task checkpoints, context and workspace reference, at an integer `revision`. Every change is a commit that names the revision it expects (`expectedRevision`) and writes `revision + 1`. If another writer committed first, the store answers `conflict` and nothing is written. State, the events produced by the transition and an optional receipt update land in one atomic commit.

## Leases and fencing epochs

Before committing, a writer claims a lease over a set of resources: `run:<runId>`, `workspace:<workspaceId>`, and per task `task:<runId>:<taskId>`. A claim is all-or-nothing and expires after its TTL unless renewed.

Each successful claim on a resource increments that resource's **fencing epoch**. A commit must present a lease whose epochs, owner, token and expiry are all current; otherwise the store answers `stale-lease`. A paused or partitioned writer that wakes up after its lease was taken over therefore cannot commit, even if it still believes it owns the run. Epochs are retained after release and never reset.

The lease token is a bearer secret. The SQLite store keeps only its SHA-256 hash; the token itself must never be persisted by the host.

## Idempotent command receipts

Commands (`start`, `continue`, `cancel`) are admitted with a `clientId` and an `idempotencyKey`. Submitting the same command again by the same actor returns `duplicate` with the original receipt; a different command under the same key returns `conflict`. Receipts move through `accepted → running → completed | blocked`, so a client that lost a response can ask again without starting a second run.

## Effect journal

A task that calls tools records each effect before and after it happens, classified as `read-only`, `idempotent` or `non-idempotent`:

| Journal state on recovery | Outcome |
|---|---|
| Effect completed | The recorded result is replayed; the tool is not called again. |
| Effect started, not finished, in the same attempt or `non-idempotent` | `uncertain`: the engine refuses to guess. |
| No effect evidence at all | Not treated as proof of no effects. |

On restart, a task left `running`, `uncertain`, `blocked` or `failed` is retried only if its attempt is provably safe and attempts remain; otherwise it is checkpointed `blocked` with `uncertain-attempt-recovery`. A human or a host policy decides what happens next.

## Artifacts

Workspace content moves through an `ArtifactProvider` in two steps. **Stage** writes immutable, content-addressed files and returns a manifest; staging is not progress. **Publish** associates that revision with the workspace under a lease that covers `workspace:<id>`, and only the run's next CAS commit makes it authoritative. A crash between the two leaves an orphan revision, never a half-published workspace.

## Cancellation

A cancel is admitted as an idempotent command. A cancel that arrives after the run reached a terminal state is recorded as `run.cancel.too-late` and changes nothing. A cancelled run ends `cancelled` only if every task is `cancelled`, `pending` or `succeeded`; otherwise it ends `blocked`.

## What durability does not mean here

- **Single authority.** The reference SQLite store is for one authoritative host with multiple local connections. Shared network mounts, clustering and failover are not claimed. Another topology means another `RunStore` implementation that passes the same contract suite.
- **No exactly-once side effects.** Completed effects replay; uncertain ones block. An external system that needs exactly-once must enforce it itself, typically with its own idempotency key.
- **No process isolation.** `runtime-local` gives each task a private directory, not a sandbox, and a driver's settled promise is not proof its processes are gone.
- **No migrations.** The store refuses an unknown schema version.

Continue with the [durable orchestration guide](../guides/durable-orchestration).
