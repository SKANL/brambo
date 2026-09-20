# brambo

**brambo is an SDK-first microkernel for composing AI coding environments.** It
turns a canonical Registry into native executor configuration, then runs an
explicitly composed session through typed ports for executors, workspaces, and
memory. Ownership-aware projection, coded failures, reversible lifecycle
operations, and executable contract suites make the environment inspectable and
replaceable without hand-wiring every vendor.

The CLI is only a thin argv binding for the brambo team. It composes the same session
through the package graph, but the product's primary interface is the SDK itself.

## Quick path: compose a session

Install the session package in the host that owns your application, service, IDE,
or automation:

```bash
npm install @brambodev/session
```

Then read brambo's configuration as data and pass that snapshot into the session:

```ts
import { readExecutorConfigLayers, runSession } from '@brambodev/session'

const configLayers = await readExecutorConfigLayers({
  projectDir: process.cwd(),
})

const result = await runSession({
  prompt: 'List the files in this workspace',
  configLayers,
})

console.log(result)
```

This is the SDK path: your host owns process lifetime, output, cancellation, and
presentation. `runSession` returns a typed `ResultEnvelope`; it does not print
JSON, choose an exit code, install signal handlers, or reach into your home
directory behind your back. Pass a `createAdapter` or `createProvider` seam when
your host owns the executor or workspace implementation. Install
[`@brambodev/contracts`](./packages/contracts/README.md) when you are authoring
one of those ports.

## Why brambo exists

Hand-wiring vendors makes the environment the application: every executor gets a
different config location, every workspace implementation invents lifecycle
rules, and every integration accumulates cleanup and drift logic. brambo puts the
stable decisions in a small kernel and leaves vendor-specific behavior at typed
seams.

| Without brambo | With brambo |
| --- | --- |
| Configuration is copied into vendor files by ad hoc scripts. | A canonical Registry is projected into each vendor's native vocabulary and location. |
| Cleanup cannot distinguish your writes from a user's edits. | Projection ownership records what brambo wrote so removal takes back exactly that. |
| Session composition is hidden inside a command. | A host explicitly composes executor, workspace, memory, policy, logging, and lifecycle seams. |
| Adapters drift while their interfaces still compile. | Published clause suites exercise behavior, not just types. |
| Failures are parsed from human messages. | `BramboError` and `BRAMBO_ERROR_CODES` provide typed routing. |

The result is a reusable foundation for hosts that need more than one command:
long-lived services, IDE integrations, CI orchestration, agent platforms, and
teams that want to change executors without rebuilding their environment model.

## What brambo composes

The package graph is deliberately downward and each boundary has a job:

1. **Registry** — the canonical, scoped set of skills and tools you want
   available, with portable bundles and ingest from existing installations.
2. **Projection** — renders Registry entries into the native configuration
   surfaces an executor already reads, while maintaining the ownership ledger
   needed for diagnosis and reversal.
3. **Kernel** — mounts plugins, validates manifests and configuration, exposes
   typed services and events, and tears them down in order.
4. **Session** — composes the selected executor adapter and workspace provider,
   applies policy and logging, runs the request, and returns a typed envelope.
5. **Memory ports** — let hosts choose a filesystem or embedded-SQLite
   `MemoryProvider`, or implement the port themselves.
6. **Sandbox and tool execution** — gives an embedding host portable contracts
   for a provider-owned sandbox session and an exact-argv `ToolExecutor`. The
   host chooses and owns the provider; brambo does not hide a shell behind a
   command string.

The seams are explicit rather than magical. A host can use brambo's shipped
implementations or bring its own adapter, workspace, or memory provider. The
contracts package is the smallest starting point for a third-party port.

## Who should use it

Use brambo when you are building or maintaining a host around AI coding
executors—not merely invoking one binary once. It is a good fit when you need to:

- keep one environment definition across Claude Code, Codex, opencode, or another
  executor;
- embed sessions in a server, desktop app, IDE, CI job, or test harness;
- select workspaces and adapters explicitly and control their ownership;
- inspect drift, retain a reversible ledger, and make cleanup safe; or
- publish a port and prove it against a shared behavioral suite.

If you only need a team convenience command, the CLI can still be useful, but it
is not the architecture to build against.

## Guarantees and boundaries

### The guarantees brambo is designed to enforce

- **Native projection:** brambo writes the vocabulary and locations an executor
  actually reads; it does not invent a parallel configuration format.
- **Ownership-aware reversal:** brambo tracks its projection claims and removes
  only what it owns.
