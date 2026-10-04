# Immutable local workspace artifacts

`@brambodev/workspace-artifacts-local` stages content-addressed files and publishes
workspace-scoped revision associations with an injected `RunStore`. It depends
only on contracts and Node built-ins, and supports Node >=20 without SQLite.

## Quick path

```ts
import { createLocalArtifactProvider } from '@brambodev/workspace-artifacts-local'

const artifacts = createLocalArtifactProvider({ rootDir: '/private/artifacts', store })
const staged = await artifacts.stage('tenant', workspace.rootPath)
const ref = { namespace: 'tenant', workspaceId: workspace.id, revision: staged.revision }
await artifacts.publish(ref, staged, publicationLease)
const copy = await artifacts.materialize(ref, '/private/workspaces/new-destination')
```

The host supplies an authenticated namespace and a current lease covering exactly
that namespace and `workspace:<workspaceId>`. `RunStore.valid` checks liveness;
the artifact provider checks scope. Publication never calls `RunStore.commit` or
advances workflow progress. The parent must perform its own fenced commit after
publication; revocation between the final check and rename can leave an
unreferenced association, never authoritative run progress.

## Guarantees and limits

- Revisions and blobs use `sha256:<64 lowercase hex characters>`. Revisions hash
  compact UTF-8 JSON `{"entries":[...]}` with fields ordered as `path`, `digest`,
  `size`, `executable` and entries sorted by POSIX path using JavaScript string
  order, not a locale. Stored manifest JSON orders `revision` before `entries`.
- Old published revisions remain readable. Materialization uses independent,
  exclusively created, digest-verified copies, never hard links. A destination
  must not exist (even an empty directory is refused); its ancestors must exist.
- Traversal, absolute/drive paths, symlinks, unsafe file types, case/Unicode
  normalization collisions, and file/directory conflicts are rejected. Scoped
  identifiers are hashed before filesystem use to prevent case-insensitive
  namespace/workspace aliasing. Empty directories are not represented.
- Payloads are copied and hashed in 64 KiB chunks. Optional `limits` defaults:
  `maxFiles: 50_000`, `maxFileBytes: 268_435_456` (256 MiB), and
  `maxTotalBytes: 2_147_483_648` (2 GiB). Overrides must be safe non-negative
  integers. Reads return one bounded in-memory `Uint8Array` because the contract
  requires it; staging and materialization do not accumulate payloads in memory.
- Manifest JSON has a separate fixed **64 MiB local metadata limit** before
  parsing. These limits are provider choices, not protocol/context limits or
  promises made by other providers.

## Filesystem threat boundary

Provider-root and destination ancestors must be trusted. Private POSIX modes,
`lstat` checks, exclusive creation, no-follow opens where supported, and digest
verification reduce accidental corruption; **they are not a race-free sandbox
against a hostile concurrent same-user process**. A process with the same OS
credentials can swap paths between checks or rewrite provider files. Hosts that
need adversarial isolation must enforce it with separate OS accounts, container
or equivalent isolation and platform access controls. Windows directory modes
are not an ACL boundary. The host must also prevent writes during staging if it
needs a coherent point-in-time snapshot of several source files.

## Durability and interrupted work

Data files are synced, private temporary directories are renamed into place, and
directories are synced where supported. Windows and some filesystems do not
support portable directory sync; file sync plus rename there is **not a guarantee
of power-loss durability**. Executable bits round-trip on POSIX. Windows does not
provide equivalent POSIX execute-mode fidelity; recorded modes follow what Node
reports on that filesystem.

Failed staging cannot publish a partial revision. Abrupt process termination can
leave private temporary directories, unreferenced blobs, or complete unreferenced
revisions. Failed materialization removes its private destination when the
process can handle the error; abrupt termination can leave a partial destination,
which the host must not use. Automatic reclamation is deliberately disabled until
reference-aware retention exists. Never delete artifacts based only on age or a
failed attempt.
