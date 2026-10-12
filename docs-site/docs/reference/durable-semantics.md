---
title: Durable semantics reference
audience: Platform engineers and RunStore implementers
prerequisites: Read the durability model
outcome: Look up every RunStore result, lease rule, receipt phase, event type and limit of the durable world
scope: '@brambodev/contracts durable types, @brambodev/orchestration engine and @brambodev/workflow-store-sqlite in 0.5.x'
compatibility: Node.js >=20; workflow-store-sqlite requires Node.js >=24.15.0
translationStatus: original
---
# Durable semantics reference

Exact behavior of the durable world, taken from the 0.5.x sources. For the reasoning behind it, read [Durability model](../explanation/durability).

## Identifiers

| Type | Shape |
|---|---|
| `RunKey` | `{ namespace, runId }` |
| `WorkspaceRef` | `{ namespace, workspaceId, revision }` |
| `Principal` | `{ namespace, subject }`, supplied by your trusted host |
| Identifier syntax | `^[A-Za-z0-9][A-Za-z0-9._-]*$` |

## Run snapshot

`RunSnapshot` has `schemaVersion: 1`, `key`, `revision`, `workflowId`, `workflowVersion`, `sessionId`, `status`, `workspace`, `tasks`, `context` (JSON), `cancelRequested`, and optional `binding`, `lineage`, `importState` and `executionConfigurations`. `workflowId`, `workflowVersion`, `sessionId` and `lineage` are immutable after creation.

| Field | Values |
|---|---|
| Run `status` | `pending`, `running`, `succeeded`, `failed`, `cancelled`, `blocked` |
| Task `phase` | Any run status, plus `uncertain` |
| Task checkpoint | `taskId`, `phase`, `attempt`, optional `effectId`, `result`, `workspace`, `error { code, message }` |

## RunStore operations

| Method | Result |
|---|---|
| `create(snapshot, command, actor)` | `accepted` with receipt, `duplicate` with the original receipt, or `conflict`. Requires `revision: 0`, a `start` command and a matching key. |
| `admit(command, actor)` | `accepted`, `duplicate` or `conflict` (also `conflict` when the run is missing or import-fenced). |
| `get(key)` | The snapshot or `undefined`. |
| `receipt(namespace, id)` | The receipt or `undefined`. |
| `pending(namespace, limit, filter?)` | Receipts in `accepted` or `running`, oldest first. |
| `commit({ snapshot, expectedRevision, lease, events, receipt? })` | `committed` with the snapshot, `conflict` (revision moved) or `stale-lease`. |
| `events(key, after, limit)` | A page: `status` `ok`, `empty` or `overflow`, `events`, `latestCursor`, `nextCursor`. |
| `claim(namespace, resources, ownerId, ttlMs)` | `acquired` with a lease, or `contended`. All or nothing. |
| `claimImportFence?(key, ownerId, ttlMs)` | Optional; claims `import:<runId>` for `importWorkflowRun`. |
| `renew(lease, ttlMs)` | `acquired` (same token and epochs, later expiry) or `contended`. |
| `release(lease)` | Void; a forged or non-matching lease is a no-op. |
| `valid(lease)` | Boolean. |
| `close()` | Closes the store. |

## Commands and receipts

- `Command` is `{ key, clientId, idempotencyKey, kind: 'start' | 'continue' | 'cancel', payload }`.
- The idempotency key is `(namespace, clientId, idempotencyKey)`. The same command and the same actor (compared canonically, key order ignored) is `duplicate`; anything else under that key is `conflict`.
- `CommandReceipt` is `{ id, command, actor, phase, outcome? }` with `phase` in `accepted → running → completed | blocked`.

## Leases and fencing

- `Lease` is `{ namespace, ownerId, token, expiresAt, epochs }`. `epochs` maps each resource to an integer `>= 1` and must not be empty.
- Resources: `run:<runId>`, `workspace:<workspaceId>`, `task:<runId>:<taskId>`, `import:<runId>`. `leaseResources(key, workspaceId)` returns the run and workspace pair.
- Each claim on a resource sets its epoch to the previous value plus one; epochs survive release and are never reset.
- A commit must hold a current lease covering `run:<id>` and the current and next `workspace:<id>`. In the SQLite store "current" means the token hash, owner, epochs and expiry all match and `expiresAt` is in the future.
- The token is a bearer secret: the SQLite store keeps only its SHA-256 hash, and hosts must never persist it.

## Engine behavior (`runDurableWorkflow`)

