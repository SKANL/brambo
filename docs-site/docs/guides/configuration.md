---
title: Configuration
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Configure executor and workspace defaults with supported keys
scope: Public configuration inputs and precedence
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# Configuration

`runSession` receives a configuration snapshot; it does not read files automatically. Use `readExecutorConfigLayers({ projectDir })` to read the global and project layers.

## Files and precedence

The files are `~/.brambo/config.json` and `<project>/.brambo/config.json`. Layers merge in this order: defaults, global, project, agent, then invocation. A present but invalid file produces a coded error; it is not ignored.

## Supported keys

| Key | Default | Purpose |
| --- | --- | --- |
| `executor` | `claude-code` | Included executor ID: `claude-code`, `codex`, or `opencode`. |
| `workspace.provider` | `local` | Included provider: `local` or `git-worktree`. |
| `workspace.rootDir` | `.brambo/workspaces` under the project root | Root directory for managed workspaces. |

Invocation `cwd` sets the project root. Brambo seeds `workspace.rootDir` from that project root in the invocation layer (or the defaults layer when no `cwd` is provided); a configured project `workspace.rootDir` takes precedence through normal layer merging. See [Executors and workspaces](./executors-and-workspaces) to choose a provider.

## Next step

Use [Troubleshooting](../reference/troubleshooting) if configuration cannot be read or validated.
