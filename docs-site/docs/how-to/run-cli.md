---
title: CLI appendix
audience: Developers who want the brambo command line
prerequisites: Node.js >=20 and a separately installed executor
outcome: Run brambo from a terminal, manage the registry and environment, and script against its exit codes
scope: The complete brambo command-line surface in 0.5.x
compatibility: Published CLI packages support Node.js >=20; vendor executors have their own requirements
translationStatus: original
---
# CLI appendix

`@brambodev/cli` provides the `brambo` command: argument parsing, JSON output and exit codes over the SDK, and nothing else. It reads no files itself and cannot compose a kernel. If you are building a product, use `@brambodev/session` and the other SDK packages directly; this page is for terminal use and scripts.

## Install and run

```bash
npm install --global @brambodev/cli
brambo run "List the files in this workspace"
brambo run --executor codex --trace "List the files in this workspace"
```

`run` prints the `ResultEnvelope` as JSON on stdout and one line on stderr naming the selected executor and the configuration layer that decided it. `--trace` writes the kernel's action records to stderr as they happen; stdout stays the envelope. Inside the repository, `pnpm brambo ...` is a development convenience, not the consumer install path.

With a host that registers API providers (through `runBrambo` and its `apiRegistry` option), `brambo run --executor-profile api:<providerId> --model <model> "<prompt>"` runs an API executor. The standalone binary never loads a provider named on the command line or in configuration.

## Commands

| Command | Does |
| --- | --- |
| `brambo run [--executor <id>] [--trace] "<prompt>"` | Runs one prompt in a new workspace under `.brambo/workspaces`. |
| `brambo add <skill\|mcp-server> <id> [--command <c>] [--entry-path <p>] [--arg <a>]...` | Registers one entry; projects nothing. Prefix with `project` for project scope. |
| `brambo remove <type> <id>` | Removes one entry; accepts retired types. |
| `brambo list` | Lists every entry with its type, id and scope. |
| `brambo export <path>` / `brambo import <path>` | Moves the machine registry as a bundle; entries that look like credentials are left out and named. |
| `brambo ingest [--dry-run]` | Adds the skills and MCP servers already on this machine; never removes anything. |
| `brambo init` / `brambo project init [directory]` | Prepares the machine or a project and projects into every detected executor. |
| `brambo doctor` / `brambo project doctor [directory]` | Reports what init would change and every problem it sees. Writes nothing. |
| `brambo status` | Reports the usage each executor last published. Invokes no executor. |
| `brambo remediate <adopt\|release\|repair\|discard> [--executor <id>] [--entry <id>] [--apply]` | Leaves one state doctor reported; describes only unless `--apply`. |
| `brambo swap <executor\|method> <id>` | Writes the selection into brambo's own config and reports the layer that actually decides. |
| `brambo workspace remove [<id>]` | Removes a workspace brambo owns, or finishes interrupted removals. |
| `brambo --help`, `brambo --version` | Usage and version. |

Scope comes from the grammar: a leading `project` word means project scope. There is no agent-scope command.

## Exit codes

| Command | `0` | `1` | `2` |
| --- | --- | --- | --- |
| `run` | `ok` envelope | `failed` or `cancelled` envelope (still printed) | Usage, invalid request, configuration or environment failure |
| `init` | No target failed | A target failed to project | No executor detected, or another failure |
| `doctor` | Clean | At least one problem finding | No diagnosis could be produced |
| `status` | A report was produced | Not used | No report could be produced |
| `remediate` | Described or performed | Refused (`BRAMBO_PROJECTION_REMEDIATION_REFUSED`) | Usage or environment failure |
| `remove` | Removed | Entry not registered at that scope | Usage or registry failure |
| `workspace remove` | Done or nothing to do | Refused, or an id brambo does not own | Usage or environment failure |

Branch scripts on the exit code, not on stderr.

## Files

| File | Purpose |
| --- | --- |
| `~/.brambo/config.json` | Global configuration (`executor`, `method`, `workspace`) |
| `<project>/.brambo/config.json` | Project configuration; a project `method` is a recommendation and is not loaded |
| `~/.brambo/registry.json`, `<project>/.brambo/registry.json` | Registry stores |
| `~/.brambo/projection-ledger.json` | Projection ownership ledger |
| `~/.brambo/usage-observations.json` | Usage reported by executors, read by `status` |
| `<cwd>/.brambo/workspaces/` | Workspaces created by `run` |

Selection order for the executor is the built-in default (`claude-code`), then the global document, then the project document, then `--executor`. A missing document is an absent layer; an existing invalid one exits `2` with `BRAMBO_CONFIGURATION_UNUSABLE`.

```json
{ "executor": "codex", "workspace": { "provider": "git-worktree" } }
```

## What the CLI does not do

It does not sandbox the executor (Claude Code runs with `--dangerously-skip-permissions`), set timeouts, retry, persist transcripts, or delete workspaces on its own. Those limits are the SDK's; see [Known limitations](../reference/known-limitations).

## Next step

For configuration keys see [Configuration](../guides/configuration); for failures see [Troubleshooting](../reference/troubleshooting).
