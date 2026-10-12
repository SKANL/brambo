---
title: kernel
audience: Developers integrating @brambodev/kernel
prerequisites: Node.js >=20
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/kernel 0.5.x'
compatibility: Node.js >=20
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/kernel

<Badge status="stable">Stable</Badge>

*Stable: covered by its tests (and its contract suite where the port has one) and exercised by brambo's own session or CLI path. brambo is pre-1.0, so breaking changes remain possible and are called out in the changelog.* [Status criteria](../reference/package-status).

The zero-dependency plugin kernel: manifests, a service graph with hard and soft consumption, ordered start, stop and swap, a scoped event bus, layered configuration, an action pipeline with budget caps, a sequenced record stream, and the ACP-neutral session supervisor and permission primitives. It never imports `@brambodev/contracts`.

| | |
|---|---|
| World | Core |
| Topology tier | 0 |
| Node.js | `>=20` |
| Depends on | none |

## Install

```bash
npm install @brambodev/kernel
```

## Example

```ts
import { createActionPipeline, createMemoryLogSink } from '@brambodev/kernel'

const log = createMemoryLogSink()
const pipeline = createActionPipeline(log, { maxInvocations: 1 })
const action = pipeline.register({ id: 'demo.add', cost: 1, run: () => 1 + 1 })

console.log(await action.invoke()) // 2
await action.invoke().catch((error) => console.log(error.code)) // BRAMBO_KERNEL_INVOCATION_CAP_EXCEEDED
```

## Ports

- **Implements:** The plugin host itself (`createKernel`).
- **Consumes:** Plugins you register.

## Errors

`BRAMBO_KERNEL_*` codes through `BramboKernelError` subclasses (`KERNEL_ERROR_CODES`).

## Limits

- A kernel runs one start/stop cycle; it cannot be restarted.
- No transports, stores, timeouts or retries.
- Budget caps refuse before a run; they do not stop a run in progress.

## See also

- [The kernel](../explanation/kernel)
- [Kernel contracts](../guides/kernel-contracts)
