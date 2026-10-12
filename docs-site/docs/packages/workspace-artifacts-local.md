---
title: workspace-artifacts-local
audience: Developers integrating @brambodev/workspace-artifacts-local
prerequisites: Node.js >=20
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/workspace-artifacts-local 0.5.x'
compatibility: Node.js >=20
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/workspace-artifacts-local

<Badge status="experimental">Experimental</Badge>

*Experimental: tested and usable, but its surface may still change, and it has less platform evidence or fewer in-repo consumers than the stable packages.*

A local, content-addressed `ArtifactProvider`: immutable blobs and revision manifests under a private root, workspace publication fenced by a `RunStore` lease, digest-verified reads, and safe materialization. Staging rejects symlinks, unsafe paths and case-insensitive collisions.

| | |
|---|---|
| World | Durable world |
| Topology tier | 2 |
| Node.js | `>=20` |
| Depends on | [`contracts`](./contracts) |

## Install

```bash
npm install @brambodev/workspace-artifacts-local
```

## Example

```ts
import { openSqliteRunStore } from '@brambodev/workflow-store-sqlite'
import { createLocalArtifactProvider } from '@brambodev/workspace-artifacts-local'

const store = await openSqliteRunStore({ path: './workflow.sqlite' })
const artifacts = createLocalArtifactProvider({ rootDir: './private-artifacts', store, limits: { maxFiles: 10_000 } })
const manifest = await artifacts.stage('acme', './input')
console.log(manifest.revision, manifest.entries.length)
```

## Ports

- **Implements:** `ArtifactProvider`.
- **Consumes:** `RunStore.valid` for publication.

## Errors

Plain `Error`s such as `stale publication lease`, `artifact path collision`, `artifact byte budget exceeded`.

## Limits

- Defaults: 50,000 files, 256 MiB per file, 2 GiB per revision, depth 128, 64 MiB metadata hard cap.
- Orphaned staged revisions are not reclaimed automatically.
- One host, local file system.

## See also

- [Workspace artifacts](../guides/artifacts)
