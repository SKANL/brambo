---
title: adapter-acp
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Understand the ACP stdio adapter boundary
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
