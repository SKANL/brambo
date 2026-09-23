---
title: "@brambodev/orchestration"
audience: SDK integrators and task-runner authors
prerequisites: Node.js >=20 and familiarity with asynchronous tasks
outcome: Execute a dependency-aware task graph with bounded concurrency
scope: Package reference for provider-agnostic task orchestration
compatibility: Published packages support Node.js >=20
translationStatus: original
---

# @brambodev/orchestration

`@brambodev/orchestration` executes an application-defined task graph. Use it when tasks have dependencies, retries, cancellation, or resumable state; it schedules work but does not decide what a task means.

## Minimal example

Declare task IDs and dependencies, then run the graph. Ready tasks run up to the configured concurrency, and dependent tasks wait for their prerequisites to succeed.

```ts
import { runTaskGraph } from '@brambodev/orchestration'

const result = await runTaskGraph([
  { id: 'fetch', run: async () => fetchSource() },
  { id: 'summarize', dependsOn: ['fetch'], run: async ({ getResult }) => summarize(getResult('fetch')) },
], { concurrency: 2 })
```

## Public surface

- `runTaskGraph(tasks, options)` validates and executes dependency-aware tasks.
- `runDelegatedTaskGraph(tasks, options)` composes task scheduling with [`@brambodev/delegation`](./delegation.md).
- `createJsonlOrchestrationStateStore(path)` stores task records as append-only JSON Lines snapshots.
- `OrchestrationTask`, `OrchestrationResult`, and `OrchestrationOptions` describe inputs and outcomes.
- Runtime package dependencies are `@brambodev/contracts` and `@brambodev/delegation`.

## Extension points and limits

Provide each task's `run` function and optional `dependsOn`/`maxAttempts`; use `signal`, `concurrency`, or `stateStore` to fit the host's lifecycle. A failed dependency blocks its downstream tasks. Persisted successful records can be resumed, while the package does not persist arbitrary task results beyond the records supplied by the task itself. Cycles, duplicate IDs, unknown dependencies, and invalid retry counts are rejected. There is no distributed scheduler or implicit worker pool.

## Related guides

- Delegate individual work units with [`@brambodev/delegation`](./delegation.md).
- See the shared [public API reference](../reference/api.md).
