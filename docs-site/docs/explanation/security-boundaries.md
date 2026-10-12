---
title: Security boundaries
audience: Host integrators and security reviewers
prerequisites: Node.js >=20
outcome: Know exactly what brambo enforces, what it delegates to your host, and what it does not claim
scope: Trust boundaries of the 0.5.x SDK
compatibility: Published packages support Node.js >=20
translationStatus: original
---
import Diagram from '@site/src/components/Diagram'
import TrustBoundary from '@site/src/components/diagrams/TrustBoundary'

# Security boundaries

brambo enforces ownership, validation and lifecycle boundaries. It does not turn a vendor process into an operating-system sandbox, and it does not authenticate anyone. Read this page as a split of responsibilities: what brambo does, and what your host must do.

<Diagram><TrustBoundary /></Diagram>

## What brambo enforces

- **Validated inputs.** Contract validators reject malformed envelopes, policies, leases and manifests with coded errors. Configuration rejects cycles and prototype-polluting keys, then freezes its snapshot.
- **Workspace leases.** Handles are single-use leases; forged handles and double release are coded refusals. Removal deletes only directories brambo holds an ownership record for.
- **Projection ownership.** Vendor content brambo did not write is never changed silently; drift is reported.
- **Fenced durable writes.** A writer whose lease was taken over cannot commit (see [Durability model](./durability)).
- **Exact argv.** Tool execution passes argv arrays to the sandbox provider. No shell string is parsed and no arbitrary JavaScript handler is accepted.
- **Secret redaction in results.** The CLI adapter redacts its environment secrets and common credential shapes (`Bearer …`, `sk-…`, `ghp_…`, `AKIA…`, `xox?-…`) from failure text before it reaches an envelope. The API adapters redact each run's credential from request ids, headers, usage and summaries.

## What brambo does not enforce

**brambo is not a sandbox.** `adapter-cli` starts ordinary child processes with the user's privileges. It sets the working directory to the workspace, but the executor can reach any path its process can.

| Executor | Launched as | Permission posture |
|---|---|---|
| `claude-code` | `claude --print --output-format stream-json --verbose --no-session-persistence --dangerously-skip-permissions` | Claude Code's own permission prompts are **disabled**; there is no interactive approver. |
| `codex` | `codex exec --json --skip-git-repo-check` | No sandbox flag is passed, so Codex applies its own default (read-only) sandbox. |
| `opencode` | `opencode run --format json -- <prompt>` | OpenCode's own configuration applies. |

```text
workspace root: the starting directory for the child process
OS sandbox: not provided by the CLI adapter
vendor permissions: controlled by the executor and its configuration
```

A `MethodPlugin` is not a sandbox. Discovering a tool through a `ToolProvider` is not authorization to execute it; execution goes through `executeTool`, a `ToolExecutor` and a caller-owned sandbox session.

Sandbox providers state their evidence instead of promising isolation. `sandbox-local` advertises Linux bubblewrap only after a functional probe passes; macOS uses Seatbelt with filesystem evidence only; Windows requires an external broker. `sandbox-remote` is a transport you inject, not a bundled protocol. No OS isolation is claimed where a provider has not demonstrated it on that platform.

## What your host owns

| Concern | brambo does | Your host does |
|---|---|---|
| Authentication | Passes a `Principal` you supply to the store; the coordinator calls your `authenticate` and `authorize` callbacks. | Identifies callers, terminates TLS, deploys the endpoint. |
| Credentials | Accepts an opaque credential per API run and redacts it. | Stores, rotates and injects secrets; never puts them in brambo config. |
| Tool approval | Calls your `permissionAuthorizer` or `approveTool`; refuses when neither approves. | Decides what a tool may do and who approves it. |
| Isolation | Validates sandbox policy against provider evidence. | Chooses a provider, platform and policy that actually isolates. |
| Deadlines and cost | Enforces kernel budget caps you configure. | Sets deadlines, aborts runs, caps provider spend. |
| Retention | Leaves workspaces on disk; persists no transcript. | Decides what to keep, where, and for how long. |

## Safe integration checklist

1. Treat the workspace path as a starting directory, not a containment guarantee.
2. Run executors under an OS account, container or VM whose reach you accept.
3. Keep vendor credentials and permissions under vendor controls.
4. Branch on `BramboError.code`, not message text.
5. Run the relevant contract suite for every provider or adapter you add.

## Honest reporting

If brambo cannot measure a capability, it reports typed absence. It does not infer isolation or permissions from a path or a missing event.

## Next step

Read [API adapter security](./api-adapter-security) for hosted-model boundaries and [Compatibility](../reference/compatibility) for runtime limits.
