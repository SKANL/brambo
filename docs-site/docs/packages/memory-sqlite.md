---
title: memory-sqlite
audience: Developers integrating @brambodev/memory-sqlite
prerequisites: Node.js >=20
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/memory-sqlite 0.5.x'
compatibility: Node.js >=20
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/memory-sqlite

<Badge status="experimental">Experimental</Badge>

*Experimental: tested and usable, but its surface may still change, and it has less platform evidence or fewer in-repo consumers than the stable packages.* [Status criteria](../reference/package-status).

An append-only `MemoryProvider`. One `entries` table on `node:sqlite` with the format version in `PRAGMA user_version`; it filters only the single SQLite experimental warning. Supersession appends a new entry; nothing is edited or deleted.

| | |
|---|---|
| World | Supporting |
| Topology tier | 2 |
| Node.js | `>=20` |
| Depends on | [`contracts`](./contracts) |

## Install

```bash
npm install @brambodev/memory-sqlite
```

## Example

```ts
import { SqliteMemoryProvider } from '@brambodev/memory-sqlite'

const memory = await SqliteMemoryProvider.open({ databasePath: './.brambo/memory.db' })
await memory.save({
  payload: 'The deploy script needs BRAMBO_HOME.',
  provenance: { agentId: 'codex', workspaceId: 'workspace-1', recordedAt: new Date().toISOString() },
})
console.log(await memory.search({ workspaceId: 'workspace-1' }))
await memory.dispose()
```

## Ports

- **Implements:** `MemoryProvider`.
- **Consumes:** `node:sqlite`.

## Errors

`BRAMBO_CONTRACT_MEMORY_*` (save invalid, unknown entry, overwrite unsupported, store version mismatch, store unavailable), `BRAMBO_CONTRACT_PROVIDER_DISPOSED`.

## Limits

- No other brambo package consumes it; `runSession` never reads or writes memory. Your host wires it in.
- Version by reject: a store with another format version is refused, never migrated.
- Measured on Node.js 24.14.1 and 26.8.1 although it declares `>=20`.

## See also

- [Use a memory provider](../how-to/use-memory-provider)
