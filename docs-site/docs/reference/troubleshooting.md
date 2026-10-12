---
title: Troubleshooting
audience: Developers and operators debugging brambo
prerequisites: None
outcome: Map a symptom or code to its likely cause and the smallest safe fix
scope: Common failures of the 0.5.x SDK and CLI
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# Troubleshooting

Start with the coded error, the envelope status or the exit code. Before changing configuration or deleting state, collect the package version, Node.js version, platform, the configuration layer that decided the selection, and the complete coded error. Fix the boundary the code names instead of editing vendor files by hand, and keep workspace and memory state until ownership and retention are clear. Every code is listed in [Error codes](./error-codes).

## The executor was not found

`BRAMBO_EXECUTOR_NOT_FOUND`: use `claude-code`, `codex` or `opencode`, and check the `executor` key in the resolved configuration layer. A `BRAMBO_EXECUTOR_UNAVAILABLE` error in the envelope means the id was valid but the binary could not be spawned: install and sign in to the vendor CLI, or pass its path as `adapterOptions.command`.

## Configuration is reported unusable

`BRAMBO_CONFIGURATION_UNUSABLE`: inspect `~/.brambo/config.json` and `<project>/.brambo/config.json`. Each must be readable JSON with a string `executor`. An existing malformed file is never treated as absent.

```bash
brambo run --executor codex "health check"
```

An explicit selection can override a readable value; it does not repair a document brambo cannot read.

## A run never ends

brambo sets no timeout. Wire `onInterrupt` to a deadline you own; see [Cancellation, timeouts and retries](../guides/cancellation-timeouts-retries). A cancelled run resolves a `cancelled` envelope after the process tree is terminated.

## A session was refused before the executor started

`BRAMBO_KERNEL_*_CAP_EXCEEDED`: a budget cap on a shared kernel was reached. Cost caps compare against the token figure the previous runs reported. Raise the cap, build a new kernel, or stop.

## Options were refused next to a kernel

`BRAMBO_CONTRACT_ENVELOPE_INVALID` naming `configLayers`, `executorId`, `createProvider` or similar: a supplied `kernel` owns those. Configure them on `createSessionKernel` instead.

## A provider refuses after disposal

`BRAMBO_CONTRACT_PROVIDER_DISPOSED`: providers are lifecycle-owned. `runSession` disposes whatever `createProvider` returns, so return a fresh provider on every call.

## A workspace cannot be removed

`BRAMBO_CONTRACT_WORKSPACE_REMOVAL_REFUSED`: the worktree has uncommitted changes, or its HEAD commit is not contained in any ref. Commit or push the work, or remove it with git yourself. Directories without an ownership record are never removed by brambo.

## The sandbox cannot be created

`BRAMBO_SANDBOX_CAPABILITY_UNAVAILABLE`: no registered provider proves every required control. `createDefaultSandboxPolicy` requires full process and resource enforcement, which no shipped local provider proves; require only the controls you need. On Linux, check that `bwrap` is installed and works for your user.

## The durable store will not open or is busy

`BRAMBO_WORKFLOW_STORE_UNAVAILABLE`: run Node.js >=24.15.0 and check the database path. `BRAMBO_WORKFLOW_STORE_BUSY`: another writer held the database past the 100 ms wait; retry the operation. `BRAMBO_WORKFLOW_SCHEMA_UNSUPPORTED`: the file was not created by this schema version.

## A durable task is blocked

A checkpoint error `uncertain-attempt-recovery` means the engine found an attempt it cannot prove safe to repeat. Inspect the task's events and external effects, then decide; brambo will not guess. `task-lease-contended` means another owner holds the task or its workspace.

## A memory store will not open

`BRAMBO_CONTRACT_MEMORY_STORE_VERSION_MISMATCH`: the store has another format version; it is refused, not migrated. Use a build that matches, or a new store according to your retention policy.

## A package works in the repository but not in a consumer

Run `pnpm build` and the consumer-install proof. Check that exports point to `dist`, that the tarball contains declarations, and that the consumer does not rely on the `brambo-source` condition.

## The workspace is not isolated

That is expected: brambo does not claim OS containment. Restrict vendor permissions and run inside an OS sandbox, container or VM when your deployment requires it.

## Next step

If behavior still differs from the contract, run the relevant [contract suite](../guides/contract-suites) and report the named violation with the package version and environment.