- **Explicit composition:** configuration snapshots, adapter/provider seams,
  kernels, logs, policies, and lifecycle are passed as named inputs.
- **Typed absence and coded errors:** unavailable services have an explicit
  absence state, and callers route refusals by error code rather than message.
- **Behavioral contracts:** port authors can run the published workspace,
  memory, and executor clause suites against their implementations.
- **Provider-neutral tool lifecycle:** a host can select a `SandboxProvider`,
  create a session for a policy and snapshots, execute exact argv through that
  session, then dispose it. Capability facts are validated before a provider is
  allowed to create the session.

### What brambo does not claim

- **No sandbox for `MethodPlugin`:** a method plugin is a trust-boundary input,
  not a sandbox. Do not load untrusted methods expecting brambo to contain their
  commands or filesystem access.
- **No hidden vendor abstraction:** adapters still speak vendor-specific
  protocols and native configuration. Brambo gives you seams and composition; it
  does not pretend that all executors are interchangeable black boxes.
- **No formal paper theorem:** the guarantees in this README are backed by
  executable tests, contract suites, and packaging proofs. They are not a claim
  of a formally verified theorem.
- **Evidence-bound OS isolation:** the Linux provider can advertise OS-backed
  filesystem, network, and process controls only after a functional bubblewrap
  probe; Linux conformance is reproducible through the free Podman runner. macOS
  remains unclaimed on this device, and Windows Hyper-V/Sandbox is deferred.
- **Explicit execution path:** `ToolProvider` remains a discovery/ingestion
  port. It does not grant execution authority; `executeTool` and `ToolExecutor`
  route only validated invocations through a caller-owned sandbox session.
  Arbitrary JavaScript handlers remain unsupported. The optional remote provider
  is an injected adapter seam, not a shipped remote protocol.

## Install and version support

For SDK use, install only the package(s) that own the boundary you need:

```bash
npm install @brambodev/session
npm install --save-dev @brambodev/contracts # when authoring a port
```

All sixteen publishable packages currently use one shared workspace version,
`0.1.0`. This is the unreleased baseline until the first signed tag and registry
publication; the `0.x` range is intentional while the contracts continue to evolve.

| Consumer | Node floor |
| --- | ---: |
| brambo repository development, build, and source checks | `>=24` |
| published SDK packages and packed consumers | `>=20` |

The root floor is a developer/tooling floor, not a claim that the shipped `dist`
artifacts require Node 24. CI separately exercises packed consumer candidates
starting at Node 20.

## Internal/convenience binding: the CLI

`@brambodev/cli` is the team's argv, JSON-output, and exit-code binding. It
composes the same package APIs but is intentionally not the official SDK path:

```bash
npm install --global @brambodev/cli
brambo init
brambo doctor
brambo add <entry>
brambo status
```

The binary reads no files itself; it translates command-line input and output at
the edge. Hosts embedding brambo should import the packages above instead of
driving the CLI or parsing its output.

## Package map

| Package | Role |
| --- | --- |
| [`@brambodev/contracts`](./packages/contracts/README.md) | Public ports, schemas, coded errors, and behavioral clause suites. |
| [`@brambodev/kernel`](./packages/kernel/README.md) | Zero-runtime-dependency plugin kernel, services, events, and teardown. |
| [`@brambodev/session`](./packages/session/README.md) | SDK session composition: executor, workspace, policy, logging, and lifecycle. |
| `@brambodev/sandbox` | Provider-neutral sandbox-session lifecycle and capability validation. |
| `@brambodev/sandbox-local` | Conservative local provider discovery; unsupported required controls fail closed. |
| `@brambodev/sandbox-remote` | Optional injected remote transport adapter; no concrete remote protocol is bundled. |
| [`@brambodev/registry`](./packages/registry/README.md) | Canonical environment Registry, scopes, bundles, and ingest. |
| [`@brambodev/projection`](./packages/projection/README.md) | Native executor projection, drift diagnosis, and reversible ownership ledger. |
| [`@brambodev/environment`](./packages/environment/README.md) | Environment detection and projection orchestration. |
| [`@brambodev/lock`](./packages/lock/README.md) | Portable machine-scoped write serialization. |
| [`@brambodev/adapter-cli`](./packages/adapter-cli/README.md) | Shipped adapters for out-of-process coding CLIs. |
| [`@brambodev/workspace-local`](./packages/workspace-local/README.md) | Local-directory `WorkspaceProvider`. |
| [`@brambodev/workspace-git-worktree`](./packages/workspace-git-worktree/README.md) | Git-worktree `WorkspaceProvider`. |
| [`@brambodev/memory-filesystem`](./packages/memory-filesystem/README.md) | Append-only filesystem `MemoryProvider`. |
| [`@brambodev/memory-sqlite`](./packages/memory-sqlite/README.md) | Embedded SQLite `MemoryProvider`. |
| [`@brambodev/cli`](./packages/cli/README.md) | Internal/convenience argv binding. |

