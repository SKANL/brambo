---
title: "Durable orchestration"
audience: SDK integrators
prerequisites: Node.js >=20; SQLite >=24.15.0
outcome: Compose ports with host-owned authority
scope: Durable SDK orchestration
compatibility: Node.js >=20; SQLite >=24.15.0
translationStatus: original
---
import Diagram from '@site/src/components/Diagram'
import DurableLease from '@site/src/components/diagrams/DurableLease'


# Durable orchestration

Compose the SDK with your own authority, immutable artifacts and trusted execution. No Brambo account or operated service is needed. Existing synchronous `runSession` and `runTaskGraph` APIs remain unchanged.

## Local composition

This typechecked recipe declares host-supplied inputs; it is not a standalone launcher. Publish the initial immutable workspace first. Authorize the principal/command before admission, and supply isolated task preparation/execution. A single parent renewal owner must keep the lease current and provide `currentParentLease`; the engine does not install one for you.

```ts
import { openSqliteRunStore } from '@brambodev/workflow-store-sqlite'
import { createLocalArtifactProvider } from '@brambodev/workspace-artifacts-local'
import { leaseResources, type Command, type Principal, type RunSnapshot } from '@brambodev/contracts'
import { runDurableWorkflow, type DurableWorkflowOptions } from '@brambodev/orchestration'

// Host-supplied, already authorized inputs and isolated task execution.
declare const initial: RunSnapshot
declare const command: Command
declare const principal: Principal
declare const execution: Pick<DurableWorkflowOptions,
  'definition' | 'prepareTask' | 'executeTask' | 'signal' | 'currentParentLease'>

const store = await openSqliteRunStore({ path: './workflow.sqlite' })
const artifacts = createLocalArtifactProvider({ rootDir: './private-artifacts', store })
try {
  const admitted = await store.create(initial, command, principal)
  if (admitted.status !== 'accepted') throw new Error('Inspect existing admission before resuming')
  const claimed = await store.claim(initial.key.namespace,
    leaseResources(initial.key, initial.workspace.workspaceId), principal.subject, 30_000)
  if (claimed.status !== 'acquired') throw new Error('Active writer owns this run')
  try {
    await runDurableWorkflow({ ...execution, key: initial.key, principal,
      lease: claimed.lease, store, artifacts, concurrency: 1 })
  } finally { await store.release(claimed.lease) }
} finally { await store.close() }
```

## Authority and recovery

<Diagram><DurableLease /></Diagram>

| Boundary | Guarantee and limit |
|---|---|
| RunStore | Atomic state/events/receipt CAS; one parent writer, current fenced run/workspace claim |
| Reference SQLite | Node >=24.15.0; one authoritative local-machine host, multiple local connections; no shared mount, clustering or distributed failover |
| Alternative backend | Implement the neutral port and pass the same published suite; test-only non-SQLite fixture declares local-process scope and is not a production backend |
| Artifacts | Stage immutable content, publish under a scoped workspace lease, then commit the reference; staged orphans are not progress |
| Runtime | Private task workspaces and child renewal; promise settlement is trusted handback, not an OS sandbox or process-tree termination proof |
| Effects | Completed journal results replay without dispatch; unfinished non-idempotent effects remain uncertain |

## Continuation and import

Stable Brambo run/session/workspace identities are separate from provider-native handles. Native continuation requires fresh exact driver/version/provider/account/compatibility evidence; otherwise authorized bounded reconstruction or a typed block is selected. Reconstruction preserves recorded logical work, not invisible provider state.

`importWorkflowRun` explicitly freezes and copies a terminal source snapshot with host authorization, exact workflow fingerprint, lineage and digest checks. The source must support the import fence extension. The final target commit uses captured data only; the source may continue independently afterward. No distributed transaction, ongoing synchronization, automatic merge, schema migration, transferable native session, secrets or approval inheritance is promised. Ambiguous source effects, pending commands, collisions, incompatible definitions and missing evidence refuse. See the [orchestration package](../packages/orchestration.md) for its import limits.

## Proof and next step

Published `runWorkflowStoreContractSuite` probes admission, committed reopen, scoped replay, forged ownership, CAS and takeover; run it on disposable storage with an injected authority clock. It mutates probe storage, not your live database. A passing suite is bounded behavioral evidence, not certification of distributed durability. SQLite and test-only local-process implementations run the identical clauses, with broken controls rejecting unfenced/forged/lost-history implementations.

Packed consumer/build/frozen-install and hosted Windows/Linux acceptance remain unverified for this change. Cached local source checks do not replace them. The current consumer CI candidate matrix is Node 20, 22.13.0, 22.18.0 and 24 on Linux; it is not Windows proof. Root developer tools require Node >=24.

Continue with [remote composition](./remote-orchestration.md) or [custom drivers/tools](./custom-drivers-and-tools.md).
