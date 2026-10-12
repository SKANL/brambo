---
title: Integrate runSession into a host
audience: Host integrators embedding brambo in a product or service
prerequisites: Node.js >=20; completed the first-session quickstart
outcome: Run brambo sessions inside a long-lived host with clear ownership of kernels, providers, budgets, logs and cleanup
scope: '@brambodev/session composition for hosts'
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# Integrate runSession into a host

The quickstart runs one session from a script. A real host (a web service, an IDE extension, a job runner) runs many sessions, shares budgets across them, reports what happened, and must never leak a process or a workspace. This guide shows the ownership rules that make that safe.

## Ownership at a glance

| Resource | Created by | Disposed by |
|---|---|---|
| Kernel built by `runSession` | `runSession` | `runSession`, on every path |
| Kernel from `createSessionKernel` | You | You: `await kernel.stop()` |
| Workspace provider from `createProvider` | Your factory | `runSession`, on every path |
| Workspace directory | The provider | Nobody automatically; removal is an explicit call |
| Interrupt handler from `onInterrupt` | You | `runSession` calls the disposer you returned |
| Event log, log sink | You | You |

brambo installs no signal handlers, starts no timers, and keeps no global state between calls.

## One kernel per run, or one per tenant

By default each `runSession` call builds and stops its own kernel. To share one budget and one record stream across many runs, build the kernel yourself:

```ts
import { createMemoryLogSink, createSessionKernel, runSession } from '@brambodev/session'

const log = createMemoryLogSink()
const kernel = createSessionKernel({
  executorId: 'codex',
  log,
  actionPolicy: { maxInvocations: 20, maxTotalCost: 500_000 },
  onWarning: (message) => console.warn(message),
})

try {
  const first = await runSession({ prompt: 'Summarize the open TODOs', kernel })
  const second = await runSession({ prompt: 'Draft release notes', kernel })
  console.log(first.status, second.status)
} finally {
  await kernel.stop() // runs every mounted plugin's disposer in reverse order
}
```

A supplied kernel owns its configuration, plugins, pipeline, log sink and provider. Passing `configLayers`, `cwd`, `executorId`, `adapterOptions`, `createAdapter`, `createProvider`, `onSelection`, `log` or `actionPolicy` next to `kernel` is refused with `BRAMBO_CONTRACT_ENVELOPE_INVALID` rather than silently ignored.

`maxTotalCost` is compared against the token figure the executor reported after each run (runs are admitted at a flat cost of 1), so a cost cap trips on the run after the one that crossed it.

## Feed configuration in, never let brambo read it implicitly

`runSession` reads no files. A host that wants the user's `~/.brambo/config.json` and the project's `.brambo/config.json` reads them once and passes the snapshot:

```ts
import { readExecutorConfigLayers, runSession } from '@brambodev/session'

const configLayers = await readExecutorConfigLayers({ projectDir: '/srv/repos/acme' })
const envelope = await runSession({
  prompt: 'Run the linter and fix what it reports',
  cwd: '/srv/repos/acme',
  configLayers,
  onSelection: (selection) => console.info(`executor ${selection.executorId} chosen by ${selection.layer}`),
})
```

Omit `configLayers` and only brambo's built-in defaults plus `executorId` apply. A key brambo reads and cannot use is reported through `onWarning`; it never fails the run.

## Observe the run

- **`log`** receives the kernel waterfall's records for the run: `action.invoked`, `action.completed`, `action.refused`, `action.estimated`, `action.settled`. Call `await log.drain()` before reading an asynchronous sink.
- **`eventLog`** receives lifecycle events: `session.started`, `session.result`, `session.failed`, `session.cancelled`, `session.completed`. Use `createMemorySessionEventLog` or `createAppendOnlySessionEventLog`, or implement `SessionEventLog`.
- **`onSelection`** reports which executor was chosen and which configuration layer decided it, before anything is spawned.

brambo persists no transcript of what the executor said. If you need one, capture it from `envelope.data` or from the adapter's stream callbacks.

## Bring your own workspace provider

`createProvider` replaces the mounted workspace plugin. Return a **fresh** provider on every call: the session disposes it on every path, so a pooled provider comes back disposed and the next session fails with `BRAMBO_CONTRACT_PROVIDER_DISPOSED`.

```ts
import { runSession } from '@brambodev/session'
import { LocalWorkspaceProvider } from '@brambodev/workspace-local'

const envelope = await runSession({
  prompt: 'List the files',
  createProvider: () => new LocalWorkspaceProvider({ rootDir: '/var/lib/acme/workspaces' }),
})
```

`createProvider` cannot be combined with a supplied `kernel`.

## Concurrency

Separate `runSession` calls are independent unless they share a kernel. On a shared kernel, `maxConcurrent` caps simultaneous runs; two sessions are distinguishable in the record stream because each action id is `session.executor-run#<workspaceId>`.

## Cleanup guarantees

On every path, success, failure, cancellation or a throw, `runSession` runs its cleanup in a fixed order and contains each step, so a cleanup failure never replaces your result: remove the interrupt handler, release the workspace lease, dispose a provider it created, deactivate a method, stop a kernel it built.

The workspace directory is deliberately left on disk. Schedule removal with `inspectLocalWorkspaces` / `removeLocalWorkspace` (or `inspectWorktrees` / `removeWorktree`), which only delete directories brambo holds an ownership record for.

## Next steps

- [Cancellation, timeouts and retries](./cancellation-timeouts-retries): deadlines are yours to set.
- [Executors and workspaces](./executors-and-workspaces): pick the executor and provider.
- [Tools and sandbox](./tools-and-sandbox): run tools under a sandbox policy.
