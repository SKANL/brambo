---
title: "Deploy a host-owned coordinator"
audience: SDK integrators
prerequisites: Node.js >=20; SQLite >=24.15.0
outcome: Compose ports with host-owned authority
scope: Durable SDK orchestration
compatibility: Node.js >=20; SQLite >=24.15.0
translationStatus: original
---

# Deploy a host-owned coordinator

Brambo exports composition functions, not a hosted account, server executable or deployment command. You operate the endpoint, identity system, authority storage, artifact retention and worker processes.

## Control-plane process

Supply mandatory asynchronous authentication, operation/resource authorization and separate worker eligibility callbacks. Missing callbacks fail closed. This typechecked composition fragment neither listens nor supplies permissive authentication defaults.

```ts
import { createWorkflowCoordinator } from '@brambodev/workflow-coordinator'
import type { WorkflowCoordinatorOptions } from '@brambodev/workflow-coordinator'
import type { Server } from 'node:http'

declare const server: Server // Host owns listen/TLS/proxy/shutdown.
declare const host: WorkflowCoordinatorOptions // Mandatory auth/authz/worker callbacks.
const coordinator = createWorkflowCoordinator(host)
server.on('request', coordinator.handler)
// During host shutdown: await coordinator.close(); then close host-owned resources.
```

## Separate worker process

Run this fragment in a distinct host-supervised process. Supply explicitly selected endpoint/transport and fresh authorization headers. Reauthorize `WorkerAuthorizationContext.actor` from the initiating receipt before every new effect or secret lookup; worker identity and model arguments are not that authority. Host services validate schemas, approvals and redact results.

```ts
import { createWorkflowWorker } from '@brambodev/workflow-coordinator'
import type { WorkflowWorkerOptions } from '@brambodev/workflow-coordinator'
import { createRemoteRunStore, createRemoteArtifactProvider } from '@brambodev/workflow-remote'
import type { RemoteClientOptions } from '@brambodev/workflow-remote'
import { createLocalExecutionRuntime } from '@brambodev/runtime-local'
import { runDurableWorkflow } from '@brambodev/orchestration'

declare const remote: RemoteClientOptions // Explicit endpoint/fetch/fresh auth headers.
declare const host: Pick<WorkflowWorkerOptions,
  'workerId' | 'principal' | 'definitions' | 'drivers' | 'services'>
declare const shutdown: AbortSignal
const store = createRemoteRunStore(remote)
const artifacts = createRemoteArtifactProvider(remote)
const runtimeOptions = { rootDir: './worker-private', artifacts, ttlMs: 30_000, renewalMs: 10_000 }
const worker = createWorkflowWorker({ ...host, store, artifacts, execute: runDurableWorkflow,
  runtime: createLocalExecutionRuntime({ ...runtimeOptions, store }),
  runtimeForTask: context => createLocalExecutionRuntime({ ...runtimeOptions, store: context.store }),
  leaseTtlMs: 30_000, renewalMs: 10_000, concurrency: 1 })
try { await worker.runOnce(shutdown) }
finally { await worker.stop(); await store.close() }
```

Each renewing child runtime uses the fresh `context.store` from `runtimeForTask`. Never rebind a shared runtime to another task. The worker owns parent renewal; the runtime owns child renewal. Parent and child tokens/epochs remain distinct. The control plane exposes no tool execution endpoint; `runOnce` is a bounded poll, not an automatically deployed worker daemon.

## Deployment checklist

- [ ] Use host TLS/proxy, independently authenticated clients/workers, current authorization and least-privilege secret access; never copy another user's approvals or credentials.
- [ ] Place the SQLite reference on one authoritative host with local storage and Node >=24.15.0, not on a cross-host shared mount. Choose another conforming backend if needed.
- [ ] Set compatible deadlines, lease TTL/renewal headroom, supervision and shutdown policy. Abort requests cancellation; it does not prove OS termination.
- [ ] Choose backups, encryption, retention and orphan reclamation. Reference events/receipts retain history; no automatic pruning is supplied.
- [ ] Keep request bodies <=1 MiB; the remote default response cap is 1 MiB and paging is <=256 events. Required missing/over-budget context blocks rather than truncates.
- [ ] Exercise your actual topology and platform. Same-host synthetic loopback/process-kill tests are not external deployment, distributed durability or isolation proof.

## Disconnect, takeover and proof

Clients never acquire a local fallback writer. Reconnect observes snapshots and bounded cursor pages; replay does not execute tools. Resubmission is explicit and uses the identical command/actor/idempotency key. Query authority before retrying uncertain mutation responses. An active writer contends; expiry/handoff advances fencing and stale workers cannot commit authoritative state or publish progress. A metadata lease does not protect an unfenced shared filesystem or an arbitrary external effect.

Hosted Windows/Linux execution and packed-install acceptance are still pending. No live provider or remote host was contacted to establish this documentation. See [remote clients](../packages/workflow-remote.md) and [durable guarantees](./durable-orchestration.md).
