---
title: workflow-remote
audience: Developers integrating @brambodev/workflow-remote
prerequisites: Node.js >=20
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/workflow-remote 0.5.x'
compatibility: Node.js >=20
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/workflow-remote

<Badge status="experimental">Experimental</Badge>

*Experimental: tested and usable, but its surface may still change, and it has less platform evidence or fewer in-repo consumers than the stable packages.*

Clients that expose a coordinator as local ports: `createRemoteRunStore` and `createRemoteArtifactProvider` speak the workflow protocol over an injected `fetch` with fresh authorization headers per request, validate every response, and never fall back to a local writer. `replayRun` pages a run's events.

| | |
|---|---|
| World | Durable world |
| Topology tier | 2 |
| Node.js | `>=20` |
| Depends on | [`contracts`](./contracts) |

## Install

```bash
npm install @brambodev/workflow-remote
```

## Example

```ts
import { createRemoteRunStore, replayRun, type RemoteClientOptions } from '@brambodev/workflow-remote'

declare const authorizeRequest: RemoteClientOptions['authorizeRequest']
const store = createRemoteRunStore({ endpoint: 'https://workflows.example.internal/v1/workflow', fetch, authorizeRequest })
const page = await replayRun(store, { namespace: 'acme', runId: 'run-1' }, 0, 100)
console.log(page.status, page.events.length)
await store.close()
```

## Ports

- **Implements:** `RunStore`, `ArtifactProvider` (remote).
- **Consumes:** A coordinator endpoint; host `fetch` and `authorizeRequest`.

## Errors

Plain `Error`s: `Invalid remote endpoint`, `Remote workflow unavailable`, `Invalid remote workflow response`, `Remote workflow aborted`, `Remote workflow client closed`.

## Limits

- Request bodies at most 1 MiB; responses default 1 MiB, up to 64 MiB.
- Page limits above 256 are rejected.
- Local staging is limited to 10,000 entries and 768 KiB of content.

## See also

- [Coordinator, worker and remote client](../guides/coordinator-and-worker)
