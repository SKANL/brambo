---
title: The kernel
audience: Developers who compose brambo or write plugins
prerequisites: Node.js >=20
outcome: Understand plugins, the service graph, lifecycle ordering, the action pipeline and budgets
scope: '@brambodev/kernel 0.5.x concepts'
compatibility: Published packages support Node.js >=20
translationStatus: original
---
import Diagram from '@site/src/components/Diagram'
import ActionPipeline from '@site/src/components/diagrams/ActionPipeline'

# The kernel

`@brambodev/kernel` is the substrate everything else mounts on. It has zero runtime dependencies and never imports `@brambodev/contracts`; it knows nothing about executors, registries or projection. It provides six things: plugin manifests, a service graph, ordered lifecycle, a scoped event bus, layered configuration, and an action pipeline with budgets and an append-only record stream.

Most hosts never touch the kernel directly: `@brambodev/session` builds one per run, or hands you one through `createSessionKernel`. Read this page to understand what that kernel guarantees.

## Plugins and manifests

A plugin is a manifest plus a factory. The manifest declares an `id`, a strict semver `version`, the services it `provides`, the services it `consumes` (each `hard` or `soft`), and a `configSchema` in Standard Schema v1 form. The kernel validates the manifest and reports every issue at once, then applies the schema to the plugin's settings before the factory runs, so a plugin never sees settings its own schema rejected.

```ts
import { createKernel } from '@brambodev/kernel'

const passthrough = { '~standard': { version: 1, validate: (value: unknown) => ({ value }) } }

const kernel = createKernel()
kernel.register(
  { id: 'clock', version: '1.0.0', provides: ['clock'], consumes: [], configSchema: passthrough },
  () => ({ status: 'activated', services: { clock: () => Date.now() } }),
)
kernel.register(
  { id: 'greeter', version: '1.0.0', provides: [], consumes: [{ service: 'clock', mode: 'hard' }], configSchema: passthrough },
  (context) => {
    const clock = context.consume('clock')
    if (clock.kind === 'absent') return { status: 'rejected', issues: ['clock unavailable'] }
    return { status: 'activated', dispose: () => console.log('greeter stopped') }
  },
)
const { started, failures } = kernel.start()
await kernel.stop()
```

`consume` returns a typed result, `{ kind: 'provided', value }` or `{ kind: 'absent' }`, never `undefined`.

## Lifecycle ordering

- **Start** loads every registered plugin, refuses invalid manifests, service conflicts and dependency cycles, then activates plugins in hard-dependency order. A failed activation is contained and recorded (`BRAMBO_KERNEL_PLUGIN_START_FAILED`); the others still activate. A plugin whose hard dependency is absent stays unready and never activates. Soft consumption imposes no ordering.
- **Stop** drains pending event continuations, then runs every disposer in exact reverse activation order, even if some throw. It is idempotent; concurrent calls share one result.
- **Single cycle.** After `stop`, `start` and `register` raise `BRAMBO_KERNEL_PLUGIN_INACTIVE`. A kernel is not restartable; build a new one.
- **Swap** is validate-then-commit. The candidate fully activates first; any rejection raises `BRAMBO_KERNEL_SWAP_REJECTED` and the old implementation keeps serving. Only after the new one serves does the old disposer run.

## Configuration layers

The kernel's `LayeredConfig` composes five layers, widest to narrowest: `defaults`, `global`, `project`, `agent`, `invocation`. It records which layer supplied each leaf, so "who decided this" is answerable per key. `runSession` seeds these layers from the documents you pass it and nothing else.

## The action pipeline

<Diagram><ActionPipeline /></Diagram>

Work that should be budgeted and recorded is registered as an action. Each invocation passes through four stages in order: `pre`, `guard`, `around`, `post`. A guard returns `{ allow: true }` or `{ allow: false, reason }`; a refusal is recorded as `action.refused` and the operation never runs.

```ts
import { createActionPipeline, createMemoryLogSink } from '@brambodev/kernel'

const log = createMemoryLogSink()
const pipeline = createActionPipeline(log, { maxInvocations: 2 })
const action = pipeline.register({ id: 'demo.add', cost: 1, run: () => 1 + 1 })

await action.invoke()
console.log(pipeline.usage) // { invocations: 1, totalCost: 1, concurrent: 0 }
```

## Budgets

An `ActionPolicy` has three optional caps: `maxInvocations`, `maxTotalCost` and `maxConcurrent`. Omitted means unlimited. Each cap must be a finite number `>= 0`; a `NaN` cap would fail open, so it is rejected with `BRAMBO_KERNEL_ACTION_INVALID`. A tripped cap raises its own code: `BRAMBO_KERNEL_INVOCATION_CAP_EXCEEDED`, `BRAMBO_KERNEL_COST_CAP_EXCEEDED` or `BRAMBO_KERNEL_CONCURRENCY_CAP_EXCEEDED`.

Admission is priced on the action's declared `cost`. An optional `settle` reconciles the real figure afterwards, and later admissions check the settled total. The session world admits each run at a flat cost of 1 and settles it against the token figure the executor reported, so cost and invocation caps can trip on different runs. brambo never invents a pre-run token estimate; a host that budgets in tokens supplies its own `cost`.

## Records

Every lifecycle transition and action outcome is a frozen, sequenced record (`version`, `seq`, `at`, `event`, `subject`, optional `code` and `cost`) written to a `LogSink`. `createMemoryLogSink` keeps records in memory; `createLogSink(write)` hands them to your exporter. A sink write failure degrades the sink and is counted rather than thrown, so observability cannot crash the work it observes. Call `drain()` before reading an asynchronous sink.

## Execution primitives

The kernel also exports the ACP-neutral session primitives the session world uses: `createSessionSupervisor` (session states `created → active → completed | failed | cancelling → closed`, sequential FIFO turns), `createPermissionBroker`, and `createPermissionAuthorizer` with grants scoped to an action, session or workspace. See [Kernel contracts](../guides/kernel-contracts) for their guarantees.

## What the kernel does not do

No transports, provider registries, durable stores, permission UI, timeouts or retries. Those belong to contracts implementations or to your host.
