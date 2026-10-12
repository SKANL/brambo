---
title: Error codes
audience: Developers handling brambo failures
prerequisites: Node.js >=20
outcome: Look up any BRAMBO_* code, what raises it and what it means
scope: Every coded error, result code and absence reason in 0.5.x
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# Error codes

Branch on these codes, never on message text. `BRAMBO_ERROR_CODES` from `@brambodev/contracts` holds every code in the first six sections except the sandbox result codes, which live in `SANDBOX_ERROR_CODES`; kernel errors carry the same strings. For the error model, read [Errors and result envelopes](../explanation/errors).

## Kernel

Raised by `@brambodev/kernel` as `BramboKernelError` subclasses and mirrored in `BRAMBO_ERROR_CODES`.

| Code | Meaning |
|---|---|
| `BRAMBO_KERNEL_MANIFEST_INVALID` | A plugin manifest failed validation; every issue is listed. |
| `BRAMBO_KERNEL_CYCLE_DETECTED` | Hard dependencies between plugins form a cycle. |
| `BRAMBO_KERNEL_SERVICE_NOT_PROVIDED` | A hard-consumed service has no provider. |
| `BRAMBO_KERNEL_SERVICE_CONFLICT` | Two plugins provide the same service. |
| `BRAMBO_KERNEL_PLUGIN_INACTIVE` | The plugin or the kernel is inactive or already stopped. |
| `BRAMBO_KERNEL_PLUGIN_START_FAILED` | A plugin factory threw, rejected, or did not provide what it declared. |
| `BRAMBO_KERNEL_SWAP_REJECTED` | A swap candidate failed to activate; the old implementation keeps serving. |
| `BRAMBO_KERNEL_REEMIT_DURING_FANOUT` | An event handler emitted synchronously during fan-out. |
| `BRAMBO_KERNEL_INVALID_SCOPE` | An event bus scope is not `global`, `project` or `agent`. |
| `BRAMBO_KERNEL_INVALID_LAYER` | A configuration layer or key is invalid. |
| `BRAMBO_KERNEL_LOG_RECORD_INVALID` | A log entry falls outside the closed record shape. |
| `BRAMBO_KERNEL_ACTION_INVALID` | An action definition or budget policy is invalid (for example a `NaN` cap). |
| `BRAMBO_KERNEL_ACTION_DENIED` | An action guard refused the invocation. |
| `BRAMBO_KERNEL_INVOCATION_CAP_EXCEEDED` | `maxInvocations` was reached; the action did not run. |
| `BRAMBO_KERNEL_COST_CAP_EXCEEDED` | `maxTotalCost` was reached; the action did not run. |
| `BRAMBO_KERNEL_CONCURRENCY_CAP_EXCEEDED` | `maxConcurrent` was reached; the action did not run. |
| `BRAMBO_KERNEL_STAGE_FAILED` | A `pre`, `guard` or `around` stage threw. |
| `BRAMBO_KERNEL_SETTLEMENT_INVALID` | A settlement figure was unusable; recorded, not thrown, and the estimate stands. |
| `BRAMBO_KERNEL_SETTLEMENT_IN_PROGRESS` | An action was admitted while a settlement was still in flight. |

## Contracts

Raised by contract validators and by port implementations.

