# @brambodev/adapter-cli

Every shipped `ExecutorAdapter` (`@brambodev/contracts`) that drives an out-of-process coding CLI.
One generic engine spawns the binary headlessly inside a workspace's root path and maps its
output to a typed `ResultEnvelope`; each executor is a trait RECORD over that engine, never a
class of its own.

## Trait table

`ExecutorTraits` = `{executorId, command, args, promptDelivery, promptArgSeparator?, output}`.
The two real structural axes are prompt delivery and payload shape — everything else is shared
machinery. The factory validates the record and rejects the shapes that would fail silently
(empty `command`, empty `resultPath`, empty `errorStatusPrefix`, `usagePaths` that is empty or
names an empty path, `usagePaths` without the `usageWhen` that bounds it, a `metadata` key colliding with
an engine-owned `data` key) with a coded error.

| Executor | Invocation | Prompt | Payload | Result |
|---|---|---|---|---|
| `claude-code` | `claude --print --output-format stream-json --verbose --no-session-persistence --dangerously-skip-permissions` | stdin | JSONL events | `result` where `type == "result"` |
| `codex` | `codex exec --json --skip-git-repo-check` | stdin (positional omitted) | JSONL events | `item.text` where `item.type == "agent_message"` |
| `opencode` | `opencode run --format json -- <prompt>` | final argv entry | JSONL events | `part.text` where `part.type == "text"` |

Adding a fourth executor means adding a record — `test/trait-stub.test.ts` proves it by passing
the whole clause suite with a trait record the engine has never seen.

All three are reachable from `brambo run --executor <id>` and from
`.brambo/config.json`'s `executor` key (Story 2.7c). This package owns the catalogue that maps an
id to its adapter — `EXECUTOR_CATALOGUE`, `DEFAULT_EXECUTOR_ID`, `createExecutorAdapter` — because
the kernel plugin below has to perform that lookup for itself.

### As a kernel plugin

`createExecutorPlugin()` mounts an adapter on a `@brambodev/kernel` container. It reads WHICH executor
from the kernel's composed configuration (its own `executor` key, the same one `.brambo/config.json`
spells), rejects activation when that key names nothing this package ships, and provides the
`executor` service.

That service is a **runner**, not an adapter: `{ executorId, run(actionId, request) }`. The adapter
is closed over and never handed out, so every run registers an action on the KERNEL's interception
waterfall and a cap refuses before a process is spawned. What that closes is the container's
surface — anyone who imports `createClaudeCodeAdapter` from here can still drive one directly, and
`deferred-work.md` keeps that open rather than claiming otherwise.

### Finding the result in a JSONL stream

The engine reads the stream once and keeps two records: the first one that reports a failure, and
the last one carrying a usable result. Codex's `ThreadEvent` variants and OpenCode's event types
are their own evolving vocabularies, so matching on event NAMES would break brambo on their next
release; the engine only matches the paths a trait record names, which costs nothing when the
stream ends in trailing noise.

Failure detection is deliberately non-positional. OpenCode emits recoverable `error` events and
keeps going, so "last qualifying line wins" would silently drop a reported failure whenever any
output followed it.

A result path alone is not enough to identify the answer: codex `reasoning` items and opencode
`reasoning` parts both carry a `text` field, so both records add a discriminator. Without one the
adapter would confidently return chain-of-thought as the result.

### Working directory

All three CLIs accept a cwd flag (`-C`, `--dir`), and none of them is passed: the spawn seam
starts the child in `workspace.rootPath`. Codex additionally needs `--skip-git-repo-check`
because a brambo workspace is not necessarily a git repository.

The cwd is **not** the only mechanism, and believing it was is what M4.A found. `opencode`
resolves its file tools against `$PWD` rather than against `process.cwd()`, so with brambo's own
`PWD` inherited it wrote into the directory brambo was launched from — twice, reproducibly. The
spawner therefore hands every child a `PWD` equal to the cwd it is given. Two mechanisms, and for
opencode the second one is the load-bearing one.

### What the workspace is, and what it is not

Measured per executor against the real binaries (`test/confinement-live.test.ts`):

