---
title: "@brambodev/runtime-local"
audience: SDK integrators
prerequisites: Node.js >=20
outcome: Compose a host-owned durable workflow
scope: Public package reference
compatibility: Node.js >=20
translationStatus: original
---

# @brambodev/runtime-local

Private materialization and child-lease renewal for an injected driver. Promise settlement is trusted handback, not OS/process-tree proof. Never-settling drivers retain their private workspace. Host isolation and cleanup remain required.

## Public surface

- `createLocalExecutionRuntime`
- `createLeaseRenewalController`

## Proof and limits

Local synthetic tests establish bounded port behavior, not a Brambo-operated service, external deployment, OS isolation or distributed durability. Packed installation, hosted Windows/Linux and frozen-lockfile acceptance are pending; source-condition imports do not prove published artifacts.

## Next step

Use the typechecked host composition recipe in [remote-orchestration](../guides/remote-orchestration.md).
