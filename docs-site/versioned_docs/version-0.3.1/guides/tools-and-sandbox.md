---
title: Tools and sandbox
audience: Developers and maintainers
prerequisites: Node.js >=20 and an explicitly created sandbox session
outcome: Understand explicit tool execution and sandbox limits
scope: Tool and sandbox SDK boundaries
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# Tools and sandbox

:::warning[Execution boundary]

Tool discovery is not permission to execute. A host must explicitly approve an invocation and execute it through a `ToolExecutor` bound to a caller-owned sandbox session.

:::

## Explicit execution path

The SDK exposes `executeTool` and `createToolExecutor` from `@brambodev/session`. The host creates a sandbox session using a registered provider, binds its executor, then passes a validated invocation through the explicit execution path. Dispose the session at the host lifecycle boundary. This path is not automatically invoked by `runSession`.

Supported invocation descriptors include exact-argv local processes, MCP over stdio, and MCP streamable HTTP. The API contract does not imply that a concrete remote transport is bundled; the remote provider requires an injected transport.

## Understand enforcement

The default policy requests workspace write access and denies network access. Providers must prove requested capabilities with evidence; requests fail closed when evidence is missing. The local provider's evidence is conservative.

:::caution[No OS isolation claim]

CLI executor adapters do not provide operating-system containment, and sandbox API types alone do not establish isolation.

:::

## Next step

Read [Security boundaries](../explanation/security-boundaries), then review the [sandbox package](../packages/sandbox) and [local provider](../packages/sandbox-local) references before enabling execution.
