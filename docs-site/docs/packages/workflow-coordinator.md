---
title: workflow-coordinator
audience: Developers integrating @brambodev/workflow-coordinator
prerequisites: Node.js >=20
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/workflow-coordinator 0.5.x'
compatibility: Node.js >=20
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/workflow-coordinator

<Badge status="experimental">Experimental</Badge>

*Experimental: tested and usable, but its surface may still change, and it has less platform evidence or fewer in-repo consumers than the stable packages.*

The host-side control plane for distributed durable runs: `createWorkflowCoordinator` returns a Node.js request handler for the single `POST /v1/workflow` route that authenticates, scopes, authorizes and forwards protocol operations to your store and artifacts; `createWorkflowWorker` claims pending runs and executes them with lease renewal and journaled tool effects.

| | |
|---|---|
| World | Durable world |
| Topology tier | 7 |
| Node.js | `>=20` |
| Depends on | [`contracts`](./contracts), [`orchestration`](./orchestration) |

## Install

```bash
npm install @brambodev/workflow-coordinator
```

## Example

```ts
import { createServer } from 'node:http'
import { createWorkflowCoordinator, type WorkflowCoordinatorOptions } from '@brambodev/workflow-coordinator'

declare const options: WorkflowCoordinatorOptions // store, artifacts, authenticate, authorize, workerAllowed
const coordinator = createWorkflowCoordinator(options)
const server = createServer(coordinator.handler) // TLS, proxy and listen are yours
server.listen(8443)
```

## Ports

- **Implements:** The workflow protocol server; a worker loop.
- **Consumes:** `RunStore`, `ArtifactProvider`, `runDurableWorkflow`, `DriverRegistry`, `ExecutionRuntime`, host auth callbacks and services.

## Errors

HTTP statuses with protocol `denied`, `invalid` or `unavailable`; worker refusals are plain `Error`s; tool effects surface `UncertainToolEffectError`.

## Limits

- No TLS, no listener, no authentication of its own.
- Request bodies at most 1 MiB.
- The worker has no scheduler: call `runOnce` from your loop.

## See also

- [Coordinator, worker and remote client](../guides/coordinator-and-worker)
- [Deploy a host-owned coordinator](../guides/remote-orchestration)
