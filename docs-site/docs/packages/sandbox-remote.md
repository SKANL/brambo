---
title: sandbox-remote
audience: Developers integrating @brambodev/sandbox-remote
prerequisites: Node.js >=20
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/sandbox-remote 0.5.x'
compatibility: Node.js >=20
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/sandbox-remote

<Badge status="experimental">Experimental</Badge>

*Experimental: tested and usable, but its surface may still change, and it has less platform evidence or fewer in-repo consumers than the stable packages.*

A `SandboxProvider` adapter for a remote sandbox service you operate. You inject the transport (`createSession`, `execute`, `destroy`, optional stdio, snapshot and restore); the package validates every response against the session identity and policy, and can bound each operation with a watchdog timeout.

| | |
|---|---|
| World | Session world |
| Topology tier | 1 |
| Node.js | `>=20` |
| Depends on | [`contracts`](./contracts) |

## Install

```bash
npm install @brambodev/sandbox-remote
```

## Example

```ts
import { createRemoteSandboxProvider, type RemoteSandboxTransport } from '@brambodev/sandbox-remote'

declare const transport: RemoteSandboxTransport // your client for your remote service
const provider = createRemoteSandboxProvider({
  id: 'acme-remote',
  capabilities: {
    version: 1, providerId: 'acme-remote', enforcement: 'remote',
    controls: { filesystem: 'full', network: 'full', process: 'full', resources: 'partial' },
  },
  transport,
  timeoutMs: 60_000,
})
```

## Ports

- **Implements:** `SandboxProvider`.
- **Consumes:** A host-supplied `RemoteSandboxTransport`.

## Errors

`BRAMBO_SANDBOX_RESPONSE_INVALID`, `BRAMBO_SANDBOX_UNAVAILABLE`, `BRAMBO_SANDBOX_REQUEST_INVALID`; a time-out is a `timed-out` result for `execute` and a thrown `BRAMBO_SANDBOX_TIMED_OUT` for the other operations.

## Limits

- No protocol is bundled; the transport is yours.
- Without `timeoutMs` there is no timer; session creation is never covered by it.
- The capability facts you declare are what brambo trusts; they must reflect your service.

## See also

- [Tools and sandbox](../guides/tools-and-sandbox)
