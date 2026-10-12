---
title: adapter-acp
audience: Developers integrating @brambodev/adapter-acp
prerequisites: Node.js >=20
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/adapter-acp 0.5.x'
compatibility: Node.js >=20
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/adapter-acp

<Badge status="frozen">Frozen</Badge>

*Frozen: receives verified protocol fixes only; no new features are planned.* [Status criteria](../reference/package-status).

A newline-delimited stdio JSON-RPC client for the Agent Client Protocol v1 (`initialize`, `session/new`, `session/load`, `session/prompt`, and `session/cancel` as a notification), with permission requests routed to an `onPermission` callback. It is not an `ExecutorAdapter` and depends on no brambo package.

| | |
|---|---|
| World | Supporting |
| Topology tier | 2 |
| Node.js | `>=20` |
| Depends on | none |

## Install

```bash
npm install @brambodev/adapter-acp
```

## Example

```ts
import { spawn } from 'node:child_process'
import { createStdioJsonRpcClient } from '@brambodev/adapter-acp'

const agent = spawn('my-acp-agent', [], { stdio: ['pipe', 'pipe', 'inherit'] })
const client = createStdioJsonRpcClient(agent, {
  onPermission: async () => ({ kind: 'denied', reason: 'host policy' }),
})
await client.initialize({ protocolVersion: 1 })
await client.close()
```

## Ports

- **Implements:** An ACP JSON-RPC client (no brambo port).
- **Consumes:** A child process speaking ACP over stdio.

## Errors

`AdapterAcpError` with its own codes: `malformed-frame`, `frame-too-large`, `process-closed`, `process-error`, `rpc-error`, `write-failed`, `client-closed`. Unhandled server requests are answered with JSON-RPC `-32601`.

## Limits

- Frozen: protocol fixes only.
- Frames up to 1 MiB by default (`maxFrameBytes`).
- Without `onPermission`, every permission request is denied.

## See also

- [ADR-010](../explanation/decisions/adr-010)