| Executor | A workspace-relative write | Notes |
|---|---|---|
| `claude-code` | lands in the workspace | resolves against its cwd; ignores a lying `PWD` |
| `codex` | never happens | `codex exec` defaults to the `read-only` sandbox, so **as brambo ships it codex cannot create or edit a file at all** |
| `opencode` | lands in the workspace | resolves against `$PWD`, which brambo sets to the cwd |

**brambo makes the workspace true; it does not enforce it.** Told to write to an ABSOLUTE path
outside the workspace, `claude` did so without hesitating — brambo runs it with
`--dangerously-skip-permissions` and spawns an ordinary child with the user's own privileges, and
nothing sits between the two. (`codex` refused, but that is codex's own sandbox, not brambo's.)
OS-level sandboxing is a deliberate non-goal here.

And `HOME` is passed through untouched, because scrubbing it would break all three: per-user
executor state is therefore SHARED across concurrent sessions — `opencode` keeps a single SQLite
database under `~/.local/share/opencode/`, `claude` a per-project directory under `~/.claude/`.
Two isolated workspaces do not imply two isolated executors.

### Argument delivery is a trust boundary

Putting the prompt in argv means the OS — and on win32 possibly a shell — parses caller-supplied
text, so that path is guarded:

- A `--` separator (trait data) keeps a prompt starting with `-` out of flag position.
- A prompt beyond the platform's conservative argv bound is refused with a coded envelope naming
  the limit, rather than surfacing as an unattributable spawn error.
- A win32 `.cmd`/`.bat` command can only start by rerouting through `cmd.exe`, which interprets
  `&`, `|`, `>`, `^` and `%VAR%` no matter how the argument is quoted. The run fails closed with
  a coded `executorUnavailable` naming the way out (point `command` at the real executable).
  Escaping for `cmd.exe` is not a winnable game and is not attempted.

## Envelope guarantees

Identical for every adapter: coded `executorUnavailable` when the binary cannot spawn,
`executorRunFailed` on pipe/stream errors, non-zero exits, unparseable output and
executor-reported failures (even at exit code 0), and a `cancelled` envelope with a non-empty
`errors` array on abort. Completion is observed before an abort can claim cancellation, so an
abort landing after a successful exit yields the real `ok` envelope. Cancellation kills the whole
process tree (`taskkill /T /F` on win32, process-group SIGKILL on posix) and never signals a pid
that has already exited.

A structured payload survives a non-zero exit: codex and opencode exit non-zero exactly when they
have printed their error event, so the envelope is built from that payload rather than from
stderr noise. A capture that hit the stream cap is reported as a coded failure naming the
truncation — an `ok` built from the last event that happened to survive the cut would be a
confident wrong answer.

## Child-process seam

All spawning goes through `ChildProcessSpawner` (`spawn-seam.ts`). Production uses
`createNodeChildSpawner()`; every adapter suite injects a fake, so no executor is ever really
started by a test. The spawner is also the orphan-detection surface: after cancellation, and
after a broken stdin pipe, no child may remain unsettled-and-unkilled.

Two suites do spawn real processes, and neither runs an executor: `test/overhead.test.ts` and
`test/tree-kill.test.ts` spawn `process.execPath` (part of `pnpm check`, no network, no auth).
Four suites run a real coding CLI, and each one spends account credit:
`test/live-smoke.test.ts`, `test/usage-live.test.ts`, `test/confinement-live.test.ts` and
`test/stream-mode-live.test.ts`. The authoritative roster is
`packages/contracts/test/live-suite-naming.test.ts`, which reddens when a live suite
escapes the exclusion glob — this sentence used to say "three", and the fourth was
the one the glob had already learned to catch twice.

### Restricting child environment inheritance

Pass `inheritEnv` to any CLI adapter to inherit only the named host variables. The default
remains full inheritance for compatibility; `inheritEnv: []` inherits none. Explicit `env`
values are applied afterward, and `PWD` is always reset to the workspace root. On Windows,
overrides are case-insensitive, so `Path` replaces inherited `PATH` rather than competing with it.

