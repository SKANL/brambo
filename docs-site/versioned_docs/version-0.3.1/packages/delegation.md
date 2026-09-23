---
title: "@brambodev/delegation"
audience: SDK integrators and task-runner authors
prerequisites: Node.js >=20 and a TypeScript or JavaScript project
outcome: Run one delegated operation and inspect its recorded outcome
scope: Package reference for provider-agnostic delegation lifecycle primitives
compatibility: Published packages support Node.js >=20
translationStatus: original
---

# @brambodev/delegation

`@brambodev/delegation` runs a handler for a typed request and records the outcome. Use it when a host needs a small delegation lifecycle boundary without adopting a full task graph.

## Minimal example

Create a registry, then delegate a request to an application-owned handler. The handler receives an `AbortSignal`; the returned record contains the request, status, and result or error.

```ts
import { createDelegationRegistry } from '@brambodev/delegation'
import type { DelegationHandler, DelegationRequest } from '@brambodev/contracts'

const registry = createDelegationRegistry<{ prompt: string }, string>()
const request: DelegationRequest<{ prompt: string }> = {
  id: 'research-1',
  input: { prompt: 'Summarize the release notes' },
}
const handler: DelegationHandler<{ prompt: string }, string> = {
  execute: async ({ input }, signal) => runWorker(input.prompt, signal),
}
const record = await registry.delegate(request, handler)
```

## Public surface

- `createDelegationRegistry()` creates an in-memory registry with `delegate()` and `get()` operations.
- `createJsonlDelegationStateStore(path)` provides append-only JSON Lines snapshots for restoring the latest registry state.
- Import `DelegationRequest`, `DelegationHandler`, `DelegationRecord`, and `DelegationStateStore` from `@brambodev/contracts`; the delegation package does not re-export those types.
- Its only runtime package dependency is `@brambodev/contracts`.

## Extension points and limits

The host owns the handler, executor, cancellation policy, and any external side effects. Pass a `DelegationStateStore` implementation to persist records elsewhere. A request ID must be non-empty and unique within the registry; duplicates raise a coded brambo error. Handler errors are recorded as failed (or cancelled when the supplied signal is aborted) rather than rethrown. This package does not create processes, choose a model, or provide a distributed queue.

## Related guides

- Combine delegated handlers into a dependency graph with [`@brambodev/orchestration`](./orchestration.md).
- See the shared [public API reference](../reference/api.md).
