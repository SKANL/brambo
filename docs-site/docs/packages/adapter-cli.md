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

*Stable: covered by its tests (and its contract suite where the port has one) and exercised by brambo's own session or CLI path. brambo is pre-1.0, so breaking changes remain possible and are called out in the changelog.* [Status criteria](../reference/package-status).

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

## How it works

**Trait records.** `ExecutorTraits` is `{executorId, command, args, promptDelivery, promptArgSeparator?, output}`. The factory rejects shapes that would fail silently with a coded error: empty `command`, empty `resultPath`, empty `errorStatusPrefix`, `usagePaths` without the `usageWhen` that bounds it, or a `metadata` key colliding with an engine-owned `data` key. `test/trait-stub.test.ts` passes the whole clause suite with a record the engine has never seen.

| Executor | Prompt | Result is read from |
|---|---|---|
| `claude-code` | stdin | `result` where `type == "result"` |
| `codex` | stdin | `item.text` where `item.type == "agent_message"` |
| `opencode` | final argv entry, after `--` | `part.text` where `part.type == "text"` |

**Reading the JSONL stream.** The engine keeps the first record that reports a failure and the last record carrying a usable result, matching only the paths a trait names, never vendor event names. Failure detection is not positional, because OpenCode emits recoverable `error` events and keeps going. A discriminator is required because codex `reasoning` items and opencode `reasoning` parts also carry `text`; without it the adapter would return reasoning as the answer.

**Working directory and environment.** The child starts in `workspace.rootPath`, and `PWD` is always reset to it: OpenCode resolves file tools against `$PWD`, so an inherited `PWD` sent its writes to the directory brambo was launched from. `inheritEnv` selects which host variables are inherited (omitted means all), `env` is applied on top, and `extraArgs` go after trait args and before the prompt separator. `HOME` is passed through, so per-user executor state (OpenCode's SQLite database, `~/.claude/`) is shared across concurrent sessions.

**What the workspace is not.** Measured against the real binaries (`test/confinement-live.test.ts`): claude-code and opencode write workspace-relative files into the workspace; `codex exec` defaults to its `read-only` sandbox, so as shipped codex creates no files. Told to write to an absolute path outside the workspace, claude did so. brambo makes the workspace true; it does not enforce it.

**Argument delivery is a trust boundary.** A `--` separator keeps a prompt starting with `-` out of flag position. A prompt longer than the conservative argv bound (30,000 characters on win32, 100,000 elsewhere) is refused with a coded envelope. A win32 `.cmd`/`.bat` command would be rerouted through `cmd.exe`, which interprets `&`, `|`, `>`, `^` and `%VAR%` however the argument is quoted, so the run fails closed with `BRAMBO_EXECUTOR_UNAVAILABLE` naming the fix: point `command` at the real executable.

**Envelope guarantees.** `BRAMBO_EXECUTOR_UNAVAILABLE` when the binary cannot spawn; `BRAMBO_EXECUTOR_RUN_FAILED` on pipe errors, non-zero exits, unparseable output and vendor-reported failures, even at exit code 0. Completion is observed before an abort can claim cancellation, so an abort after a successful exit yields the real `ok`. Cancellation kills the whole process tree (`taskkill /T /F` on win32, process-group `SIGKILL` on POSIX). A structured payload survives a non-zero exit, and a capture that hit the stream cap is a coded failure naming the truncation.

**Observation hooks.** `onStreamEvent({ index, payload, raw })` sees each JSONL record (`payload: null` for a malformed line) without back-pressure; observer failures cannot replace the envelope. `onTiming` receives `{ spawnSetupMs, runMs }`; `test/overhead.test.ts` holds adapter overhead to 150 ms above a raw spawn.

**Token usage.** `usageWhen` selects the records that carry usage (`result` for claude-code, `turn.completed` for codex, `step_finish` for opencode) and `usagePaths` names the numeric fields. They are summed within a record and across every matching record, because a vendor that works in steps bills each step. The total lands on `envelope.data.usage` as a number. It fails closed as a whole: if any billed record cannot be read, no figure is reported. Quota windows go through `onUsageObservation`, never the envelope.

**Live tests are opt-in.** Default checks inject a fake spawner and never start an executor. `test/opencode-live.test.ts` runs only with `BRAMBO_LIVE_OPENCODE=1`; the confinement suite skips any binary that is missing or logged out and prints which executors it measured, so read that line before trusting a green run.

## See also

- [Executors and workspaces](../guides/executors-and-workspaces)
- [Security boundaries](../explanation/security-boundaries)
