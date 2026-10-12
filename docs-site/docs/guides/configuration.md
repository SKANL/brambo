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
| `method` | none | Module specifier of a method plugin to mount. Honored from the global layer, a host-supplied (`agent`) document, and the invocation layer only. A `method` in the project document is a recommendation: it is dropped before layers merge (importing it would run a cloned repository's code) and reported through `DeclinedConfigKey`. |

Invocation `cwd` sets the project root. Brambo seeds `workspace.rootDir` from that project root in the invocation layer (or the defaults layer when no `cwd` is provided); a configured project `workspace.rootDir` takes precedence through normal layer merging. See [Executors and workspaces](./executors-and-workspaces) to choose a provider.

## Executor profiles and model controls

Model and provider controls are not keys in `config.json`. They are set in code or on the command line:

- **CLI:** `brambo run --executor-profile api:<providerId> --model <model> "<prompt>"` selects a registered API provider; `--model` is required with an API profile. `--executor <id>` selects a shipped CLI executor for one invocation.
- **SDK:** `validateApiExecutorProfile({ providerId, model })` from `@brambodev/environment/api-executors` validates the same profile for a host.
- **Durable runs:** `resolveExecutionConfiguration(layers, host)` from `@brambodev/orchestration` resolves `providerId`, `model`, `configuration`, and namespaced `extensions` across the `defaults`, `profile`, `task`, and `run` layers, validates them against the provider's `ExecutionControlContract`, and returns a frozen `EffectiveExecutionConfiguration` with support receipts.

## Next step

Use [Troubleshooting](../reference/troubleshooting) if configuration cannot be read or validated.
