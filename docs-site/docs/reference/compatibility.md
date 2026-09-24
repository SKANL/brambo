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

The canonical public documentation is **0.3.1**, matching the current published package line. The **0.3.0** entry remains available as the historical archive; there is no unreleased “Next” documentation site exposed to readers.

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
