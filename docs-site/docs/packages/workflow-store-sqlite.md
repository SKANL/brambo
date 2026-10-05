---
title: "@brambodev/workflow-store-sqlite"
audience: SDK integrators
prerequisites: Node.js >=24.15.0
outcome: Compose a host-owned durable workflow
scope: Public package reference
compatibility: Node.js >=24.15.0
translationStatus: original
---

# @brambodev/workflow-store-sqlite

Optional neutral RunStore implementation on one authoritative local-machine host. Transactions retain state/events/receipts across reopen; claims/renew/release/valid enforce exact resource membership, owner, token, expiry and monotonically advancing fencing epochs. Import is lazy and unsupported runtimes fail with BRAMBO_WORKFLOW_STORE_UNAVAILABLE. No distributed SQLite/shared mount/failover claim.

## Public surface

- `openSqliteRunStore`
- `WorkflowStoreError`

## Proof and limits

Local synthetic tests establish bounded port behavior, not a Brambo-operated service, external deployment, OS isolation or distributed durability. Packed installation, hosted Windows/Linux and frozen-lockfile acceptance are pending; source-condition imports do not prove published artifacts.

## Next step

Use the typechecked host composition recipe in [durable-orchestration](../guides/durable-orchestration.md).
