---
title: provenance
audience: Developers integrating @brambodev/provenance
prerequisites: Node.js >=20
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/provenance 0.5.x'
compatibility: Node.js >=20
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/provenance

<Badge status="experimental">Experimental</Badge>

*Experimental: tested and usable, but its surface may still change, and it has less platform evidence or fewer in-repo consumers than the stable packages.*

Content-bound review receipts and review reports: SHA-256 hashes of a canonical target (base ref plus path digests), session events and delegations; `allow`/`deny` receipts with a JSONL store; and a delivery rule in which only blockers caused by the change, or of unknown causality, block.

| | |
|---|---|
| World | Supporting |
| Topology tier | 1 |
| Node.js | `>=20` |
| Depends on | [`contracts`](./contracts) |

## Install

```bash
npm install @brambodev/provenance
```

## Example

```ts
import { createJsonlReviewReceiptStore, createReceipt, hashTarget } from '@brambodev/provenance'

const target = { baseRef: 'main', paths: [{ path: 'src/index.ts', mode: '100644', sha256: 'a'.repeat(64) }] }
const receipt = createReceipt(target, 'allow')
console.log(receipt.targetHash === hashTarget(target))
await createJsonlReviewReceiptStore('./receipts.jsonl').save(receipt)
```

## Ports

- **Implements:** Receipt and report primitives; `ReviewReceiptStore`.
- **Consumes:** Session events and delegation records (to hash).

## Errors

`BRAMBO_PROVENANCE_INVALID`.

## Limits

- It records and validates; it runs no reviewer.
- A blocker with `unknown` causality blocks delivery.

## See also

- [Design principles](../explanation/principles)
