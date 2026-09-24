# @brambodev/kernel

The plugin substrate brambo composes itself out of: a registry of plugins, scoped
injection and disposal, a scoped event bus, layered configuration, and an
append-only observability log.

**It has ZERO runtime dependencies and never imports `@brambodev/contracts`** — that
is AD-1, and `test/guard.test.ts` in this package enforces it rather than stating
it. The kernel knows nothing about executors, registries or projection; those are
contracts a consumer supplies.

```bash
npm i @brambodev/kernel
```

## What it gives you

- **`createKernel()`** — a lifecycle with `register`, `start` and `stop`, where a
  plugin's disposer is guaranteed to run exactly once and a failed teardown never
  prevents its siblings from running.
- **A manifest every plugin declares** — `id`, `version`, `provides`, `consumes`,
  and a `configSchema` the kernel APPLIES rather than trusts. An author gets
  EVERY violation in one message, not the first.
- **Scoped configuration** — `LayeredConfig` reports which layer supplied every
  leaf, so "who decided this" is answerable per key.
- **An observability log** — records carry a sequence, and a record the kernel
  rejects is counted rather than dropped silently.

## Where it sits

Tier 0 of brambo's topology: nothing in the workspace is below it, and
`packages/contracts/test/topology.test.ts` pins that by exact equality in both
directions. If you are implementing a brambo PORT, you want `@brambodev/contracts`,
not this — the kernel is what mounts your plugin, not what your plugin talks to.

## Agent execution contracts

The ACP-neutral primitives in `src/acp.ts` and the scoped authorizer in
`src/permissions.ts` define the micro-kernel execution boundary. Sessions use
sequential FIFO turns, permission grants are scoped to an action, session, or
workspace, and replay/admission report overflow and conflicts explicitly.

See the [kernel execution contracts guide](../../docs-site/docs/guides/kernel-contracts.md)
for lifecycle guarantees, permission precedence, audit redaction, replay
semantics, and extension guidance. The kernel intentionally does not provide
transports, provider registries, durable stores, or permission UI.
