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

*Stable: covered by its tests (and its contract suite where the port has one) and exercised by brambo's own session or CLI path. brambo is pre-1.0, so breaking changes remain possible and are called out in the changelog.* [Status criteria](../reference/package-status).

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

## How it works

**A contracts-only install is proven.** A CI proof packs this tarball, installs it alone into a project outside the repository, compiles a `WorkspaceProvider` against the shipped declarations and runs the published workspace suite from the archive; a leaked runtime dependency fails it.

| Port | Interface | Clauses and runner |
|---|---|---|
| Workspace | `WorkspaceProvider` | `WORKSPACE_CLAUSES`, `runWorkspaceContractSuite` |
| Memory | `MemoryProvider` | `MEMORY_CLAUSES`, `runMemoryContractSuite` |
| Executor | `ExecutorAdapter` | `EXECUTOR_CLAUSES`, `runExecutorContractSuite` |
| Tool discovery | `ToolProvider` | `TOOL_PROVIDER_CLAUSES`, `runToolProviderContractSuite` |

**The workspace lease model.** A handle is a lease, not a path. `create()` mints one and `acquire(id)` returns one for an existing id. Two live handles for one workspace are legal; releasing the same handle twice raises `BRAMBO_CONTRACT_WORKSPACE_DOUBLE_RELEASE`, and a handle the provider did not mint must be refused (clauses `release-forged-handle-rejected` and `double-release-rejected`). After `dispose()` every operation raises `BRAMBO_CONTRACT_PROVIDER_DISPOSED`; `dispose()` is idempotent and destroys no durable state. An unknown or non-string id raises `BRAMBO_CONTRACT_WORKSPACE_UNKNOWN_ID`, because the port is reachable from untyped JavaScript.

**Catch silent type degradation.** While wiring the package up, keep a `// @ts-expect-error` line above `const wrong: WorkspaceHandle = { id: 'x', rootPath: '/x', capabilities: ['execute'] }`. If the declarations failed to resolve, the import would degrade to `any`, the directive would be unused, and `tsc` would report that.

**Sandbox and tool contracts.** `SandboxPolicy.networkMode` is `deny`, `allowlist` or `unrestricted`; a policy without it normalizes to `deny`, and a provider must reject a mode it cannot prove. Capability evidence is checked before a session is created and again against each execution result. Snapshots are file-only: directory metadata and process state are never restorable, and an unknown snapshot identity fails closed. `ToolExecutor` copies `tool.argv` exactly and appends arguments as separate tokens, with no shell string or handler callback; `ToolProvider` is discovery only and grants no execution authority. `danger-full-access` requires explicit acknowledgement and can emit validated `execution-started` and `execution-completed` audit events, which are visibility, not isolation.

**Entry points and the `brambo-source` condition.** The root export carries the port types, schemas, `BramboError`, `BRAMBO_ERROR_CODES`, validators and suite runners; `@brambodev/contracts/validation` publishes the shared record-shape helper. The manifest's `brambo-source` condition points at `./src/index.ts`, which the tarball does not ship; it is reachable only with `node --conditions=brambo-source`, so consumers resolve `dist`.

## See also

- [Contract suites](../guides/contract-suites)
- [Errors and result envelopes](../explanation/errors)
