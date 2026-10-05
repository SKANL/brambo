---
title: "@brambodev/workflow-coordinator"
audience: SDK integrators
prerequisites: Node.js >=20
outcome: Compose a host-owned durable workflow
scope: Public package reference
compatibility: Node.js >=20
translationStatus: original
---

# @brambodev/workflow-coordinator

Host-authenticated RequestListener and explicitly launched worker. Mandatory authentication/authorization and separate worker eligibility fail closed. Control-plane code does not execute tools; the host owns TLS/listen/storage/retention/process supervision. Child runtimes use fresh runtimeForTask stores; authorize each initiating receipt actor.

## Public surface

- `createWorkflowCoordinator`
- `createWorkflowWorker`

## Proof and limits

Local synthetic tests establish bounded port behavior, not a Brambo-operated service, external deployment, OS isolation or distributed durability. Packed installation, hosted Windows/Linux and frozen-lockfile acceptance are pending; source-condition imports do not prove published artifacts.

## Next step

Use the typechecked host composition recipe in [remote-orchestration](../guides/remote-orchestration.md).
