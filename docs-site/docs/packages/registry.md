---
title: registry
audience: Developers integrating @brambodev/registry
prerequisites: Node.js >=20
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/registry 0.5.x'
compatibility: Node.js >=20
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/registry

<Badge status="stable">Stable</Badge>

*Stable: covered by its tests (and its contract suite where the port has one) and exercised by brambo's own session or CLI path. brambo is pre-1.0, so breaking changes remain possible and are called out in the changelog.*

The canonical environment registry: `skill` and `mcp-server` entries stored per scope (`global` in `~/.brambo/registry.json`, `project` in `<project>/.brambo/registry.json`, in-memory `agent`), with atomic locked writes, portable bundles that leave out credential-like entries, and ingestion from what is already installed.

| | |
|---|---|
| World | Environment world |
| Topology tier | 2 |
| Node.js | `>=20` |
| Depends on | [`contracts`](./contracts), [`kernel`](./kernel), [`lock`](./lock), `jsonc-parser` |

## Install

```bash
npm install @brambodev/registry
```

## Example

```ts
import { RegistryStore } from '@brambodev/registry'

const store = new RegistryStore({ projectDir: process.cwd() })
await store.register({ type: 'mcp-server', id: 'filesystem', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'] }, 'project')
console.log((await store.list('project')).map((entry) => entry.id))
await store.dispose()
```

## Ports

- **Implements:** Registry storage; kernel plugin (`createRegistryPlugin`); machine skill and MCP sources.
- **Consumes:** `@brambodev/lock`.

## Errors

`BRAMBO_REGISTRY_*` (invalid entry, contention, store unavailable, store version mismatch, origin conflict, bundle unavailable).

## Limits

- Store version 1; a store written by a newer brambo is refused.
- `tool` and `profile` entry types are retired: still readable and removable, never written.

## See also

- [The three worlds](../explanation/concepts)