```typescript
import { createClaudeCodeAdapter } from '@brambodev/adapter-cli'

const adapter = createClaudeCodeAdapter({
  inheritEnv: ['PATH', 'SystemRoot', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP'],
  env: { OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '' },
})
```

Choose the runtime, profile, temporary-directory, and locale variables required by your platform
and CLI. Retaining profile paths preserves normal authenticated-session lookup; do not allowlist
unrelated secrets, API keys, or execution hooks such as `NODE_OPTIONS`. Caller-supplied `env`
values are trusted configuration and may intentionally add other variables. Custom
`ChildProcessSpawner` implementations must honor `inheritEnv` themselves.

This filters environment inheritance, not filesystem access: profile state remains shared and
CLI sandbox/tool permissions must still be configured separately.

## Spawn-overhead instrumentation

Pass `onTiming` to receive `{ spawnSetupMs, runMs }` per run. NFR-9 budgets adapter-added overhead
at ≤150ms above raw CLI startup; the deterministic measurement lives in `test/overhead.test.ts`
(adapter vs direct spawn of the same trivial command — no network, no auth, no flake).

## Live smoke

`test/live-smoke.test.ts` runs one tiny real task end-to-end when the `claude` binary is detected
and authenticated; otherwise it skips with an explicit reason (never silently passes).
Set `BRAMBO_LIVE_SMOKE=0` to disable it explicitly. It is env-gated by design and is never part of
what `pnpm check` guarantees.

## Confinement

`test/confinement-live.test.ts` measures, per executor, where a file the executor was told to
create actually lands. The same rule applies: a missing or non-answering binary skips with its
reason, an authenticated-but-logged-out one skips, and `BRAMBO_LIVE_CONFINEMENT=0` disables it.
Because that means CI — where none of the three binaries exists — runs it green while measuring
nothing, its last case PRINTS which executors were measured; read that line before trusting a
green run. Its deterministic half (what environment the spawner hands a child) runs everywhere and
needs no binary.

## Token usage

A trait record may declare where its vendor reports what a run spent:

- `usageWhen` — the records that carry usage (`{"type": "turn.completed"}` for codex,
  `{"type": "step_finish"}` for opencode, `{"type": "result"}` for claude-code).
- `usagePaths` — the numeric fields inside such a record. They are summed within a record
  **and across every matching record**, because a vendor that works in steps bills each step.

The total lands on `envelope.data.usage` as a NUMBER — the one non-string value there, and the
reason `usage` is an engine-owned key a `metadata` key may not collide with. Absent means the
vendor reported nothing; the figure is never faked, never estimated and never tokenized by brambo.
It fails closed as a whole: if any billed record cannot be read, the run reports no figure rather
than a sum missing a term.

Every shipped figure is verified against the real binary by `test/usage-live.test.ts`, which is
also what keeps a fourth adapter from shipping a `usagePaths` nobody ever exercised.

## Typed model controls (opt-in)

`modelControls?: EffectiveExecutionConfiguration` is a resolved factory default;
`RunRequest.executionConfiguration` replaces it atomically for one invocation. Model identity
is `effective.model`, never a configuration field. Omission preserves all legacy argv,
trusted-host `extraArgs`, stdin/separators, parsers, cancellation and environment behavior.

| Native interface / contract | Configuration key | Evidence-pinned declared version | Native arguments (after fixed args) |
|---|---|---|---|
| `CodexModelConfiguration` / `CODEX_CONTROL_CONTRACT` | `reasoningEffort` | `0.162.1` | `--model <model> --config model_reasoning_effort="<effort>"` |
| `ClaudeCodeModelConfiguration` / `CLAUDE_CODE_CONTROL_CONTRACT` | `effort` | `2.1.111` | `--model <model> --effort <effort>` |
| `OpenCodeModelConfiguration` / `OPENCODE_CONTROL_CONTRACT` | `variant` | `1.18.35` | `--model <provider/model> --variant <variant>` |

