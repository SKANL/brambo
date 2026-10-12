---
title: Workspace artifacts
audience: Platform engineers moving workspace content through durable runs
prerequisites: Completed the durable workflow tutorial
outcome: Stage, publish, read and materialize immutable workspace revisions and know their limits
scope: ArtifactProvider and @brambodev/workspace-artifacts-local in 0.5.x
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# Workspace artifacts

Durable runs never share a mutable directory. Workspace content moves as immutable, content-addressed revisions through an `ArtifactProvider`, and a revision becomes part of a run only when the run's own compare-and-swap commit references it.

## The port

| Method | Does |
|---|---|
| `stage(namespace, directory)` | Copies a directory into immutable storage and returns an `ArtifactManifest` (`revision` plus `entries` of `path`, `digest`, `size`, `executable`). Associates nothing. |
| `publish(ref, manifest, lease)` | Associates a staged revision with `ref.workspaceId`, only under a current lease that covers `workspace:<id>`. Does not advance the run. |
| `manifest(ref)` | Returns the manifest of a published revision. |
| `read(ref, path)` | Returns one file's bytes, verified against its digest. |
| `materialize(ref, directory)` | Writes a published revision into a new directory and returns a `WorkspaceHandle`. |

Manifests reject unsafe paths: backslashes, `:<>"|?*`, control characters, empty, `.` or `..` segments, trailing dots or spaces, Windows reserved names, and duplicates.

## The local provider

```ts
import { createLocalArtifactProvider } from '@brambodev/workspace-artifacts-local'
import { openSqliteRunStore } from '@brambodev/workflow-store-sqlite'

const store = await openSqliteRunStore({ path: './workflow.sqlite' })
const artifacts = createLocalArtifactProvider({ rootDir: './private-artifacts', store })
```

The `store` is used only to check `valid(lease)` at publication, once before writing the association and again inside the write; a lease that lost its claim fails with `stale publication lease`.

On disk, under `rootDir/namespaces/<sha256(namespace)>/`, it keeps content-addressed `blobs/`, canonical revision manifests in `revisions/`, and per-workspace associations in `workspaces/`. Every write is a temporary file, `fsync`, then rename.

| Limit | Default |
|---|---|
| Files per revision | 50,000 |
| Bytes per file | 256 MiB |
| Bytes per revision | 2 GiB |
| Directory entries traversed | 100,000 |
| Depth | 128 |
| Path length | 4,096 bytes |
| Metadata | 64 MiB (also the hard maximum) |

Override any of them with `limits`. Staging also rejects symlinks and non-regular files, a source directory that overlaps `rootDir`, a file swapped between open and read, and two paths that collide after Unicode normalization and lowercasing.

`materialize` refuses a destination that overlaps the root or already exists, writes files with mode `0600` and directories with `0700`, and removes partial output on failure.

## Durability and interrupted work

- **Staged is not progress.** A crash after staging leaves an orphan revision that nothing references. Orphans are not reclaimed automatically; schedule your own cleanup.
- **Published is not committed.** Publication associates a revision with a workspace; the run moves forward only when the engine's CAS commit records it. A writer that lost its lease cannot publish, and the run cannot reference a revision from a stale writer.
- **Single machine.** The local provider assumes one host and a local file system. For other topologies put it behind the coordinator and use `createRemoteArtifactProvider`, or implement `ArtifactProvider` yourself.
- **Failures are plain errors** with descriptive messages (`artifact path collision`, `artifact byte budget exceeded`, `unsafe directory path: symlink or non-directory`); they carry no code.

## Next step

See how the engine uses these calls in [Your first durable workflow](../tutorials/durable-workflow), and the full limits table in [Durable semantics](../reference/durable-semantics).
