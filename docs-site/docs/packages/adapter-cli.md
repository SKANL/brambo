---
title: adapter-cli
audience: Developers integrating @brambodev/adapter-cli
prerequisites: Node.js >=20
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/adapter-cli 0.5.x'
compatibility: Node.js >=20
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/adapter-cli

<Badge status="stable">Stable</Badge>

*Stable: covered by its tests (and its contract suite where the port has one) and exercised by brambo's own session or CLI path. brambo is pre-1.0, so breaking changes remain possible and are called out in the changelog.*

The `ExecutorAdapter` for coding CLIs. One generic engine spawns the vendor binary headlessly in the workspace and maps its JSON output to a `ResultEnvelope`; each executor (`claude-code`, `codex`, `opencode`) is a trait record of command, arguments, prompt delivery and output parsing. Most hosts reach it through `runSession`.

| | |
|---|---|
| World | Session world |
| Topology tier | 2 |
| Node.js | `>=20` |
| Depends on | [`contracts`](./contracts), [`kernel`](./kernel) |

## Install

```bash
npm install @brambodev/adapter-cli
```

## Example

```ts
import { createExecutorAdapter } from '@brambodev/adapter-cli'
import { LocalWorkspaceProvider } from '@brambodev/workspace-local'

const workspaces = new LocalWorkspaceProvider({ rootDir: './.brambo/workspaces' })
const handle = await workspaces.create()
try {
  const adapter = createExecutorAdapter('codex', { inheritEnv: ['PATH', 'HOME'] })
  const envelope = await adapter.run({ prompt: 'List the files', workspace: handle })
  console.log(envelope.status, envelope.summary)
} finally {
  await workspaces.release(handle)
  await workspaces.dispose()
}
```

## Ports

- **Implements:** `ExecutorAdapter`; a kernel executor plugin (`createExecutorPlugin`).
- **Consumes:** The vendor CLI on `PATH` (or `command`), a `WorkspaceHandle`.

## Errors

Envelope errors `BRAMBO_EXECUTOR_UNAVAILABLE`, `BRAMBO_EXECUTOR_RUN_FAILED`, `BRAMBO_EXECUTOR_CANCELLED`; throws `BRAMBO_EXECUTOR_NOT_FOUND` for an unknown id and `BRAMBO_CONTRACT_ENVELOPE_INVALID` for an invalid request.

## Limits

- **Not a sandbox.** `claude-code` is launched with `--dangerously-skip-permissions`; `codex` runs under its own read-only default; all run with your user's privileges.
- No timeout; abort kills the process tree.
- stdout and stderr capped at 1 MiB each; argument prompts capped at 30,000 characters on Windows and 100,000 elsewhere.
- Typed model controls refuse Windows `.cmd`/`.bat` shims.

## See also

- [Executors and workspaces](../guides/executors-and-workspaces)
- [Security boundaries](../explanation/security-boundaries)
