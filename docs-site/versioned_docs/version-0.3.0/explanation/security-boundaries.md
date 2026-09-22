---
title: Security boundaries
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Understand what brambo protects and what it does not claim
scope: Public security boundaries
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# Security boundaries

brambo protects ownership, validation, and lifecycle boundaries. It does not turn an ordinary vendor process into an operating-system sandbox.

## What brambo enforces

- Configuration rejects cycles and prototype-polluting keys, then freezes snapshots.
- Workspace handles are validated single-use leases; forged handles and double release are coded refusals.
- Projection changes use brambo's ownership ledger; unowned vendor content is not silently changed.
- Memory writes are append-only and include agent, workspace, and timestamp provenance.

## What brambo does not enforce

CLI adapters start ordinary child processes. They set the workspace working directory, but they do not claim OS-level containment. An executor may access absolute paths when its own process and configuration permit it.

```text
workspace root: the starting directory for the child process
OS sandbox: not provided by the CLI adapter contract
vendor permissions: controlled by the executor and its configuration
```

A `MethodPlugin` is not a sandbox, and discovering a tool is not authorization to execute it. `ToolExecutor` runs an explicit invocation through a caller-owned sandbox session.

## Safe integration checklist

1. Treat workspace paths as a boundary hint, not a security guarantee.
2. Keep vendor credentials and permissions under vendor controls.
3. Branch on `BramboError.code`, not message text.
4. Preserve ownership records when moving projected files.
5. Run the relevant contract suite for every provider or adapter.

## Honest reporting

If brambo cannot measure a vendor capability, it reports typed absence. It does not infer isolation or permissions from a path or missing event.

## Next step

Read [Compatibility](../reference/compatibility) for process, workspace, and runtime limits.
