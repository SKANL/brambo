---
title: Workspace Git Worktree
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Understand this documentation page
scope: This page
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
Esta página documenta el paquete público correspondiente. La interfaz técnica canónica se conserva abajo para mantener ejemplos y nombres exactos.



# @brambodev/workspace-git-worktree

A `WorkspaceProvider` over real `git worktree` checkouts: every workspace is a detached checkout of
a repository, so several sessions work on the same project at once without sharing a working tree.

```ts
import { GitWorktreeWorkspaceProvider } from '@brambodev/workspace-git-worktree'

const provider = new GitWorktreeWorkspaceProvider({
  repoPath: '/src/my-project',
  stateDir: '/src/my-project/.brambo/workspaces',
})
const handle = await provider.create() // a real `git worktree add --detach`
await provider.release(handle)
await provider.dispose()
```

**What makes a worktree brambo's is the RECORD, not the directory.** Every tree gets a durable
ownership record under `stateDir`, and `acquire()` answers from that record alone — before it
touches the disk. A directory sitting in the trees folder with no record is classified external and
is never read, never modified and never handed out (FR-18, AD-6).

**Names are retired permanently.** Ids come from a monotonic ordinal persisted *before* the tree is
created, so a name that once identified a tree is never issued again — not after removal, not after
a crash, not after a restart. The reservation is serialized per state directory, so two providers
constructed over one directory cannot reserve the same ordinal. Two brambo **processes** over one
directory still can: both read the same ordinal, both compute the same path, and the second
`git worktree add` fails on an existing directory — a coded `BRAMBO_CONTRACT_WORKSPACE_UNAVAILABLE`
rather than two trees sharing a name. That boundary is recorded in `deferred-work.md`; git is the
backstop until a cross-process lock exists.

Every handle is an independent single-use lease. Releasing the SAME handle twice raises
`BRAMBO_CONTRACT_WORKSPACE_DOUBLE_RELEASE`; after `dispose()` every operation raises
`BRAMBO_CONTRACT_PROVIDER_DISPOSED`. `dispose()` removes **nothing** — a worktree outliving its
provider is what makes parallel work resumable. Removal ships beside the provider rather than on
it: `inspectWorktrees` and `removeWorktree` are free functions this package exports, keyed on the
ownership record brambo wrote at creation, so a worktree brambo did not make is named and refused
rather than deleted.

## As a kernel plugin

`createGitWorktreeWorkspacePlugin({ repoPath })` mounts the provider on a `@brambodev/kernel` container
and provides the `workspace` service — the same service `@brambodev/workspace-local` provides. Two
plugins providing it would be `BRAMBO_KERNEL_SERVICE_CONFLICT`, so the two are **alternatives** and
something has to choose. `@brambodev/session` chooses, from the layered configuration:

```jsonc
// <project>/.brambo/config.json
{ "workspace": { "provider": "git-worktree" } }
```

`selectWorkspaceProvider` reads that one entry — value and layer together, so the two cannot
disagree — and `createSessionKernel` registers the plugin it names. Absent, the selection is `local`
at layer `defaults`, so nothing changes for an existing user. A provider name brambo does not ship,
or a non-string where a name belongs, is a coded `BRAMBO_CONFIGURATION_UNUSABLE` naming the closed
catalogue; it is never coerced and never quietly defaulted.

`stateDir` comes from the composed configuration under `workspace.rootDir` — the same key the local
provider uses for the same idea, "the directory brambo puts workspaces under", so switching providers
is one key rather than two. `repoPath` is a **mount input**, not a config key: it is not a choice a
user makes in a document but the project the host is already running in, and `createSessionKernel`
computes it from the same `cwd` it computes `workspace.rootDir` from. Absent either one, activation
is **rejected** rather than defaulted, for the reason the local plugin refuses to guess a `rootDir`:
a provider that cut worktrees out of whatever repository the process happened to be standing in is a
failure it could not report on afterwards.

A key inside the subtree this plugin does not recognise — or a subtree of the wrong shape — is
**reported and survived**, on the kernel bus as `workspace.config.ignored`, exactly as
`@brambodev/workspace-local` does. `@brambodev/session` forwards these to its `onWarning` seam and
`brambo run` prints them on stderr.

**Whether `repoPath` is inside a repository is not checked at activation.** The kernel's
`PluginFactory` is synchronous and asking git is not, so the answer arrives from git itself on the
first `create()`:

```
BRAMBO_CONTRACT_WORKSPACE_UNAVAILABLE: git worktree add --detach <path> failed:
fatal: not a git repository (or any of the parent directories): .git
```

That is deliberate. A synchronous `.git` probe would have to reimplement repository discovery —
worktree files, submodules, `GIT_DIR`, parent directories — and would blame the configuration for
something the environment decides. git's own sentence is the useful half of a git failure.
