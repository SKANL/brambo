---
title: delegation
audience: Developers integrating @brambodev/delegation
prerequisites: Node.js >=20
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/delegation 0.5.x'
compatibility: Node.js >=20
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/delegation

<Badge status="experimental">Experimental</Badge>

*Experimental: tested and usable, but its surface may still change, and it has less platform evidence or fewer in-repo consumers than the stable packages.* [Status criteria](../reference/package-status).

A minimal delegation lifecycle: `createDelegationRegistry` runs a handler for a uniquely identified request and records it as `running`, then `succeeded`, `failed` or `cancelled`, optionally persisting snapshots to a JSONL state store.

| | |
|---|---|
| World | Supporting |
| Topology tier | 1 |
| Node.js | `>=20` |
| Depends on | [`contracts`](./contracts) |

## Install

```bash
npm install @brambodev/delegation
```

## Example

```ts
import { createDelegationRegistry, createJsonlDelegationStateStore } from '@brambodev/delegation'

const registry = createDelegationRegistry<string, number>({ stateStore: createJsonlDelegationStateStore('./delegations.jsonl') })
const record = await registry.delegate({ id: 'count-words', input: 'one two three' }, {
  execute: async (request) => request.input.split(' ').length,
})
console.log(record.status, record)
```

## Ports

- **Implements:** `DelegationRegistry`, `DelegationStateStore` (JSONL).
- **Consumes:** A `DelegationHandler` you supply.

## Errors

`BRAMBO_ORCHESTRATION_INVALID` for an empty or duplicate id; a corrupt JSONL line throws a plain `Error`.

## Limits

- No retry, scheduling or listing.
- The JSONL store appends a full snapshot per save.
- Handler failures are captured in the record, not thrown.

## See also

- [Compatibility](../reference/compatibility)