The model arguments are omitted when no model is selected, preserving the CLI's native default.
Codex exposes its documented named effort values; Claude conservatively exposes
`low`, `medium`, `high`, `xhigh` (not `max` or `ultracode` for this pinned evidence).
OpenCode variants are provider-specific nonempty tokens, not a universal effort enum.
The host resolver must further constrain these values for its model/native default;
synthetic support receipts do **not** prove vendor model support or installed CLI qualification.

Sources: [Codex tagged shared model flags](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/utils/cli/src/shared_options.rs),
[tagged config overrides](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/utils/cli/src/config_override.rs),
[tagged effort vocabulary](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/protocol/src/openai_models.rs),
[Claude release/changelog](https://github.com/anthropics/claude-code/releases/tag/v2.1.111),
[Claude CLI reference](https://code.claude.com/docs/en/cli-reference),
[OpenCode tagged run flags](https://github.com/anomalyco/opencode/blob/v1.18.35/packages/opencode/src/cli/cmd/run.ts).

The host must declare `executorVersion`; it must equal the frozen envelope's version and
one of the trait's explicitly evidenced versions. Unknown versions, foreign providers,
unknown/reserved configuration fields, missing receipts and raw conflicting model/config
flags reject **before spawn**, without echoing control values. This does not probe binaries.
Typed controls require a direct executable on Windows: `.cmd`/`.bat` shims interpret argv
as shell syntax even when prompts go over stdin. Controlled invocations pass
`allowShellFallback: false` to the spawner: an asynchronous Windows `EINVAL` fails rather
than retrying argv through `cmd.exe`. Custom spawners must honor this per-invocation
boundary. Omission preserves the legacy shell fallback for trusted raw-host paths.

`buildCliModelArguments(traits, effective, executorVersion)` returns the full fixed/native
argv; the engine then appends trusted-host `extraArgs` and its existing prompt delivery.
It is a synchronous projection, not support admission: invocation separately consumes the
shared contracts validator for schemas and receipts. New settings do not change sandbox,
approval, tools, authentication or config-loading policy. Claude's existing permission-bypass
flag remains exactly the baseline, not a permission granted by model configuration.

Custom hosts can supply `ExecutorTraits.modelControls: CliModelControlTraits` to
`createCliExecutorAdapter`: their own contract, explicitly evidenced versions, native flags,
and `argumentIndex` for root/subcommand scope. Every configuration descriptor must have
exactly one native mapping; extension-only argv registrations are currently unsupported.
Native projection schemas must be synchronous. A host may extend a built-in trait's version
list only with its own evidence, or update an adapter mapping when flags change. There is no
closed provider/model enum and no inferred semver compatibility range; host/plugin metadata
is trusted code, not isolation against a malicious host. Future versions need that explicit
extension/update rather than guessed compatibility.

### Coverage and qualification boundary

**Chain integration pending:** direct CLI controls and custom trait mappings are
available in this slice. Configured driver construction and worker replay described
below arrive with integration slice 7; they are not current SDK/runtime guarantees.

The table above lists the complete built-in typed surface: model plus Codex
reasoning effort, Claude effort, and OpenCode variant. It does not imply API/CLI
parity, an arbitrary argv extension bag or every vendor-native option. Custom
traits supply schemas and exact native mappings through the same engine; custom
drivers will register through `createDriverRegistry` and opt into `createConfigured` after slice 7.

Host model-support evidence and host executor-version evidence are independent.
Matching the built-in evidence-pinned version does not establish that a model
supports a requested value; `requiredSupport` and unverified-support decisions
are resolved before invocation. An unknown matching host/envelope version still
rejects unless the trusted trait explicitly evidences it. After slice 7, worker replay additionally
checks `executorVersionForTask` without probing an ambient binary.

No-shell typed invocation and `inheritEnv` filtering are trust boundaries, **not
an OS sandbox**. Hosts must choose policy separately and custom spawners must honor
`allowShellFallback: false`. CLI config loading/profile state remains native-owned;
these controls do not isolate accounts or change Claude's baseline permission bypass.
Legacy omission preserves existing raw-host configuration; a controlled run uses
only its selected envelope for model controls. Synthetic argv/zero-child tests and
actual Node spawn-entry tests prove local boundary behavior, not installed/native
binary qualification or filesystem confinement.