| Code | Meaning |
|---|---|
| `BRAMBO_CONTRACT_ENVELOPE_INVALID` | A value failed contract validation (envelope, request, snapshot, lease, options). |
| `BRAMBO_CONTRACT_WORKFLOW_PROTOCOL_INVALID` | A workflow protocol request or response is malformed. |
| `BRAMBO_CONTRACT_LEASE_SCOPE_INVALID` | A valid lease does not cover the requested task or workspace. |
| `BRAMBO_CONTRACT_WORKSPACE_UNKNOWN_ID` | The provider does not know that workspace id. |
| `BRAMBO_CONTRACT_WORKSPACE_INVALID_HANDLE` | The handle was not issued by this provider, or options are invalid. |
| `BRAMBO_CONTRACT_WORKSPACE_DOUBLE_RELEASE` | The lease was already released. |
| `BRAMBO_CONTRACT_WORKSPACE_UNAVAILABLE` | The workspace medium failed (I/O, git). |
| `BRAMBO_CONTRACT_WORKSPACE_REMOVAL_REFUSED` | brambo declined to delete work that exists nowhere else. |
| `BRAMBO_CONTRACT_WORKSPACE_CONTENTION` | Another process holds the workspace ledger or removal intent. |
| `BRAMBO_CONTRACT_PROVIDER_DISPOSED` | An operation reached a disposed provider. |
| `BRAMBO_CONTRACT_MEMORY_SAVE_INVALID` | A memory save has a non-string payload or incomplete provenance. |
| `BRAMBO_CONTRACT_MEMORY_UNKNOWN_ENTRY` | `supersedes` names an entry the store does not hold. |
| `BRAMBO_CONTRACT_MEMORY_OVERWRITE_UNSUPPORTED` | Memory is append-only; `overwrite` always refuses. |
| `BRAMBO_CONTRACT_MEMORY_STORE_VERSION_MISMATCH` | The store has another format version; it is refused, never migrated. |
| `BRAMBO_CONTRACT_MEMORY_STORE_UNAVAILABLE` | The memory store could not be opened or written. |

## Executors

Raised by executor selection, CLI adapters and the API provider registry. CLI adapters put the first three in envelope `errors` instead of throwing.

| Code | Meaning |
|---|---|
| `BRAMBO_EXECUTOR_UNAVAILABLE` | The executor binary could not be spawned. |
| `BRAMBO_EXECUTOR_RUN_FAILED` | The executor ran and failed, or produced no result. |
| `BRAMBO_EXECUTOR_CANCELLED` | The run was cancelled. |
| `BRAMBO_EXECUTOR_NOT_FOUND` | No shipped adapter has that executor id. |
| `BRAMBO_EXECUTOR_PROVIDER_MANIFEST_INVALID` | An `ExecutorProvider` manifest is invalid. |
| `BRAMBO_EXECUTOR_PROVIDER_SELECTION_INVALID` | A provider selection or its configuration failed validation. |
| `BRAMBO_EXECUTOR_PROVIDER_USAGE_OBSERVATION_INVALID` | A provider reported a malformed usage observation. |
| `BRAMBO_EXECUTOR_PROVIDER_ERROR_INVALID` | A normalized provider error does not match the contract. |
| `BRAMBO_EXECUTOR_PROVIDER_UNKNOWN` | No registered provider has that id. |
| `BRAMBO_EXECUTOR_PROVIDER_DUPLICATE_REGISTRATION` | A provider with that id is already registered. |

## Sandbox and tools

Validation codes are thrown; `SANDBOX_ERROR_CODES` appear on execution results.

| Code | Meaning |
|---|---|
| `BRAMBO_SANDBOX_POLICY_INVALID` | A sandbox policy is invalid (for example `danger-full-access` without `allowDangerous`). |
| `BRAMBO_SANDBOX_REQUEST_INVALID` | An execution request is invalid or does not match the session policy. |
| `BRAMBO_SANDBOX_RESPONSE_INVALID` | A provider response is malformed or belongs to another session. |
| `BRAMBO_SANDBOX_SNAPSHOT_INVALID` | A snapshot is invalid. |
| `BRAMBO_SANDBOX_CAPABILITY_UNAVAILABLE` | No provider proves every required control. |
| `BRAMBO_SANDBOX_UNAVAILABLE` | No provider, no executor, a failed session, or uncertain teardown. Also a result code. |
| `BRAMBO_SANDBOX_DENIED` | The host authorizer or `approveTool` denied the tool call. |
| `BRAMBO_SANDBOX_COMMAND_DENIED` | Result code: the provider refused the command. |
| `BRAMBO_SANDBOX_RUNNER_FAILED` | Result code: the runner failed. |
| `BRAMBO_SANDBOX_TIMED_OUT` | Result code (thrown by remote stdio, snapshot, restore and destroy): the wall time expired. |
| `BRAMBO_SANDBOX_ABORTED` | Result code: the signal aborted execution. |
| `BRAMBO_TOOL_INVOCATION_INVALID` | A tool declaration or its arguments are not executable. |

