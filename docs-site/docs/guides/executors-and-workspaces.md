---
title: Executors and workspaces
audience: Host integrators choosing how a session runs
prerequisites: Node.js >=20 and a separately installed executor CLI or API access
outcome: Choose between CLI and API executors and between local and git-worktree workspaces, and configure each
scope: Included executor adapters and workspace providers in 0.5.x
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# Executors and workspaces

An executor runs the prompt; a workspace provider decides where it runs. They are separate ports (`ExecutorAdapter` and `WorkspaceProvider`) and you choose them independently.

## CLI executors or API executors

| | CLI executors (`adapter-cli`) | API executors (`adapter-api` + provider) |
|---|---|---|
| What runs | The vendor's coding agent as a child process | HTTP requests to a hosted model |
| Included | `claude-code` (default), `codex`, `opencode` | `openai`, `anthropic` |
| Who edits files | The vendor agent, with its own tools | Your host, through the local tool loop and `executeTool` |
| Credentials | The vendor CLI's own sign-in | Injected by your host per run |
| Permissions | Vendor posture (see below); brambo is not a sandbox | Every tool call goes through your authorizer or `approveTool` |
| Selection | `executorId` or the `executor` config key | `registry.create(...)` passed as `createAdapter` |

Pick CLI executors when you want the vendor's full agent behavior with minimal integration. Pick API executors when your host must control every tool call, credential and request. See [API executors](./api-executors) for the registry.

## CLI executors

Each CLI executor is a trait record: a command, fixed arguments, how the prompt is delivered, and how the JSON output is parsed.

| id | Command and fixed arguments | Prompt via |
|---|---|---|
| `claude-code` | `claude --print --output-format stream-json --verbose --no-session-persistence --dangerously-skip-permissions` | stdin |
| `codex` | `codex exec --json --skip-git-repo-check` | stdin |
| `opencode` | `opencode run --format json --` | final argument |

**Read the permission posture before you ship.** `claude-code` runs with Claude Code's permission prompts disabled, because a headless run has no interactive approver. `codex` runs under Codex's default read-only sandbox, so as shipped it cannot edit files. All three run with your user's privileges; the workspace is the working directory, not a jail. See [Security boundaries](../explanation/security-boundaries).

Install and sign in to the vendor CLI separately; brambo does neither. Customize the launch through `adapterOptions`:

```ts
import { runSession } from '@brambodev/session'

const envelope = await runSession({
  prompt: 'Fix the failing unit test',
  executorId: 'claude-code',
  adapterOptions: {
    command: '/opt/claude/bin/claude', // a binary that is not on PATH
    inheritEnv: ['PATH', 'HOME'],      // omit to inherit everything; [] to inherit nothing
    env: { ANTHROPIC_LOG: 'error' },
  },
})
```

Other options: `extraArgs`, `spawner` (inject a child-process spawner), `onStreamEvent`, `onTiming`, `onUsageObservation`, and typed `modelControls` (which require a declared `executorVersion` and a direct executable; a Windows `.cmd` or `.bat` shim is refused).

Limits to know:

- stdout and stderr are captured up to 1 MiB each; truncation is flagged in `envelope.data`.
- A prompt passed as an argument (`opencode`) is limited to 30,000 characters on Windows and 100,000 elsewhere.
- Failure text from stderr is redacted for environment secrets and common credential shapes before it reaches `errors`.
- There is no timeout. See [Cancellation, timeouts and retries](./cancellation-timeouts-retries).

## Workspace providers

| Provider | Package | Creates | Good for |
|---|---|---|---|
| `local` (default) | `workspace-local` | `<rootDir>/<uuid>` directory with a `.brambo-workspace.json` ownership record | Scratch work, non-git trees |
| `git-worktree` | `workspace-git-worktree` | A detached `git worktree` at `<stateDir>/trees/w-<n>` with an ownership record | Isolating edits from your checkout while sharing git history |

Both issue single-use leases. `release(handle)` ends a lease and leaves the directory; a second release is `BRAMBO_CONTRACT_WORKSPACE_DOUBLE_RELEASE`. `dispose()` is idempotent and leaves every directory; any call after it is `BRAMBO_CONTRACT_PROVIDER_DISPOSED`.

The git-worktree provider allocates ordinals under a file lock (so concurrent processes never reuse one), creates the worktree detached (no branch), and runs git with no timeout. Git failures surface as `BRAMBO_CONTRACT_WORKSPACE_UNAVAILABLE` with git's own message.

## Select through configuration

`readExecutorConfigLayers` reads `~/.brambo/config.json` and `<project>/.brambo/config.json`:

```json
{
  "executor": "codex",
  "workspace": { "provider": "git-worktree", "rootDir": "/srv/brambo/workspaces" }
}
```

With `git-worktree`, the session uses the project root as the repository. A missing `workspace.rootDir` falls back to `<cwd>/.brambo/workspaces`; an invalid document is `BRAMBO_CONFIGURATION_UNUSABLE`. See [Configuration](./configuration) for every key.

## Remove workspaces

Removal is a separate, explicit step:

```ts
import { inspectLocalWorkspaces, removeLocalWorkspace } from '@brambodev/session'

const root = '.brambo/workspaces'
const { claimed } = await inspectLocalWorkspaces(root)
for (const workspace of claimed) {
  const outcome = await removeLocalWorkspace(root, workspace.id)
  console.log(workspace.id, outcome.kind) // 'removed' | 'refused' | 'unknown'
}
```

Only directories with a matching ownership record are removed. `removeWorktree` additionally refuses a dirty worktree (git refuses it) or one whose HEAD commit no ref contains, so unreferenced work is never deleted.

## Next step

Read [Create an adapter](../how-to/create-adapter) to implement your own executor, or [Use a workspace provider](../how-to/use-workspace-provider) to drive a provider directly.
