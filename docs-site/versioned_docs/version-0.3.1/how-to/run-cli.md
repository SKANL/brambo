---
title: Run the CLI
audience: Developers and maintainers
prerequisites: Node.js >=20 and a separately installed executor
outcome: Run brambo with a selected executor and interpret its output
scope: brambo command-line usage
compatibility: Published CLI packages support Node.js >=20; vendor executors have their own requirements
translationStatus: original
---
# Run the CLI

Install the CLI globally and run a prompt. brambo prints a structured result; the vendor executor must be installed and authenticated separately.

## Quick path

```bash
npm install --global @brambodev/cli
brambo run "list files in this workspace"
```

Inside the repository, `pnpm brambo ...` is a development convenience, not the consumer install path.

## Select an executor

```bash
brambo run --executor codex "list files in this workspace"
```

The shipped ids are `claude-code`, `codex`, and `opencode`. Selection resolves `defaults`, `global`, `project`, then `invocation`; the built-in default is `claude-code`.

## Read output and exit status

The result is pretty-printed JSON on stdout. Every real invocation also reports the selected executor and deciding configuration layer on stderr. Branch scripts on exit code, not stderr presence.

| Exit code | Meaning |
| --- | --- |
| `0` | `ok` result envelope. |
| `1` | `failed` or `cancelled` result envelope. |
| `2` | Usage, request, configuration, or environment failure. |

## Configuration files

Global configuration is `~/.brambo/config.json`; project configuration is `<project>/.brambo/config.json`. A missing layer is absent. An existing invalid document is a coded failure, not silent fallback.

```json
{ "executor": "codex" }
```

## Next step

Use [Troubleshooting](../reference/troubleshooting) when configuration or executor selection fails.
