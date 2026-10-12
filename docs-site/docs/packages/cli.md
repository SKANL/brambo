---
title: cli
audience: Developers integrating @brambodev/cli
prerequisites: Node.js >=20
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/cli 0.5.x'
compatibility: Node.js >=20
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/cli

<Badge status="stable">Stable</Badge>

*Stable: covered by its tests (and its contract suite where the port has one) and exercised by brambo's own session or CLI path. brambo is pre-1.0, so breaking changes remain possible and are called out in the changelog.* [Status criteria](../reference/package-status).

The `brambo` command: argument parsing, JSON output and exit codes over `@brambodev/session` and `@brambodev/environment`, and nothing more. It reads no files itself and cannot compose a kernel; lint rules enforce both. Library hosts should use the SDK packages instead.

| | |
|---|---|
| World | Supporting |
| Topology tier | 8 |
| Node.js | `>=20` |
| Depends on | [`adapter-anthropic`](./adapter-anthropic), [`adapter-api`](./adapter-api), [`adapter-openai`](./adapter-openai), [`environment`](./environment), [`session`](./session) |

## Install

```bash
npm install --global @brambodev/cli
```

## Example

```bash
npm install --global @brambodev/cli
brambo run --executor codex "List the files in this workspace"
brambo doctor
```

## Ports

- **Implements:** `runBrambo(argv, options)` and the `brambo` binary.
- **Consumes:** `session`, `environment`, `adapter-api`, `adapter-openai`, `adapter-anthropic`.

## Errors

Exit codes: for `run`, `0` ok envelope, `1` failed or cancelled envelope, `2` usage or environment failure. Coded errors are printed, not parsed from messages.

## Limits

- A convenience binding, not the architecture.
- Never loads a provider named by argv or configuration; API profiles need a host-supplied registry.

## How it works

- **A thin binding.** The CLI parses argv, calls `@brambodev/session`, prints the envelope as JSON and maps it to an exit code. `eslint.config.js` forbids it from importing `node:fs`, so any capability that needs a file read lives in `session` or `environment`.
- **Selection is announced.** Every run writes one stderr line such as `executor: codex (selected by the 'project' layer)`. Scripts should branch on the exit code, not on the presence of stderr output.
- **Unusable configuration is never a silent fallback.** A missing document is an absent layer; one that exists but cannot be used (unreadable, a dangling symbolic link, invalid JSON, not an object, a non-string `executor`) exits 2 with `BRAMBO_CONFIGURATION_UNUSABLE`. `--executor` overrides a document brambo can read; it does not rescue one it cannot.
- **Scope comes from the grammar.** `brambo <verb>` is the machine scope and `brambo project <verb> … [directory]` a project's. There is no `--scope agent`, because the agent scope is in memory and would persist nothing.
- **`add` registers, never projects.** It prints the command that would deliver the entry, derived from the same planner `brambo init` uses, and says so when nothing at that scope would take it (`NOTHING TAKES IT HERE`). The retired `tool` and `profile` types are usage errors for `add`, but `brambo remove` still accepts them so an older registry can be emptied.
- **`remediate` acts on one named finding.** Zero or several matches are refusals that list what could have been named; without `--apply` it only describes.
- **`status` invokes no executor and writes nothing.** It reports the quota windows the vendor published on the last run, never averaged or converted; a missing surface is `BRAMBO_USAGE_NO_SURFACE` and an executor not yet run is `BRAMBO_USAGE_NOT_OBSERVED`, never `0%`. Today only `claude-code` publishes such a surface.

## See also

- [CLI appendix](../how-to/run-cli)
