---
title: Use a workspace provider
audience: Developers and maintainers
prerequisites: Node.js >=20 and a published brambo package
outcome: Select a built-in workspace provider and manage lease cleanup safely
scope: WorkspaceProvider integration
compatibility: Published workspace packages support Node.js >=20
translationStatus: original
---
# Use a workspace provider

A `WorkspaceProvider` owns workspace leases, not arbitrary directories. Release the handle returned by `create()` or `acquire()`.

## Use a local workspace

```bash
npm install @brambodev/workspace-local
```

```ts
import { LocalWorkspaceProvider } from '@brambodev/workspace-local'

const provider = new LocalWorkspaceProvider({ rootDir: './.brambo/workspaces' })
const handle = await provider.create()
try {
  console.log(handle.rootPath, handle.capabilities)
} finally {
  await provider.release(handle)
  await provider.dispose()
}
```

Each handle is a single-use lease. Releasing it twice raises `BRAMBO_CONTRACT_WORKSPACE_DOUBLE_RELEASE`; disposal rejects later operations and leaves workspace state in place.

## Use Git worktrees

```bash
npm install @brambodev/workspace-git-worktree
```

```ts
import { GitWorktreeWorkspaceProvider } from '@brambodev/workspace-git-worktree'

const provider = new GitWorktreeWorkspaceProvider({ repoPath: '/src/project', stateDir: '/src/project/.brambo/workspaces' })
const handle = await provider.create()
await provider.release(handle)
await provider.dispose()
```

Ownership comes from brambo's durable record, not directory presence. A directory without a record is external and is not handed out or removed.

## Contract rules

`WorkspaceHandle` contains `id`, `rootPath`, and unique `read`/`write` capabilities. Providers reject forged handles, unknown ids, double release, and operations after disposal with coded errors.

## Verify a provider

Run `runWorkspaceContractSuite(provider)` from `@brambodev/contracts` and inspect every named clause.

## Next step

Read [Run the CLI](./run-cli) if the workspace is selected by a user-facing command.
