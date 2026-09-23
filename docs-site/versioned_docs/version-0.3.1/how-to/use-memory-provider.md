---
title: Use a memory provider
audience: Developers and maintainers
prerequisites: Node.js >=20 and a published brambo package
outcome: Persist and query append-only memory through a provider
scope: MemoryProvider integration
compatibility: Filesystem provider supports published Node.js >=20; SQLite is measured on Node.js 24.14.1 and 26.8.1
translationStatus: original
---
# Use a memory provider

Choose `@brambodev/memory-filesystem` for an append-only NDJSON log or `@brambodev/memory-sqlite` for the platform's `node:sqlite` API.

## Quick path

```bash
npm install @brambodev/memory-filesystem
```

```ts
import { FilesystemMemoryProvider } from '@brambodev/memory-filesystem'

const provider = await FilesystemMemoryProvider.open({ storeDir: './.brambo/memory' })
await provider.save({
  payload: 'The deploy script needs BRAMBO_HOME.',
  provenance: { agentId: 'codex', workspaceId: 'workspace-1', recordedAt: new Date().toISOString() },
})
const result = await provider.search({ workspaceId: 'workspace-1' })
await provider.dispose()
```

## Append-only rules

Every write has payload and provenance. Supersession appends a new entry with `supersedes`; it never edits or deletes the older entry. `overwrite()` rejects with `BRAMBO_CONTRACT_MEMORY_OVERWRITE_UNSUPPORTED`.

## Choose SQLite

```bash
npm install @brambodev/memory-sqlite
```

```ts
import { SqliteMemoryProvider } from '@brambodev/memory-sqlite'

const provider = await SqliteMemoryProvider.open({ databasePath: './.brambo/memory.db' })
const timeline = await provider.timeline()
await provider.dispose()
```

The SQLite provider is measured only against the Node versions listed in its compatibility metadata; do not generalize that measurement.

## Reopen and version behavior

An absent store is created and stamped. An unsupported format is refused rather than migrated. `dispose()` is idempotent and does not delete state.

## Verify a provider

Run the shared memory contract suite. It checks append-only behavior, provenance, deterministic ordering, reopen behavior, version refusal, and disposal.

**Keep ownership in the host.**

`runSession` does not receive or write a `MemoryProvider`. The embedding host
owns persistence, chooses which validated entries become prompt context, and
disposes the provider it opened. This prevents an executor response from
pretending that it persisted a fact and keeps provider lifecycle separate from
the session lifecycle.

For executor-initiated persistence, compose the explicit `executeTool()` path
with a validated tool invocation, host approval, and a `ToolExecutor`. A
discovered tool is not execution authority, and neither memory provider is
implicitly wired into `runSession`.

## Next step

Read [Core concepts](../explanation/concepts) before mounting a provider.
