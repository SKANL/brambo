---
title: memory-filesystem
audience: Developers integrating @brambodev/memory-filesystem
prerequisites: Node.js >=20
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/memory-filesystem 0.5.x'
compatibility: Node.js >=20
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/memory-filesystem

<Badge status="experimental">Experimental</Badge>

*Experimental: tested and usable, but its surface may still change, and it has less platform evidence or fewer in-repo consumers than the stable packages.*

An append-only `MemoryProvider`. One directory: `meta.json` holds the format stamp and `entries.ndjson` is the append-only log. Supersession appends a new entry; nothing is edited or deleted.

| | |
|---|---|
| World | Supporting |
| Topology tier | 2 |
| Node.js | `>=20` |
| Depends on | [`contracts`](./contracts) |

## Install

```bash
npm install @brambodev/memory-filesystem
```

## Example

```ts
import { FilesystemMemoryProvider } from '@brambodev/memory-filesystem'

const memory = await FilesystemMemoryProvider.open({ storeDir: './.brambo/memory' })
await memory.save({
  payload: 'The deploy script needs BRAMBO_HOME.',
  provenance: { agentId: 'codex', workspaceId: 'workspace-1', recordedAt: new Date().toISOString() },
})
console.log(await memory.search({ workspaceId: 'workspace-1' }))
await memory.dispose()
```

## Ports

- **Implements:** `MemoryProvider`.
- **Consumes:** The local file system.

## Errors

`BRAMBO_CONTRACT_MEMORY_*` (save invalid, unknown entry, overwrite unsupported, store version mismatch, store unavailable), `BRAMBO_CONTRACT_PROVIDER_DISPOSED`.

## Limits

- No other brambo package consumes it; `runSession` never reads or writes memory. Your host wires it in.
- Version by reject: a store with another format version is refused, never migrated.

## See also

- [Use a memory provider](../how-to/use-memory-provider)