## Build and verify the repository

These commands are for contributors working from the repository, not the SDK
quick path:

```bash
pnpm install
pnpm check
pnpm build
pnpm proof:consumer-install
```

`pnpm check` runs source-byte checks, typechecking, tests, and linting. The
consumer proof is separate because it builds and packs the publishable artifacts:
it installs the tarballs in a project outside this repository, imports them, runs
a real session, and verifies that a contracts-only consumer can compile a
`WorkspaceProvider`. Run both before publishing changes to package exports,
engines, or documentation examples.

## Extend brambo

Start with the [contracts port-authoring guide](./packages/contracts/README.md).
It explains the lease model, validation, coded errors, published clause suites,
and the packed-declaration proof. Then choose the smallest package boundary that
owns the behavior you need; avoid reaching through the kernel to construct vendor
factories directly.

## License

MIT. See [LICENSE](./LICENSE).

## SDK-first sandbox and tool execution

The SDK boundary is explicit: a host selects a `SandboxProvider`, validates a
`SandboxPolicy`, creates a provider-owned session, and passes that session to a
`ToolExecutor`. The CLI is only a secondary binding around capabilities; it is
not required for embedding.

A local invocation is an exact vector, not a shell string:

```ts
const invocation = {
  tool: { kind: 'local', argv: ['node', 'scripts/check.mjs'] },
  arguments: ['--format', 'json', '--', 'workspace name'],
}
// The provider receives: ['node', 'scripts/check.mjs', '--format', 'json', '--', 'workspace name']
```

Tokens are not parsed, expanded, or interpreted by a shell. An `mcp-stdio`
tool uses the same exact descriptor argv to start a local MCP server, while
`ToolExecutor` exchanges framed UTF-8 messages through the provider-owned stdio
session. MCP network transports and arbitrary JavaScript handlers are outside
this contract.

### Evidence, providers, and fail-closed behavior

A policy can require `filesystem`, `network`, `process`, or `resources` at
`partial` or `full` evidence, plus positive integer limits for wall time,
memory, output, file size, and process count. The selected provider must return
matching capability facts before session creation; missing, weaker, malformed,
or mismatched-provider evidence fails closed with a coded error rather than
downgrading the request.

- **Local:** `local-linux`, `local-macos`, and `local-windows` are shipped
  provider factories. Linux can report filesystem/process isolation through
  functional bubblewrap and enforce memory, process, CPU, and file-size limits
  through detected cgroup v2 and `prlimit` substrates. Linux `unrestricted`
  networking is available only when explicitly selected and is not network
  isolation. `allowlist` policies carry explicit hostnames and are enforced for
  remote MCP; local providers reject them until packet filtering is available.
  macOS and Windows remain conservative until their native
  substrates pass hostile conformance. Unsupported controls or resource limits
  return an `unavailable` result; they do not silently run with weaker
  guarantees.
- **Remote:** `@brambodev/sandbox-remote` is a transport-injected adapter.
  It validates provider/session identity, remote enforcement evidence, response
  shapes, timeouts, cancellation, and stdio framing. It does not bundle or
  claim a concrete remote service or protocol.

`danger-full-access` requires `allowDangerous: true`. When a local provider is
configured with an audit callback, it emits validated `execution-started` and
`execution-completed` events containing the provider ID, session ID, mode, and
ISO timestamp. Audit delivery is best effort and does not change execution.

The repository's current evidence is source-level and automated provider/test
coverage on the current platform. The optional Linux/macOS host-conformance matrix is manually enabled on free GitHub-hosted runners. On Windows, Linux conformance can be reproduced at no cost through the local Podman machine with `pnpm conformance:linux:podman`; the runner copies the repository into a disposable Linux container and never writes dependencies into the Windows checkout. This proves the Linux provider only, not Windows or macOS isolation. Windows 10/11 client conformance is explicitly unavailable until a verified Windows substrate exists. No OS-isolation claim is made until real-host tests demonstrate enforcement; substrate discovery alone is not proof.
