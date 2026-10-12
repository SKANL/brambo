---
'@brambodev/adapter-acp': patch
---

Answer unhandled server-initiated requests with JSON-RPC -32601, send session/cancel as a notification (sessionCancel now resolves void), check frame size in linear time, decode split multi-byte chunks, drop the unused kernel dependency, and describe the package as a stdio JSON-RPC client for ACP v1.