- **Single CAS owner.** One serialized queue commits every transition with `expectedRevision = current.revision`. Any non-`committed` result stops the run with that status as the error.
- **Child leases.** Each task claims `task:<runId>:<taskId>` plus its own `workspace:<id>` under a fresh owner. A contended claim checkpoints the task `blocked` with `task-lease-contended`. A reused workspace id fails with `Workspace isolation required`.
- **Publication.** Artifacts are published under the child lease, outside the queue; the checkpoint is then committed by CAS. The child lease must not contain a `run:` resource and must not reuse the parent token.
- **Terminal status.** With `cancelRequested`: `cancelled` when every task is `cancelled`, `pending` or `succeeded`, otherwise `blocked`. Without it: `succeeded` if all tasks succeeded, `failed` if any failed, otherwise `blocked`.
- **Already finished.** A run that is already `succeeded` or `cancelled` is returned unchanged.
- **Default child TTL** is 60 s (`taskLeaseTtlMs`).

### Recovery

A task found `running`, `uncertain`, `blocked` or `failed` at start is retried only when this attempt has effect evidence, at least one effect record exists, every record is completed or not `non-idempotent`, and `attempt < maxAttempts`. Otherwise it becomes `blocked` with `uncertain-attempt-recovery` ("Durable effects do not prove replay safe"). After a failed execution the task becomes `pending` (safe, attempts left), `failed` (safe, exhausted) or `blocked`.

### Effect journal

| `journal.begin(call, effect)` returns | When |
|---|---|
| `'completed'` | A completed record exists; `task.effect.replayed` is emitted and `journal.result(callId)` returns the stored result. |
| `'uncertain'` | A start exists in the same attempt, or the effect is `non-idempotent`. |
| `'new'` | Otherwise; `task.effect.started` is emitted. Call `journal.finish(callId, result)` when done. |

`begin` throws `Task effect admission stopped` once the run is stopping or the child lease is invalid, and `Effect identity conflict` when a call id returns with a different call or effect class.

### Cancellation

A cancel is admitted with `clientId: 'durable-engine'` and `idempotencyKey: cancel:<namespace>:<runId>`. A cancel after a terminal commit emits `run.cancel.too-late` and completes its receipt with `{ applied: false }`.

## Event types

`workflow.definition` (carries the SHA-256 fingerprint of the definition), `run.running`, `run.<status>`, `task.attempt.started`, `task.retry.ready`, `task.blocked`, `task.cancelled`, `task.succeeded`, `task.effect.started`, `task.effect.completed`, `task.effect.replayed`, `run.cancel.requested`, `run.cancel.too-late`, `run.import.completed`.

Events carry `schemaVersion: 1`, `key`, a per-run monotonic `cursor`, `type`, `payload` and `occurredAt`.

## Limits

| Limit | Value |
|---|---|
| Events per commit (SQLite) | 256 |
| Page size for `events` and `pending` | 256 |
| SQLite busy wait | 100 ms, then `BRAMBO_WORKFLOW_STORE_BUSY` |
| Workflow protocol body (coordinator and remote client) | 1 MiB default |
| Import defaults | 100,000 events, 100,000 manifest entries, 64 MiB per artifact, 512 MiB total, 64 MiB effect history |

## SQLite store errors

| Code | Meaning |
|---|---|
| `BRAMBO_WORKFLOW_STORE_UNAVAILABLE` | Node.js older than 24.15.0, or the database could not be opened |
| `BRAMBO_WORKFLOW_STORE_BUSY` | Another writer held the database past the bounded wait |
| `BRAMBO_WORKFLOW_SCHEMA_UNSUPPORTED` | The database was not created by schema version 1 |
| `BRAMBO_WORKFLOW_STORE_INVALID` | Invalid input, such as a blank path or more than 256 events in one commit |

Engine preconditions and import refusals are plain `Error` instances with descriptive messages (`Run not found`, `Workflow compatibility mismatch`, `Import denied`, and similar); they carry no code yet.

## Conformance

`runWorkflowStoreContractSuite(harness)` from `@brambodev/contracts` runs the clauses `workflow-lease-authenticity`, `workflow-committed-reopen`, `workflow-admission`, `workflow-reopen`, `workflow-scoped-reads`, `workflow-atomic-commit-and-fencing` and `workflow-lease-lifecycle` against any `RunStore`. The harness supplies `open()` (fresh storage), `reopen()` (same storage) and `advance(ms)` (the authority clock). See [Contract suites](../guides/contract-suites).
