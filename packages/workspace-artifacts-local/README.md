# Immutable local workspace artifacts

`@brambodev/workspace-artifacts-local` stages content-addressed files and publishes
workspace-scoped revision associations with an injected `RunStore`. It depends
only on contracts and Node built-ins, and supports Node >=20 without SQLite.

See the [durable composition guide](../../docs-site/docs/guides/durable-orchestration.md).
Local synthetic proof is not packed-install, hosted Windows/Linux or distributed
storage proof; those acceptance checks remain pending.

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
- Additional local bounds default to `maxTraversalEntries: 100_000` (all files
  and directories, including empty directories), `maxDepth: 128` (relative path
  components; root is depth zero), and `maxPathBytes: 4096` (UTF-8 bytes per path).
  `maxFiles` still counts regular files only. Directory enumeration is asynchronous
  with one-entry native buffers; staging stops at the first over-budget entry or
  depth before retaining or descending into it. These finite bounds also constrain
  retained traversal paths and open directory handles, not only file contents.
- `maxMetadataBytes` defaults to **64 MiB**, a separate local JSON metadata cap.
  It may be lowered but not raised above 64 MiB. Count, path and exact escaped
  JSON-size preflights run before deep manifest validation, canonical copying or
  whole-manifest serialization. Staging accumulates this size before building the
  final manifest; persisted reads check file size and enforce the cap while
  streaming before JSON parsing. This is a serialized-byte cap, not a heap-size
  guarantee: parsed objects and canonical copies have their own representation
  overhead. All these limits are provider choices, not protocol/context limits or
  promises made by other providers. Hosts control the cost of raised finite
  traversal/depth/path overrides.
- Caller-supplied manifests are projected to new plain data using only `revision`,
  `entries`, and each entry's `path`, `digest`, `size`, `executable`. Array length
  is bounded before visiting indices; required fields and indices must be own
  enumerable data properties, not accessors. Unsupported fields, including hidden
  strings, symbols and array decorations, are **discarded**, not enumerated or
  rejected. The shared contract validator only sees this bounded snapshot. This
  local projection differs from calling the strict contract validator directly;
  only contractual fields are serialized/persisted, and extras are never inspected.
  Persisted JSON must still match canonical bytes exactly, so extra on-disk
  fields are refused. Known-field descriptor/prototype operations can invoke
  caller-supplied Proxy traps; this is not an execution sandbox for hostile code.

Publication snapshots and validates namespace/workspace/revision plus a defensive
lease/epoch copy before its first asynchronous operation. Caller mutation during
an awaited store or filesystem operation cannot change the association's captured
identity, the bytes written to it, or its authority checks.

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

Staging acquires a source leaf descriptor once, with no-follow/nonblocking flags
where supported. Its bigint stat supplies regular-file type, size and executable
mode. A post-acquisition leaf lstat rejects links/nonregular files and must match
the descriptor's bigint device/inode identity before any read or output-file
creation. This guard also applies where no-follow is unavailable; the source
pathname is never reopened. Bounded copying/hashing uses the same descriptor.
Directory discovery retains separate trusted traversal and static-link checks.
This keeps metadata consistent with the opened file, but does not freeze its
contents or protect mutable ancestors from concurrent hostile writers.

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
