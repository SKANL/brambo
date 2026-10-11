---
title: "@brambodev/workflow-remote"
audience: SDK integrators
prerequisites: Node.js >=20
outcome: Compose a host-owned durable workflow
scope: Public package reference
compatibility: Node.js >=20
translationStatus: original
---

# @brambodev/workflow-remote

Injected endpoint/fetch/fresh authorization headers; no account, local fallback writer or automatic mutation retry. Namespace/owner fields do not authenticate. Replay advances nextCursor, not latestCursor; overflow requires the authoritative snapshot. Immutable artifact reads verify digests and sizes.

## Public surface

- `createRemoteRunStore`
- `createRemoteArtifactProvider`
- `replayRun`

## Proof and limits

Local synthetic tests establish bounded port behavior, not a Brambo-operated service, external deployment, OS isolation or distributed durability. Packed installation, hosted Windows/Linux and frozen-lockfile acceptance are pending; source-condition imports do not prove published artifacts.

## Next step

Use the typechecked host composition recipe in [remote-orchestration](../guides/remote-orchestration.md).
