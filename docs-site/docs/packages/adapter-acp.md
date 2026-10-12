---
title: adapter-acp
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Understand the frozen ACP v1 stdio JSON-RPC client boundary
scope: Public package API
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# @brambodev/adapter-acp

`@brambodev/adapter-acp` provides a protocol-neutral ACP v1 client for newline-delimited
JSON-RPC over a spawned process's standard input and output. It exposes initialize, session
creation and loading, prompting, cancellation, update notifications, and permission requests
without choosing or launching a specific ACP agent.

The client bounds frame size, correlates responses by request ID, and rejects pending requests
when the process closes, reports an error, produces malformed JSON-RPC, or refuses a write.
Permission requests default to denial unless the caller configures a handler.

**Status: Frozen.** This package is a stdio JSON-RPC client for ACP v1, not an `ExecutorAdapter`; it has no runtime dependency on `@brambodev/kernel`. No new features are planned. Protocol fixes after 0.5.0 (unreleased): server requests the client does not handle are answered with JSON-RPC error `-32601` (method not found), permission refusals use integer error codes, `sessionCancel` is sent as a notification and resolves to `void`, and frame-size checks run in linear time across multi-byte splits.
