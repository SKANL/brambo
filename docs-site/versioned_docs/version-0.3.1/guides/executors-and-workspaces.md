---
title: Executors and workspaces
audience: Developers and maintainers
prerequisites: Node.js >=20 and a separately installed executor
outcome: Choose a supported executor and workspace provider
scope: Included implementations and their lifecycle
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# Executors and workspaces

Executor adapters run prompts; workspace providers create and manage workspace leases. These are separate ports and can be selected independently.

## Choose an executor

The included IDs are `claude-code`, `codex`, and `opencode`; the default is `claude-code`. Install and authenticate the vendor CLI separately. Use [Run the CLI](../how-to/run-cli) for invocation details.

## Choose a workspace provider

The included providers are `local` and `git-worktree`. The local provider creates workspace directories; the Git provider manages worktrees and durable ownership records. Both issue single-use leases: release ends a lease, while disposal preserves state. See [Use a workspace provider](../how-to/use-workspace-provider) for lifecycle-safe examples.

## Configure or inject

Set `executor`, `workspace.provider`, and optionally `workspace.rootDir` in the documented config layers. For SDK integrations, use `runSession` defaults or the published `createAdapter` and `createProvider` seams. A contract type alone does not mean a built-in implementation exists.

## Next step

Read [Create an adapter](../how-to/create-adapter) when implementing a custom executor port.
