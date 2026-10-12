---
title: Compatibility
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Understand this documentation page
scope: This page
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# Compatibility

Compatibility has two separate answers: the Node version needed to develop brambo, and the version needed to run its published packages.

## Documentation version

The documentation describes the **0.5.x** package line and is built from the `main` branch. Earlier 0.3.x snapshots were retired; the next frozen snapshot is cut from a release tag (see `RELEASING.md`). There is no separate unreleased “Next” documentation site.

## Node versions

| Use | Supported floor |
| --- | --- |
| Repository development, build, and source checks | Node `>=24` |
| Published SDK packages and packed consumers | Node `>=20` |

The repository floor is a developer/tooling constraint. It is not a claim that a consumer must run Node 24. The packed-consumer proof exercises candidates starting at Node 20.

Install the SDK package that owns your boundary:

```bash
npm install @brambodev/session
```

Port authors should add the contracts package:

```bash
npm install --save-dev @brambodev/contracts
```

## Per-package requirements

| Package | Node.js | Extra requirement |
| --- | --- | --- |
| All packages except the two below | `>=20` | None |
| `@brambodev/workflow-store-sqlite` | `>=24.15.0` | `node:sqlite`; older Node.js throws `BRAMBO_WORKFLOW_STORE_UNAVAILABLE` |
| `@brambodev/memory-sqlite` | declares `>=20` | Uses `node:sqlite`; measured only on Node.js 24.14.1 and 26.8.1 |
| `@brambodev/adapter-cli` | `>=20` | The vendor CLI installed and signed in; typed model controls need a direct executable (no Windows `.cmd`/`.bat` shim) |
| `@brambodev/workspace-git-worktree` | `>=20` | `git` on `PATH` |
| `@brambodev/sandbox-local` | `>=20` | Linux: `bwrap` (cgroup v2 for limits); macOS: `sandbox-exec`; Windows: `brambo-windows-sandbox-broker` |

## Platform evidence

The packed-consumer matrix runs on Linux with Node.js 20, 22.13.0, 22.18.0 and 24. Real-host sandbox conformance runs on Linux and macOS only when dispatched; Windows host conformance is not run in CI. See [Claims and evidence](./claims-and-evidence) and [Known limitations](./known-limitations).

## Shipped executors

`@brambodev/adapter-cli` currently provides these IDs:

| ID | Invocation shape | Result source |
| --- | --- | --- |
| `claude-code` | `claude --print --output-format stream-json --verbose --no-session-persistence --dangerously-skip-permissions` | JSONL result event |
| `codex` | `codex exec --json --skip-git-repo-check` | JSONL `agent_message` item |
| `opencode` | `opencode run --format json -- <prompt>` | JSONL text part |

All three are available through the catalogue and the CLI's `--executor` selection. The binary must be installed and authenticated separately; brambo does not install vendor executors.

## Workspace and process limits

- The child starts with the workspace root as its working directory.
- brambo also sets the child's `PWD` to that root because OpenCode resolves file tools from `PWD`.
- `HOME` is inherited, so executor state can be shared across concurrent sessions.
- The adapters do not claim OS-level isolation. Absolute paths can escape the workspace when the vendor process permits them.
- Codex ships with its own read-only default, so it cannot create or edit a file unless its own configuration changes that behavior.

## Packaging condition

Published tarballs resolve consumers through `import` or `require` to `dist`. The `brambo-source` condition is for brambo's own source-based development loop and is not needed by consumers.

## What compatibility does not mean

A common `ExecutorAdapter` result shape does not make vendor protocols interchangeable. Prompt delivery, JSONL payloads, usage surfaces, cancellation, permissions, and sandbox behavior remain executor-specific and are encoded in each trait or adapter.
