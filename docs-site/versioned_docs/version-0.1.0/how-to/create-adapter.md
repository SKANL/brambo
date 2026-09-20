---
title: Create an adapter
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Understand this documentation page
scope: This page
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# Create an adapter

Implement `ExecutorAdapter` when your host owns an executor that is not one of brambo's shipped CLI traits. The adapter receives a prompt, a leased workspace handle, and an optional abort signal; it returns a validated `ResultEnvelope`.

## Minimal adapter

This example uses only the published session seam and returns a deterministic result without starting a child process:

```js
import { runSession } from '@brambodev/session'

const adapter = {
  async run({ prompt, workspace }) {
    return {
      status: 'ok',
      data: { prompt, workspaceId: workspace.id },
      summary: 'Adapter completed the request',
    }
  },
}

const result = await runSession({
  prompt: 'health check',
  createAdapter: () => adapter,
})

console.log(result.data.workspaceId)
```

`createAdapter` is a factory, not an adapter instance. Return a fresh adapter for each session. The run still passes through the kernel action waterfall and its policies.

## Contract requirements

| Input/output | Requirement |
| --- | --- |
| `workspace` | Treat it as a lease; do not replace it with a bare path. |
| `signal` | Stop the whole process tree and return `cancelled` with a non-empty `errors` array when aborting. |
| `status` | Use `ok`, `failed`, or `cancelled`. Failed and cancelled envelopes must explain themselves in `errors`. |
| `data` | Always include the key, using `null` when there is no payload. |
| `summary` | Always provide a non-empty human-readable summary. |

Validate boundary data with the schemas from `@brambodev/contracts` and route failures by `BramboError.code`, never by parsing messages.

## Use a shipped CLI trait instead

For Claude Code, Codex, or OpenCode, prefer `@brambodev/adapter-cli`. Its generic engine handles child-process lifecycle and JSONL parsing from an `ExecutorTraits` record. The shipped IDs are `claude-code`, `codex`, and `opencode`.

## Prove the adapter

Implementing the TypeScript interface is not enough. Run the published `EXECUTOR_CLAUSES` through `runExecutorContractSuite` and fix every violation before shipping. The suite checks behavior such as cancellation, failure envelopes, and workspace handling.

## Next step

Read [Architecture](../explanation/architecture) before adding a package dependency: brambo's package graph is intentionally downward.
