---
title: "@brambodev/workspace-artifacts-local"
audience: SDK integrators
prerequisites: Node.js >=20
outcome: Compose a host-owned durable workflow
scope: Public package reference
compatibility: Node.js >=20
translationStatus: original
---

# @brambodev/workspace-artifacts-local

Immutable SHA-256 revisions and independently materialized copies with injected RunStore. Publication requires a workspace-scoped lease; the parent separately commits progress. Unreferenced stage/publish data is not progress. Trusted filesystem ancestors are required; portable path checks are not a hostile same-user sandbox.

## Public surface

- `createLocalArtifactProvider`

## Proof and limits

Local synthetic tests establish bounded port behavior, not a Brambo-operated service, external deployment, OS isolation or distributed durability. Packed installation, hosted Windows/Linux and frozen-lockfile acceptance are pending; source-condition imports do not prove published artifacts.

## Next step

Use the typechecked host composition recipe in [durable-orchestration](../guides/durable-orchestration.md).
