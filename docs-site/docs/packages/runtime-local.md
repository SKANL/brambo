---
title: runtime-local
audience: Developers integrating @brambodev/runtime-local
prerequisites: Node.js >=20
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/runtime-local 0.5.x'
compatibility: Node.js >=20
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/runtime-local

<Badge status="experimental">Experimental</Badge>

*Experimental: tested and usable, but its surface may still change, and it has less platform evidence or fewer in-repo consumers than the stable packages.* [Status criteria](../reference/package-status).

A local `ExecutionRuntime` for durable tasks: it validates the child lease scope, materializes the task workspace into a private `0700` directory, runs the driver, stages the result as a new revision, renews the child lease on a schedule, and always removes its private directory. Advertises `native-continuation` and `context-reconstruction`.

| | |
|---|---|
| World | Durable world |
| Topology tier | 2 |
| Node.js | `>=20` |
| Depends on | [`contracts`](./contracts) |

## Install

```bash
npm install @brambodev/runtime-local
```

## Example

```ts
import { createLocalExecutionRuntime } from '@brambodev/runtime-local'
import { openSqliteRunStore } from '@brambodev/workflow-store-sqlite'
import { createLocalArtifactProvider } from '@brambodev/workspace-artifacts-local'

const store = await openSqliteRunStore({ path: './workflow.sqlite' })
const artifacts = createLocalArtifactProvider({ rootDir: './private-artifacts', store })
const runtime = createLocalExecutionRuntime({ rootDir: './runtime', artifacts, store, ttlMs: 30_000, renewalMs: 10_000 })
console.log(runtime.capabilities)
```

## Ports

- **Implements:** `ExecutionRuntime`; `createLeaseRenewalController`.
- **Consumes:** `ArtifactProvider`, `RunStore` (for `valid` and `renew`), an `ExecutionDriver`.

## Errors

`BRAMBO_CONTRACT_LEASE_SCOPE_INVALID`, `BRAMBO_ORCHESTRATION_INVALID`; lost ownership and cancellation throw plain `Error`s.

## Limits

- Not a sandbox: a private directory is not isolation, and a settled driver promise is not proof its processes ended.
- `renewalMs` must be less than `ttlMs` (defaults 10 s and 30 s).

## See also

- [Durable orchestration](../guides/durable-orchestration)
- [Custom drivers and tools](../guides/custom-drivers-and-tools)
