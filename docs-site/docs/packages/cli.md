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

## See also

- [CLI appendix](../how-to/run-cli)
