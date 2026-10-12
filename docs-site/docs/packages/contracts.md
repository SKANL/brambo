---
title: contracts
audience: Developers integrating @brambodev/contracts
prerequisites: Node.js >=20
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/contracts 0.5.x'
compatibility: Node.js >=20
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/contracts

<Badge status="stable">Stable</Badge>

*Stable: covered by its tests (and its contract suite where the port has one) and exercised by brambo's own session or CLI path. brambo is pre-1.0, so breaking changes remain possible and are called out in the changelog.*

The ports every brambo implementation and every third-party port author codes against: typed interfaces, hand-written validators exposed through Standard Schema, the `BramboError` class with every `BRAMBO_*` code, and the runnable contract suites. It has no runtime dependencies, so a port author can install it alone.

| | |
|---|---|
| World | Core |
| Topology tier | 0 |
| Node.js | `>=20` |
| Depends on | none |

## Install

```bash
npm install @brambodev/contracts
```

## Example

```ts
import { BRAMBO_ERROR_CODES, BramboError, validateEnvelope } from '@brambodev/contracts'

const envelope = validateEnvelope({ status: 'failed', data: null, summary: 'tests failed', errors: [{ message: '2 failing' }] })
console.log(envelope.status) // 'failed'

try {
  validateEnvelope({ status: 'failed', data: null, summary: 'no reason given' })
} catch (error) {
  // A failed envelope must say why: the schema refuses an empty errors array.
  console.log(error instanceof BramboError && error.code === BRAMBO_ERROR_CODES.contractEnvelopeInvalid)
}
```

## Ports

- **Implements:** Defines every port: `ExecutorAdapter`, `ExecutorProvider`, `WorkspaceProvider`, `MemoryProvider`, `SandboxProvider`, `ToolProvider`, `ExecutionDriver`, `ExecutionRuntime`, `RunStore`, `ArtifactProvider`, `MethodPlugin`, projection targets.
- **Consumes:** Nothing.

## Errors

Owns `BRAMBO_ERROR_CODES` and `SANDBOX_ERROR_CODES`. See [Error codes](../reference/error-codes).

## Limits

- Types alone prove nothing: run the matching suite (`run*ContractSuite`).
- Validators report coordinates inside the message, not in Standard Schema `path`.

## See also

- [Contract suites](../guides/contract-suites)
- [Errors and result envelopes](../explanation/errors)
