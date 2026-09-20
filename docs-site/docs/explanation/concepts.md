---
title: Core concepts
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Understand panda's public abstractions and ownership model
scope: Public SDK concepts
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# Core concepts

panda is a microkernel for composing AI coding environments. Its public model separates contracts, providers, projections, and session composition so a host can replace one boundary without adopting vendor internals.

## Quick map

| Concept | Meaning |
| --- | --- |
| Contract | A typed port and its behavioral rules. |
| Provider | A replaceable implementation of a contract. |
| Projection | Native executor output plus ownership for reversal. |
| Session | Composition of configuration, executor, workspace, policy, and lifecycle. |
| Lease | A single-use handle representing workspace ownership. |

## Contracts and providers

`@skanl/panda-contracts` is the portable seam. Providers can use files, SQLite, or another implementation while preserving the same contract and coded refusals.

```ts
import type { MemoryProvider, WorkspaceProvider } from '@skanl/panda-contracts'

function mount(memory: MemoryProvider, workspace: WorkspaceProvider): void {
  void memory
  void workspace
}
```

Implementing only the TypeScript shape is not enough when behavior is observable; run the published clause suite.

## Configuration layers

Configuration resolves from widest to narrowest: `defaults`, `global`, `project`, `agent`, then `invocation`. Later layers override earlier values. The composed document is validated before plugins receive settings.

## Ownership and absence

panda tracks what it writes so it can reverse only its own output. Unavailable information is represented as typed absence or a coded error, not a fabricated zero or bare `null`.

## Next step

Read [Architecture](./architecture) for the dependency graph and lifecycle boundaries.
