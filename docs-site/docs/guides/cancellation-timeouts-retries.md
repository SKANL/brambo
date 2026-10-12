---
title: Cancellation, timeouts and retries
audience: Host integrators embedding brambo
prerequisites: Node.js >=20
outcome: Know which deadlines and retries brambo applies by default (almost none) and how to supply your own
scope: Session, CLI adapter, API adapters and sandbox providers in 0.5.x
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# Cancellation, timeouts and retries

**brambo sets no deadline on an executor run and retries nothing by default.** A run ends when the executor finishes or when your host cancels it. This is deliberate: a library cannot know how long a refactor should take or whether a request is safe to repeat. This page lists every place a time limit or retry exists, so you can decide where to add your own.

## Cancel a session

`runSession` takes no `signal`. It takes `onInterrupt`, which registers brambo's cancel handler and returns a disposer:

```ts
import { runSession } from '@brambodev/session'

export async function runWithDeadline(prompt: string, ms: number) {
  const signal = AbortSignal.timeout(ms)
  return runSession({
    prompt,
    onInterrupt: (cancel) => {
      signal.addEventListener('abort', cancel, { once: true })
      return () => signal.removeEventListener('abort', cancel)
    },
  })
}
```

When `cancel` runs, brambo aborts the internal signal it passes to the adapter as `RunRequest.signal`. The CLI adapter kills the executor's process tree (`taskkill /T /F` on Windows, `SIGKILL` to the process group on POSIX) and resolves a `cancelled` envelope with a non-empty `errors` array. Cleanup then runs in its normal order.

To cancel on process signals, wire them yourself; this is what `@brambodev/cli` does:

```ts
import { runSession } from '@brambodev/session'

const envelope = await runSession({
  prompt: 'Run the test suite',
  onInterrupt: (cancel) => {
    process.once('SIGINT', cancel)
    process.once('SIGTERM', cancel)
    return () => {
      process.off('SIGINT', cancel)
      process.off('SIGTERM', cancel)
    }
  },
})
```

A direct `ExecutorAdapter.run()` call (outside `runSession`) accepts `signal` on the request itself.

## Where time limits exist

| Component | Default limit | Configurable |
|---|---|---|
| `runSession` / `adapter-cli` executor run | **None** | Your interrupt handler |
| `adapter-openai`, `adapter-anthropic` requests | **None** | Abort through the run signal |
| `executeWithRetry` (adapter-api) | None unless the request carries `deadlineAt`; the shipped providers do not set one | Custom providers may pass `deadlineAt` |
| git commands in `workspace-git-worktree` | **None** | No |
| Worktree ordinal lock wait | 15 s | No |
| `createRemoteMcpClient` (session) | 30 s per request | `timeoutMs` |
| `sandbox-local` tool execution | 5 min wall time | `timeoutMs` on the provider, or `resourceLimits.wallTimeMs` on the policy |
| `sandbox-remote` operations | **None** unless set | `timeoutMs`; covers execute, stdio, snapshot, restore and destroy, but not session creation |
| Kernel budgets | Unlimited | `actionPolicy` caps |

A sandbox time-out is a result, not a throw: `execute` resolves with status `timed-out` and code `BRAMBO_SANDBOX_TIMED_OUT`; an abort resolves `aborted` with `BRAMBO_SANDBOX_ABORTED`.

## Retries

| Component | Behavior |
|---|---|
| CLI executors | Never retried. |
| OpenAI and Anthropic providers | Call `executeWithRetry` with `maxAttempts: 1`: one attempt, no retry. |
| `executeWithRetry` itself | Retries only `rate-limit`, `timeout` and `unavailable` errors, and only when the request was provably not accepted and idempotency is known. Backoff starts at 100 ms, doubles, caps at 30 s, with full jitter. |
| Local tool loop | Never retries a tool. |
| `runTaskGraph` | `maxAttempts` per task, default 1. |
| `runDurableWorkflow` | Retries a task only when its effect journal proves the attempt was safe and attempts remain; otherwise the task is `blocked`. |

Before you wrap a session in your own retry, remember that a `failed` envelope can follow real side effects: the executor may have edited files or called tools before it failed. Retry only work you know is idempotent, or run it as a durable workflow where the effect journal decides.

## Budgets are not deadlines

Kernel caps (`maxInvocations`, `maxTotalCost`, `maxConcurrent`) refuse a run **before** it starts. They do not stop a run in progress. Combine a cap with your own deadline when you need both.

## Next step

Read [Integrate runSession into a host](./host-integration) for ownership and cleanup, or [Durability model](../explanation/durability) for retry safety in the durable world.
