# @brambodev/workflow-store-sqlite

Optional SQLite `RunStore` reference implementation. Requires Node >=24.15.0.
Import is side-effect free; SQLite is loaded only by `openSqliteRunStore`.

```ts
import { openSqliteRunStore } from '@brambodev/workflow-store-sqlite'

const store = await openSqliteRunStore({ path: './workflow.sqlite' })
// A trusted host supplies Principal separately from the untrusted Command body.
// await store.create(snapshot, command, authenticatedPrincipal)
await store.close()
```

## Current scope

Atomic creation/admission, namespace-scoped receipts, revision CAS and ordered
event pagination survive close/reopen. Commands deduplicate by namespace, client
and idempotency key; changing kind, payload, target run or authenticated actor
conflicts. Object key ordering is irrelevant; array ordering is significant.
State, event sequence and receipt updates share one transaction. Commits require
stored matching parent-run and workspace lease epochs, owner, token fingerprint
and expiration; raw lease tokens are never stored. All lease resources are checked,
including any newly associated workspace. Receipt identity and actor cannot change.

Public `claim`, `renew`, `release` and `valid` are explicitly unavailable in this
work unit. Do not use this package as a complete workflow authority yet. The public
conformance runner reports the unfinished atomic-commit/fencing clause as a
violation; test-only seeded epochs exercise commit safety without a production bypass.

One authoritative local host may open multiple connections to the same database.
SQLite writes are serialized using `BEGIN IMMEDIATE`; bounded 100 ms contention
raises `BRAMBO_WORKFLOW_STORE_BUSY`, never silently overwrites state. Hosts decide
whether to retry unchanged commands. Schema version 1 is checked without migrating
unknown versions. Request pages and commit event batches are bounded to 256 events.
Events and receipts retain their full history; no automatic pruning is performed.

SQLite transactions use `synchronous=FULL`; actual durability also depends on the
host filesystem and hardware. Do not share/mount this file across hosts, advertise
clustered/failover authority, or treat local caches as independent writers. Inject
another conforming `RunStore` where that topology or runtime is unsuitable.
