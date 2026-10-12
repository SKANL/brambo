---
title: Contract suites
audience: Port authors and provider authors
prerequisites: Node.js >=20
outcome: Prove a port implementation with the published clause suites and read the report
scope: Contract suites exported by @brambodev/contracts and @brambodev/adapter-api/testing in 0.5.x
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# Contract suites

Implementing a port's TypeScript interface makes your code compile; it does not make it correct. Every brambo port ships a runnable suite of named clauses that exercises the behavior the type cannot express: cancellation, refusal codes, idempotent disposal, fencing. The shipped implementations run the same suites in CI, so passing one puts your implementation on the same footing.

## Available suites

| Runner | Subject | Clauses check |
|---|---|---|
| `runExecutorContractSuite(adapter, options?)` | `ExecutorAdapter` | Request schema, async `run`, envelope shape, `ok` and failure completeness, cancellation yields `cancelled` |
| `runWorkspaceContractSuite(provider, options?)` | `WorkspaceProvider` | Valid handles, acquire round trip, unknown and non-string ids refused, forged handle and double release refused, state survives sessions, idempotent disposal that preserves state, disposed provider refuses |
| `runMemoryContractSuite(harness, options?)` | `MemoryContractHarness` (`providerName`, `provider`, `reopen`, `openDivergentFormatVersion`) | Typed empty store, verbatim provenance, no cross-workspace leaks, overwrite refused, supersession appends, deterministic timeline, state survives reopen, divergent format refused, disposal |
| `runToolProviderContractSuite(provider, options?)` | `ToolProvider` | Non-empty source id, a `list()` that returns an array, only valid MCP server entries |
| `runDriverContractSuite(driver, request, options?)` | `ExecutionDriver` and a `DriverRequest` | Manifest conformance, outcome conformance, cancellation |
| `runWorkflowStoreContractSuite(harness, options?)` | `WorkflowStoreHarness` (`open`, `reopen`, `advance`) | Lease authenticity, committed reopen, admission, scoped reads, atomic commit and fencing, lease lifecycle |
| `defineExecutorProviderConformance(subject)` from `@brambodev/adapter-api/testing` | `ExecutorProvider` plus fixtures | Vitest scenarios; see [Write an ExecutorProvider](./third-party-executor-providers) |

All runners except the provider conformance are plain async functions exported from `@brambodev/contracts`; they need no test framework. Each clause has a time budget (`timeoutMs`, default 30 s); an expired clause is reported as a named `<clause> (timeout)` violation. The clause arrays (`EXECUTOR_CLAUSES`, `WORKSPACE_CLAUSES`, ...) and suite names (`EXECUTOR_SUITE`, ...) are exported too.

## Run a suite and read the report

This adapter looks correct but ignores an abort that arrives after it started:

```ts
import { runExecutorContractSuite } from '@brambodev/contracts'
import type { ExecutorAdapter, ResultEnvelope, RunRequest } from '@brambodev/contracts'

const adapter: ExecutorAdapter = {
  async run(request: RunRequest): Promise<ResultEnvelope> {
    if (request.signal?.aborted) return { status: 'cancelled', data: null, summary: 'cancelled', errors: [{ message: 'aborted' }] }
    return { status: 'ok', data: { prompt: request.prompt }, summary: 'done' }
  },
}

const report = await runExecutorContractSuite(adapter, { timeoutMs: 5_000 })
console.log(report.suite, report.passed)
for (const violation of report.violations) console.log(violation)
```

The suite names the broken clause:

```text
executor-adapter false
{
  clause: 'cancel-yields-cancelled-envelope',
  detail: "adapter resolved status 'ok' after cancellation instead of 'cancelled'"
}
```

Listening for the abort while the work is in flight fixes it:

```ts
import { runExecutorContractSuite } from '@brambodev/contracts'
import type { ExecutorAdapter, ResultEnvelope, RunRequest } from '@brambodev/contracts'

const adapter: ExecutorAdapter = {
  async run(request: RunRequest): Promise<ResultEnvelope> {
    const work = new Promise<string>((resolve) => setTimeout(() => resolve('done'), 10))
    const aborted = new Promise<'aborted'>((resolve) => {
      if (request.signal?.aborted) resolve('aborted')
      request.signal?.addEventListener('abort', () => resolve('aborted'), { once: true })
    })
    const outcome = await Promise.race([work, aborted])
    if (outcome === 'aborted') return { status: 'cancelled', data: null, summary: 'cancelled', errors: [{ message: 'aborted by host' }] }
    return { status: 'ok', data: { prompt: request.prompt }, summary: outcome }
  },
}

const report = await runExecutorContractSuite(adapter, { timeoutMs: 5_000 })
console.log(report.suite, report.passed, report.clauses.length) // executor-adapter true 6
```

Both programs were run against the 0.5.x sources while writing this page.

A `SuiteReport` has `suite`, `clauses` (names in order), `passed`, `outcomes` (per clause: `clause`, `passed`, `detail?`, `durationMs`) and `violations` (`clause`, `detail`). A partially implemented port fails naming **every** violated clause, not just the first.

## Use a suite in CI

The runners return a report instead of throwing, so wire them into whichever test runner you use:

```ts
import { expect, it } from 'vitest'
import { runWorkspaceContractSuite } from '@brambodev/contracts'
import { createMyWorkspaceProvider } from '../src/index.ts'

it('satisfies the workspace contract', async () => {
  const report = await runWorkspaceContractSuite(createMyWorkspaceProvider())
  expect(report.violations).toEqual([])
})
```

Suites that mutate storage (memory, workflow store) take a harness so they can open fresh storage and reopen it. Point them at disposable storage, never a live database, and give the workflow-store harness an injectable clock (`advance(ms)`) so lease expiry is deterministic.

## What a passing suite means

A passing suite is bounded behavioral evidence for the clauses it lists, on the platform where it ran. It is not a certification of distributed durability, OS isolation or performance. Run it again whenever your implementation or its dependencies change.

## Next step

Write a provider in [Write an ExecutorProvider](./third-party-executor-providers), a workspace provider in [Use a workspace provider](../how-to/use-workspace-provider), or a store against the [durable semantics](../reference/durable-semantics).
