---
title: Errors and result envelopes
audience: Host integrators and port authors
prerequisites: Node.js >=20
outcome: Handle brambo failures by code and status without parsing messages
scope: Error model of the 0.5.x SDK
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# Errors and result envelopes

brambo reports failure on two surfaces, and both are machine-readable. Messages explain failures to people; they are not a stable routing API.

## Two failure surfaces

| Surface | When | Shape |
|---|---|---|
| `ResultEnvelope` | The executor ran (or was cancelled) and produced an outcome | `status: 'ok' \| 'failed' \| 'cancelled'`; `failed` and `cancelled` always carry a non-empty `errors` array of `{ message, code? }` |
| Thrown error | brambo refused an input, a boundary operation or a budget before or around the run | `BramboError` (or a kernel error) with a stable `code` |

An executor failure is data: `runSession` resolves with a `failed` envelope rather than rejecting. An environment failure, such as an unusable configuration document, an unknown executor id, a workspace that cannot be created, or a budget refusal, rejects.

```ts
import { BRAMBO_ERROR_CODES, BramboError } from '@brambodev/contracts'

try {
  await startHost()
} catch (error) {
  if (error instanceof BramboError && error.code === BRAMBO_ERROR_CODES.configurationUnusable) {
    console.error('Repair the configuration document before retrying')
  }
  throw error
}
```

## Two error hierarchies

- **`BramboError`** (from `@brambodev/contracts`) carries `code: BramboErrorCode`, one of the values in `BRAMBO_ERROR_CODES`.
- **Kernel errors** (from `@brambodev/kernel`) extend `BramboKernelError` and carry `BRAMBO_KERNEL_*` codes. The kernel never imports contracts, so it has its own classes; a parity test keeps the two code sets aligned, and `BRAMBO_ERROR_CODES` mirrors every kernel code.

Branch on `error.code` (a string) rather than `instanceof` when an error may come from either hierarchy.

## Code families

| Prefix | Raised by |
|---|---|
| `BRAMBO_KERNEL_*` | Manifests, service graph, lifecycle, action pipeline and budget caps |
| `BRAMBO_CONTRACT_*` | Envelope and protocol validation, workspace leases, memory stores, disposed providers |
| `BRAMBO_EXECUTOR_*` | Executor selection, spawn, run, cancellation and API provider registration |
| `BRAMBO_SANDBOX_*` | Sandbox policy, capability evidence, requests, responses and denial |
| `BRAMBO_CONFIGURATION_UNUSABLE` | An existing configuration document that cannot be used (an absent one is not an error) |
| `BRAMBO_REGISTRY_*`, `BRAMBO_PROJECTION_*`, `BRAMBO_LOCK_*`, `BRAMBO_ENVIRONMENT_*` | Environment world |
| `BRAMBO_WORKFLOW_*`, `BRAMBO_ORCHESTRATION_INVALID` | Durable world |
| `BRAMBO_METHOD_*`, `BRAMBO_TOOL_*`, `BRAMBO_PROVENANCE_INVALID` | Methods, tool invocations, review receipts |

Durable-world results are mostly **statuses**, not errors: a `RunStore` commit answers `committed`, `conflict` or `stale-lease`, and a claim answers `acquired` or `contended`. Treat those as control flow. Some durable failures (engine preconditions, import refusals, artifact limits) are plain `Error` instances with descriptive messages and no code yet.

## Routing table

| Signal | Meaning | Action |
|---|---|---|
| `status: 'ok'` | Successful executor envelope | Consume `data`, `summary`, `changedPaths`. |
| `status: 'failed'` | Executor or adapter failure | Inspect `errors[].code`; do not retry blindly, the run may have had side effects. |
| `status: 'cancelled'` | Your interrupt or signal stopped the run | Release your own resources. |
| `BRAMBO_KERNEL_*_CAP_EXCEEDED` | A budget refused the run before the executor started | Raise the cap or stop. |
| Other `BramboError.code` | brambo rejected an input or boundary operation | Fix that boundary; the code names it. |

## Next step

Every code with its meaning is listed in the error code reference; for symptoms, read [Troubleshooting](../reference/troubleshooting).
