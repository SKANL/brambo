---
title: session
audience: Developers integrating @brambodev/session
prerequisites: Node.js >=20
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/session 0.5.x'
compatibility: Node.js >=20
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/session

<Badge status="stable">Stable</Badge>

*Stable: covered by its tests (and its contract suite where the port has one) and exercised by brambo's own session or CLI path. brambo is pre-1.0, so breaking changes remain possible and are called out in the changelog.* [Status criteria](../reference/package-status).

Everything `brambo run` does except argument parsing, JSON output and exit codes. `runSession` composes a kernel, mounts the executor and workspace plugins, creates a workspace, runs one prompt through the kernel's action pipeline and cleans up in a fixed order. It re-exports the types and helpers its surface needs, so hosts install only this package.

| | |
|---|---|
| World | Session world |
| Topology tier | 4 |
| Node.js | `>=20` |
| Depends on | [`adapter-cli`](./adapter-cli), [`contracts`](./contracts), [`kernel`](./kernel), [`orchestration`](./orchestration), [`provenance`](./provenance), [`sandbox`](./sandbox), [`workspace-git-worktree`](./workspace-git-worktree), [`workspace-local`](./workspace-local) |

## Install

```bash
npm install @brambodev/session
```

## Example

```ts
import { runSession } from '@brambodev/session'

const deadline = AbortSignal.timeout(120_000)
const envelope = await runSession({
  prompt: 'Summarize the open TODOs',
  executorId: 'claude-code',
  onInterrupt: (cancel) => {
    deadline.addEventListener('abort', cancel, { once: true })
    return () => deadline.removeEventListener('abort', cancel)
  },
})
console.log(envelope.status, envelope.summary)
```

## Ports

- **Implements:** Composition only: `runSession`, `createSessionKernel`, `executeTool`, `createToolExecutor`, `readExecutorConfigLayers`, workspace removal helpers, session event logs, `runWorkflowSession`.
- **Consumes:** `ExecutorAdapter` (via `adapter-cli` or your `createAdapter`), `WorkspaceProvider` (`workspace-local`, `workspace-git-worktree` or your `createProvider`), optional `SandboxProvider` and `ToolExecutor`.

## Errors

Throws `BRAMBO_CONTRACT_*` (invalid prompt or options, disposed provider), `BRAMBO_EXECUTOR_NOT_FOUND`, `BRAMBO_CONFIGURATION_UNUSABLE` and `BRAMBO_KERNEL_*` budget codes; executor outcomes are returned as envelopes.

## Limits

- No `signal` option, no timeouts, no retries; cancellation goes through `onInterrupt`.
- Persists no transcript; workspaces stay on disk until you remove them.
- Passing `sandboxProvider` or `toolExecutor` configures the tool seam but does not route the CLI executor's own tools through it.
- Runs are admitted at a flat cost of 1 and settled against reported tokens, so cost and invocation caps can trip on different runs.

## See also

- [Your first session](../tutorials/first-session)
- [Integrate runSession into a host](../guides/host-integration)
- [Cancellation, timeouts and retries](../guides/cancellation-timeouts-retries)