## Configuration, methods and orchestration

| Code | Meaning |
|---|---|
| `BRAMBO_CONFIGURATION_UNUSABLE` | brambo's own configuration document exists but cannot be used. An absent document is not this error. |
| `BRAMBO_METHOD_INVALID_PLUGIN` | A method plugin failed validation. |
| `BRAMBO_METHOD_HOOK_FAILED` | A method activation or deactivation hook threw. |
| `BRAMBO_ORCHESTRATION_INVALID` | A task graph, delegation or execution configuration is invalid. |
| `BRAMBO_PROVENANCE_INVALID` | A review receipt or report is invalid or does not match its target. |

## Environment world

| Code | Meaning |
|---|---|
| `BRAMBO_LOCK_CONTENTION` | The bounded wait for a lockfile expired. |
| `BRAMBO_LOCK_UNAVAILABLE` | The lockfile medium failed. |
| `BRAMBO_REGISTRY_INVALID_ENTRY` | A registry entry is invalid for its type. |
| `BRAMBO_REGISTRY_CONTENTION` | Another writer holds the registry lock. |
| `BRAMBO_REGISTRY_STORE_UNAVAILABLE` | The registry store cannot be read or written, or is unrecognizable. |
| `BRAMBO_REGISTRY_STORE_VERSION_MISMATCH` | The registry store was written by a newer brambo. |
| `BRAMBO_REGISTRY_INACTIVE` | The registry plugin is not active. |
| `BRAMBO_REGISTRY_PROVIDER_REJECTED` | An ingest source was rejected. |
| `BRAMBO_REGISTRY_ORIGIN_CONFLICT` | An entry conflicts with one from another origin. |
| `BRAMBO_REGISTRY_BUNDLE_UNAVAILABLE` | A bundle cannot be read, written or understood. |
| `BRAMBO_PROJECTION_NATIVE_MALFORMED` | A vendor configuration file is malformed. |
| `BRAMBO_PROJECTION_TARGET_FAILED` | A projection target failed; other targets continue. |
| `BRAMBO_PROJECTION_TRAITS_INVALID` | Projection target traits are invalid. |
| `BRAMBO_PROJECTION_LEDGER_UNAVAILABLE` | The ownership ledger cannot be read or written. |
| `BRAMBO_PROJECTION_LEDGER_CONTENTION` | Another writer holds the ledger lock. |
| `BRAMBO_PROJECTION_NATIVE_UNCLAIMABLE` | A native location cannot be claimed. |
| `BRAMBO_PROJECTION_MODE_INVALID` | The projection mode is not `apply` or `inspect`; never defaulted. |
| `BRAMBO_PROJECTION_REMEDIATION_REFUSED` | brambo declined a remediation; nothing failed. Returned, not thrown. |
| `BRAMBO_ENVIRONMENT_SCOPE_UNAVAILABLE` | A home or project directory is empty or unusable. |

## Durable store

Raised by `@brambodev/workflow-store-sqlite` as `WorkflowStoreError`; not part of `BRAMBO_ERROR_CODES`.

| Code | Meaning |
|---|---|
| `BRAMBO_WORKFLOW_STORE_UNAVAILABLE` | Node.js older than 24.15.0, or the database cannot be opened. |
| `BRAMBO_WORKFLOW_STORE_BUSY` | Another writer held the database past the 100 ms bounded wait. |
| `BRAMBO_WORKFLOW_SCHEMA_UNSUPPORTED` | The database is not schema version 1. |
| `BRAMBO_WORKFLOW_STORE_INVALID` | Invalid input, such as a blank path or too many events in one commit. |

## Usage absence reasons

Not errors: `USAGE_ABSENCE_REASONS` explain why no usage figure exists.

| Code | Meaning |
|---|---|
| `BRAMBO_USAGE_NO_SURFACE` | The executor publishes no usage surface. |
| `BRAMBO_USAGE_NOT_OBSERVED` | brambo has not observed usage for this executor yet. |
| `BRAMBO_USAGE_NOT_REPORTED` | The run reported no usage figure. |
