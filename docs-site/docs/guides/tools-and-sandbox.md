---
title: Tools and sandbox
audience: Host integrators who execute tools for an agent
prerequisites: Node.js >=20
outcome: Execute an approved tool invocation through a sandbox session and know what that sandbox actually enforces on each platform
scope: executeTool, ToolExecutor and sandbox providers in 0.5.x
compatibility: Published packages support Node.js >=20; enforcement varies by platform
translationStatus: original
---
import Diagram from '@site/src/components/Diagram'
import SessionLifecycle from '@site/src/components/diagrams/SessionLifecycle'

# Tools and sandbox

:::warning[Execution boundary]

Tool discovery is not permission to execute. A host must explicitly approve an invocation and execute it through a `ToolExecutor` bound to a caller-owned sandbox session.

:::

This page covers tools **your host** executes, for example on behalf of an API executor's tool loop. It does not wrap a CLI executor: Claude Code, Codex and OpenCode run their own tools inside their own process (see [Security boundaries](../explanation/security-boundaries)).

## Explicit execution path

<Diagram><SessionLifecycle /></Diagram>

1. Build a `SandboxPolicy`. `createDefaultSandboxPolicy(root)` gives `workspace-write`, network `deny`, and requires **full** filesystem, process and resource enforcement; no shipped local provider proves all three today, so state the requirements you actually accept.
2. Resolve a provider that can prove that policy and open a session.
3. Bind a `ToolExecutor` to the session with `createToolExecutor(session)`.
4. Call `executeTool`: it validates the invocation, checks capability evidence, asks your authorizer or `approveTool`, executes, and reports the result.
5. Dispose the session at your host's lifecycle boundary.

```ts
import { createDefaultSandboxPolicy, validateSandboxPolicy } from '@brambodev/contracts'
import { createSandboxProviderResolver } from '@brambodev/sandbox'
import { createLocalSandboxProvider } from '@brambodev/sandbox-local'
import { createToolExecutor, executeTool } from '@brambodev/session'

const root = process.cwd()
// Require only proven filesystem confinement; process and resource limits stay unrequired.
const policy = validateSandboxPolicy({ ...createDefaultSandboxPolicy(root), requiredCapabilities: { filesystem: 'full' } })
const resolver = createSandboxProviderResolver([await createLocalSandboxProvider()])
const session = await resolver.createSession({ policy, snapshots: [] })
try {
  const result = await executeTool({
    invocation: { tool: { kind: 'local', argv: ['git'] }, arguments: ['status', '--short'] },
    context: { cwd: root, environment: { LANG: 'C' }, policy },
    toolExecutor: createToolExecutor(session),
    approveTool: ({ invocation }) => invocation.tool.kind === 'local',
  })
  console.log(result.status, result.stdout)
} finally {
  await session.dispose()
}
```

If no registered provider can prove every required control, `createSession` throws `BRAMBO_SANDBOX_CAPABILITY_UNAVAILABLE` before anything runs. If neither your `permissionAuthorizer` nor `approveTool` approves, `executeTool` throws `BRAMBO_SANDBOX_DENIED`.

## Invocation kinds

| Kind | Descriptor | Arguments |
|---|---|---|
| `local` | `{ kind: 'local', argv: [...] }` | String tokens appended to argv, with no shell parsing |
| `mcp-stdio` | `{ kind: 'mcp-stdio', argv: [...], name }` | JSON object sent as MCP `tools/call` arguments over the session's stdio channel |
| `mcp-streamable-http` | `{ kind: 'mcp-streamable-http', url, name }` | JSON object; requires a `RemoteMcpClient` passed to `createToolExecutor` (30 s default request timeout) |

`ToolExecutor` preserves exact argv: `['node', 'server.mjs']` with `['--config', 'a b']` reaches the provider as `['node', 'server.mjs', '--config', 'a b']`. There is no arbitrary JavaScript handler.

## Policy

| Field | Values |
|---|---|
| `mode` | `read-only`, `workspace-write`, `danger-full-access` (requires `allowDangerous: true`) |
| `networkMode` | `deny` (default), `allowlist` (requires `networkAllowlist`), `unrestricted` |
| `requiredCapabilities` | Per control (`filesystem`, `network`, `process`, `resources`): `partial` or `full` |
| `resourceLimits` | `wallTimeMs`, `memoryBytes`, `outputBytes`, `fileSizeBytes`, `processCount`, `cpuQuotaMicros`, `cpuPeriodMicros` |

A provider reports capability facts per control with evidence `none`, `partial` or `full`. A `full` requirement needs `full` evidence, and `none` never satisfies anything. Missing evidence fails closed.

## What each provider enforces

| Provider | Mechanism | Evidence it can claim |
|---|---|---|
| `sandbox-local` on Linux | bubblewrap (`bwrap`), only after a functional probe passes; cgroup v2 for memory, process and CPU limits; `prlimit` for file size | Filesystem and network `full` when the probe passes; `allowlist` networking is not supported |
| `sandbox-local` on macOS | Seatbelt (`sandbox-exec`) profile, deny by default | Filesystem only, when a self-test passes; no network modes beyond `deny` |
| `sandbox-local` on Windows | External `brambo-windows-sandbox-broker` binary | Full filesystem, process and network, partial resources, only when the broker is installed and its self-test passes; otherwise unavailable |
| `sandbox-remote` | A transport **you** inject (`createSession`, `execute`, `destroy`, optional stdio/snapshot/restore) | Whatever your remote service reports, with `enforcement: 'remote'` |

On every platform, the local provider scrubs environment variables whose names look like secrets, caps output at 1 MiB per stream, enforces a 5-minute wall time by default, and requires the working directory to be physically inside the workspace root.

:::caution[No OS isolation claim]

CLI executor adapters do not provide operating-system containment, and sandbox API types alone do not establish isolation. Optional Linux, macOS and Windows host-conformance runs are not claimed as executed in CI.

:::

## Wiring tools into an API executor

The OpenAI and Anthropic providers accept a `toolLoop` whose `createExecution(call, signal)` returns the `executeTool` options for each model tool call. Every call then passes through the same validation, evidence check and approval as above. See [API executors](./api-executors).

## Next step

Read [Security boundaries](../explanation/security-boundaries), then the [sandbox](../packages/sandbox), [sandbox-local](../packages/sandbox-local) and [sandbox-remote](../packages/sandbox-remote) package references.
