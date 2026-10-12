---
title: Your first brambo session
sidebar_position: 1
audience: Host integrators embedding an agent turn
prerequisites: Node.js >=20; an installed and authenticated executor CLI (Claude Code, Codex or OpenCode)
outcome: Run a prompt through runSession, cancel it from your host, and read the ResultEnvelope
scope: Quickstart for @brambodev/session 0.5.x
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# Your first brambo session

`@brambodev/session` runs one executor turn in a fresh workspace and hands back a typed `ResultEnvelope`. It is everything `brambo run` does except argument parsing, JSON printing and exit codes, so your host keeps control of all three.

This takes about five minutes. You need Node.js 20 or newer and one executor CLI that is already installed and signed in. brambo does not install or authenticate executors for you.

## Install

```bash
npm install @brambodev/session
```

`@brambodev/session` re-exports the types and helpers its surface needs; you do not install `@brambodev/contracts` or `@brambodev/kernel` yourself.

## Run a prompt

Create `session.mjs` in the directory you want the agent to work in:

```js
import { runSession } from '@brambodev/session'

const envelope = await runSession({ prompt: 'List the files in this workspace' })
console.log(envelope.status, envelope.summary)
```

Run it:

```bash
node session.mjs
```

With no options, brambo selects the executor from its built-in default layer, creates a workspace under `<cwd>/.brambo/workspaces/<uuid>`, runs the prompt there, then releases the lease and disposes what it built. Pass `executorId` (`'claude-code'`, `'codex'` or `'opencode'`) to choose explicitly.

## Read the result

`runSession` resolves a `ResultEnvelope` for every run that reached the executor, including failed and cancelled ones:

```ts
type ResultStatus = 'ok' | 'failed' | 'cancelled'

interface ResultEnvelope {
  readonly status: ResultStatus
  readonly data: unknown
  readonly summary: string
  readonly changedPaths?: readonly string[]
  readonly errors?: readonly { message: string; code?: string }[]
}
```

A `failed` or `cancelled` envelope always carries a non-empty `errors` array; the contract schema rejects one that does not. Environment failures, such as an invalid prompt, a workspace that cannot be created, or a kernel budget refusal, **throw** a `BramboError` with a `code` instead (`BRAMBO_CONTRACT_*`, `BRAMBO_KERNEL_*`). Handle both:

```js
import { runSession } from '@brambodev/session'

try {
  const envelope = await runSession({ prompt: 'List the files in this workspace' })
  if (envelope.status !== 'ok') {
    for (const error of envelope.errors ?? []) console.error(error.code, error.message)
  }
} catch (error) {
  console.error('environment failure:', error.code, error.message)
}
```

## Cancel from your host

`runSession` has no `signal` option and installs no signal handlers: a library that called `process.on('SIGINT')` would steal the signal from its host. Instead you pass `onInterrupt`, a function that registers brambo's cancel handler and returns a disposer. Wire it to an `AbortSignal` you own:

```js
import { runSession } from '@brambodev/session'

const controller = new AbortController()
setTimeout(() => controller.abort(), 60_000) // your host's deadline, not brambo's

const envelope = await runSession({
  prompt: 'Refactor the utils module',
  onInterrupt: (cancel) => {
    controller.signal.addEventListener('abort', cancel, { once: true })
    return () => controller.signal.removeEventListener('abort', cancel)
  },
})
console.log(envelope.status) // 'cancelled' when the deadline fired first
```

When `cancel` runs, brambo aborts the run's internal signal, the adapter terminates the executor and resolves a `cancelled` envelope, and cleanup still runs in order: the disposer you returned, then the workspace release, then provider and kernel disposal. brambo sets no timeout of its own; the deadline above is entirely yours.

## Use your configuration documents

`runSession` reads no files. Read brambo's configuration layers once and pass the snapshot:

```js
import { readExecutorConfigLayers, runSession } from '@brambodev/session'

const configLayers = await readExecutorConfigLayers({ projectDir: process.cwd() })
const envelope = await runSession({ prompt: 'List the files in this workspace', configLayers })
console.log(envelope.status)
```

Layers resolve as `defaults → global → project → agent → invocation`. See [Configuration](../guides/configuration) for keys and file locations.

## What stays on disk

The workspace directory survives the session: `release()` ends the lease and `dispose()` preserves state so work is not lost. Removal is an explicit, separate call (`inspectLocalWorkspaces` / `removeLocalWorkspace`, or `inspectWorktrees` / `removeWorktree` for git worktrees). brambo persists no transcript of the run; pass an `eventLog` if you want lifecycle events recorded.

## Next steps

- [Executors and workspaces](../guides/executors-and-workspaces): choose the executor and workspace provider.
- [API executors](../guides/api-executors): run against the OpenAI or Anthropic API instead of a CLI.
- [Tools and sandbox](../guides/tools-and-sandbox): what brambo does and does not isolate.
- [Durable orchestration](../guides/durable-orchestration): when one turn is not enough.
