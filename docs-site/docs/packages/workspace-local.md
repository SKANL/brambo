---
title: workspace-local
audience: Developers integrating @brambodev/workspace-local
prerequisites: Node.js >=20
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/workspace-local 0.5.x'
compatibility: Node.js >=20
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/workspace-local

<Badge status="stable">Stable</Badge>

*Stable: covered by its tests (and its contract suite where the port has one) and exercised by brambo's own session or CLI path. brambo is pre-1.0, so breaking changes remain possible and are called out in the changelog.* [Status criteria](../reference/package-status).

The default `WorkspaceProvider`: each workspace is a `<rootDir>/<uuid>` directory carrying a `.brambo-workspace.json` ownership record. Handles are single-use leases; release and disposal leave directories in place. Exports the `inspectLocalWorkspaces` and `removeLocalWorkspace` removal helpers and a kernel plugin.

| | |
|---|---|
| World | Session world |
| Topology tier | 2 |
| Node.js | `>=20` |
| Depends on | [`contracts`](./contracts), [`kernel`](./kernel) |

## Install

```bash
npm install @brambodev/workspace-local
```

## Example

```ts
import { LocalWorkspaceProvider, inspectLocalWorkspaces } from '@brambodev/workspace-local'

const provider = new LocalWorkspaceProvider({ rootDir: './.brambo/workspaces' })
const handle = await provider.create()
try {
  console.log(handle.id, handle.rootPath, handle.capabilities)
} finally {
  await provider.release(handle)
  await provider.dispose()
}
console.log((await inspectLocalWorkspaces('./.brambo/workspaces')).claimed.length)
```

## Ports

- **Implements:** `WorkspaceProvider`; kernel `workspace` plugin.
- **Consumes:** The local file system.

## Errors

`BRAMBO_CONTRACT_WORKSPACE_UNKNOWN_ID`, `_INVALID_HANDLE`, `_DOUBLE_RELEASE`, `_UNAVAILABLE`, `_REMOVAL_REFUSED`, `BRAMBO_CONTRACT_PROVIDER_DISPOSED`.

## Limits

- A directory, not a jail: nothing stops a process from leaving it.
- Removal deletes only directories with a matching ownership record.

## See also

- [Use a workspace provider](../how-to/use-workspace-provider)
- [Executors and workspaces](../guides/executors-and-workspaces)
