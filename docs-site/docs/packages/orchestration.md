---
title: orchestration
audience: Developers integrating @brambodev/orchestration
prerequisites: Node.js >=20
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/orchestration 0.5.x'
compatibility: Node.js >=20
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/orchestration

<Badge status="experimental">Experimental</Badge>

*Experimental: tested and usable, but its surface may still change, and it has less platform evidence or fewer in-repo consumers than the stable packages.*

Task orchestration in two forms: `runTaskGraph`, an in-memory dependency graph with per-task attempts and an optional JSONL state store, and `runDurableWorkflow`, the durable engine that runs a registered workflow over a `RunStore` and `ArtifactProvider` with CAS commits, child leases and an effect journal. Also exports workflow and driver registries, execution-configuration resolution and `importWorkflowRun`.

| | |
|---|---|
| World | Durable world |
| Topology tier | 3 |
| Node.js | `>=20` |
| Depends on | [`contracts`](./contracts), [`delegation`](./delegation) |

## Install

```bash
npm install @brambodev/orchestration
```

## Example

```ts
import { runTaskGraph } from '@brambodev/orchestration'

const result = await runTaskGraph([
  { id: 'build', run: async () => 'built' },
  { id: 'test', dependsOn: ['build'], maxAttempts: 2, run: async ({ getResult }) => `tested ${String(getResult('build'))}` },
], { concurrency: 2 })
console.log(result.status, result.tasks.map((task) => [task.id, task.status]))
```

## Ports

- **Implements:** The durable engine; `WorkflowRegistry`, `DriverRegistry`.
- **Consumes:** `RunStore`, `ArtifactProvider`, `ExecutionDriver`/`DriverFactory`, `ExecutionRuntime` (through your `executeTask`).

## Errors

`BRAMBO_ORCHESTRATION_INVALID` for invalid graphs and configuration; engine preconditions and import refusals are plain `Error`s with descriptive messages.

## Limits

- `runTaskGraph` is not durable on its own; only `succeeded` records resume.
- The durable engine retries a task only when its effect journal proves the attempt safe.
- `importWorkflowRun` copies a quiescent terminal run; it is not a distributed transaction or ongoing synchronization.

## See also

- [Your first durable workflow](../tutorials/durable-workflow)
- [Durable semantics](../reference/durable-semantics)
