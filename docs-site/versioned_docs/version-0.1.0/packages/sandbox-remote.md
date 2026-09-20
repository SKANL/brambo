---
title: sandbox-remote
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Adapt an injected transport to the sandbox provider contract
scope: This page
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# @brambo/sandbox-remote

`@brambo/sandbox-remote` adapts a caller-owned transport to brambo's `SandboxProvider` contract. It deliberately defines **no network protocol** and performs no network connection by itself.

## Quick path

Implement the transport seam, then create the provider with capability evidence that identifies the same provider ID and uses `enforcement: 'remote'`.

```ts
import { createRemoteSandboxProvider } from '@brambo/sandbox-remote'

const provider = createRemoteSandboxProvider({
  id: 'my-remote-sandbox',
  capabilities,
  transport,
  timeoutMs: 30_000,
})

const session = await provider.createSession({ policy, snapshots: [] })
try {
  const result = await session.execute({ argv, cwd, environment, policy })
  console.log(result.status)
} finally {
  await session.dispose()
}
```

## Transport contract

| Operation | Payload and validation |
| --- | --- |
| `createSession` | Sends immutable session identity, policy, and snapshots; the response must echo the identity and prove remote capabilities. |
| `execute` | Sends exact argv, cwd, environment, snapshots, and an abort signal; the response must echo identity and validate the execution result. |
| `openStdio` | Optional; returns `sendFrame`, `receiveFrame`, and `close` methods. |
| `destroy` | Receives the session identity and is called once for the provider session's disposal promise. |

Responses are checked for unexpected fields, matching session identity, matching policy, provider identity, and `remote` enforcement. Malformed or mismatched responses fail closed with coded errors.

## Cancellation and timeouts

The provider races each remote operation against caller cancellation and the configured timeout. It returns typed `aborted` or `timed-out` results when the transport does not settle. The transport receives the derived abort signal, but the adapter cannot force a remote implementation to stop work; the transport must honor cancellation for strong remote cleanup.

If a session or stdio channel resolves after a timeout or cancellation already won, the adapter closes the late channel when possible. This prevents a late remote resource from being silently left open.

## Stdio rules

The optional stdio surface forwards complete UTF-8 frames. `sendFrame` rejects `\n` and `\r` before dispatch, and `receiveFrame` requires a string. The adapter does not interpret a remote framing protocol; the injected transport owns that detail.

## What this package does not claim

- It is not a remote service, client, or protocol implementation.
- `enforcement: 'remote'` is evidence supplied by the remote side and validated for identity; it is not an independent audit of that infrastructure.
- The adapter cannot guarantee cancellation if the injected transport ignores its signal.
- Snapshot handling remains provider-owned and follows the contracts package's file-only semantics.
