---
title: The three worlds
audience: Developers evaluating or adopting brambo
prerequisites: Node.js >=20
outcome: Know which world your problem belongs to and the vocabulary each one uses
scope: Public SDK concepts and package grouping
compatibility: Published packages support Node.js >=20
translationStatus: original
---
import Diagram from '@site/src/components/Diagram'
import ThreeWorlds from '@site/src/components/diagrams/ThreeWorlds'

# The three worlds

brambo's packages answer three different questions. Each world has its own entry package and vocabulary, and all three share only the contracts package and the kernel. You install the world you need and nothing else.

<Diagram><ThreeWorlds /></Diagram>

## Session world: run one turn

**Question:** "Run this prompt with this executor in this workspace and tell me what happened."

| Concept | Meaning |
|---|---|
| Executor | A coding agent: a vendor CLI (`claude-code`, `codex`, `opencode`) through `adapter-cli`, or a hosted model API through `adapter-api` with `adapter-openai` or `adapter-anthropic`. |
| `ExecutorAdapter` | The port: `run(request) → ResultEnvelope`. |
| Workspace | A directory the run happens in, created by a `WorkspaceProvider` (`workspace-local` or `workspace-git-worktree`) and held through a lease. |
| `ResultEnvelope` | The typed result: `status` (`ok`, `failed`, `cancelled`), `summary`, `data`, `changedPaths`, `errors`. |
| Sandbox | An optional `SandboxProvider` that executes explicit tool argv under a policy. Not a wrapper around the executor process. |

Entry point: `runSession` in `@brambodev/session`. Start with [Your first session](../tutorials/first-session).

## Durable world: survive crashes and takeovers

**Question:** "Run a task graph that can stop, crash or move to another worker without doing work twice or losing it."

| Concept | Meaning |
|---|---|
| `RunStore` | The durable port: snapshots committed by compare-and-swap on a revision, events, command receipts and leases. |
| Lease and fencing epoch | A time-bounded claim on resources (`run:<id>`, `workspace:<id>`, `task:<run>:<task>`). Each acquisition bumps an epoch so a stale owner cannot commit. |
| Command receipt | Idempotent admission of a `start`, `continue` or `cancel` command keyed by `clientId` and `idempotencyKey`. |
| Effect journal | Per-task record of tool effects (`read-only`, `idempotent`, `non-idempotent`) so a recovery replays completed results and refuses to guess about uncertain ones. |
| `ArtifactProvider` | Immutable, content-addressed workspace revisions: stage, then publish under a lease. |

Entry point: `runDurableWorkflow` in `@brambodev/orchestration`, with `workflow-store-sqlite` as the reference store. Read [Durability model](./durability) next.

## Environment world: project configuration

**Question:** "Keep one canonical list of skills and MCP servers and write it into each vendor's native configuration, reversibly."

| Concept | Meaning |
|---|---|
| Registry | Scoped storage (`global`, `project`, `agent`) of `skill` and `mcp-server` entries. |
| Projection | Writing registry entries into each executor's native file at the location that executor reads. |
| Ownership ledger | The record of what brambo wrote, so drift is reported and reversal removes only brambo's output. |
| Remediation | Explicit `adopt`, `release`, `repair` and `discard` verbs, each with an `inspect` preview. |

Entry points: `registry`, `projection` and `environment`; the `brambo` CLI is their thin command-line binding.

## Shared vocabulary

| Concept | Meaning |
|---|---|
| Contract | A typed port plus its behavioral rules and a runnable clause suite. |
| Provider | A replaceable implementation of a contract. |
| Plugin | A kernel-mounted unit with a manifest that declares the services it provides and consumes. |
| Configuration layers | `defaults → global → project → agent → invocation`; later layers override earlier ones. |
| Typed absence | Unavailable information is reported as an explicit absence or a coded error, never as a fabricated zero or a bare `null`. |

## Next step

Read [Architecture and topology](./architecture) for how the worlds are layered, then [Design principles](./principles).
