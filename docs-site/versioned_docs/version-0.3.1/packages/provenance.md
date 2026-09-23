---
title: "@brambodev/provenance"
audience: Maintainers and hosts that enforce delivery gates
prerequisites: Node.js >=20 and a content snapshot with file paths and modes
outcome: Bind a review decision to an exact content target and validate it later
scope: Package reference for content-bound review receipts and evidence hashes
compatibility: Published packages support Node.js >=20
translationStatus: original
---

# @brambodev/provenance

`@brambodev/provenance` creates and validates receipts that bind an allow/deny result to a content target. Use it to detect when reviewed paths, modes, event evidence, or delegation evidence no longer match; it records evidence but does not perform the review.

## Minimal example

Describe the base reference and each reviewed path with its mode and SHA-256, then create and validate a receipt against the current target.

```ts
import { createReceipt, validateReceipt } from '@brambodev/provenance'

const target = {
  baseRef: 'main',
  paths: [{ path: 'src/example.ts', mode: '100644', sha256: 'a'.repeat(64) }],
}
const receipt = createReceipt(target, 'allow')
validateReceipt(receipt, target)
```

## Public surface

- `createReceipt()` and `validateReceipt()` create and verify content-bound receipts.
- `validateReviewGate()` validates an existing allow receipt at a named delivery gate; it never starts a review.
- `hashTarget()`, `hashSessionEvents()`, and `hashDelegations()` produce deterministic SHA-256 evidence hashes.
- `createJsonlReviewReceiptStore(path)` appends receipts and loads the latest record.
- `validateReviewReport()` and `reviewReportAllowsDelivery()` validate structured review reports.
- Its only runtime package dependency is `@brambodev/contracts`.

## Extension points and limits

The caller must provide the exact target snapshot and any event or delegation records used as evidence. Target paths must be unique and include valid hashes and modes; event sequences must be contiguous and delegation IDs unique. A receipt proves that the supplied evidence matches the supplied target—it does not prove the review was high quality, authorize a publication by itself, or replace the repository's review lifecycle. Delivery-gate checks require an `allow` receipt.

## Related guides

- Learn how Brambo frames [claims and evidence](../reference/claims-and-evidence.md).
- See the shared [public API reference](../reference/api.md).
