---
title: "Register drivers and custom tools"
audience: SDK integrators
prerequisites: Node.js >=20; SQLite >=24.15.0
outcome: Compose ports with host-owned authority
scope: Durable SDK orchestration
compatibility: Node.js >=20; SQLite >=24.15.0
translationStatus: original
---

# Register drivers and custom tools

Register executable integrations explicitly in the host. Configuration selects stable registered IDs; model output never installs a module, picks credentials or grants capabilities.

## Composition recipe

The host supplies CLI/API factories and current tool policy/journal services. This custom echo driver declares reconstruction and pre-dispatch cancellation only. It is not a production agent, sandbox or vendor protocol implementation. API adapters stay at their existing adapter boundary; no vendor branches enter the engine.

```ts
import { defineStandardSchema, type DriverFactory, type DriverServices, type JsonObject } from '@brambodev/contracts'
import { createDriverRegistry, createCliDriverFactory } from '@brambodev/orchestration'
import { createApiDriverFactory } from '@brambodev/adapter-api'
import type { ApiDriverOptions } from '@brambodev/adapter-api'
import { createWorkflowToolDispatcher } from '@brambodev/session'
import type { WorkflowToolDispatcherOptions } from '@brambodev/session'

// Host adapters and authorization/journal/secret services; never model-controlled.
declare const cli: Parameters<typeof createCliDriverFactory>[0]
declare const api: ApiDriverOptions
declare const services: DriverServices
declare const toolPolicy: Omit<WorkflowToolDispatcherOptions, 'tools'>
const manifest: DriverFactory['manifest'] = { id: 'custom-echo', version: '1', kind: 'custom',
  capabilities: ['context-reconstruction', 'cancellation'],
  configurationSchema: defineStandardSchema(value => ({ value })) }
const drivers = createDriverRegistry()
drivers.register(createCliDriverFactory(cli))
drivers.register(createApiDriverFactory(api))
drivers.register({ manifest, async create() { return { manifest, async run(request) {
  return { result: request.signal.aborted
    ? { status: 'cancelled', data: null, summary: 'cancelled', errors: [{ message: 'aborted' }] }
    : { status: 'ok', data: request.context, summary: 'echo' } }
} } } })
const custom = await drivers.resolve('custom-echo').create({}, services)
const dispatch = createWorkflowToolDispatcher({ ...toolPolicy, tools: [{
  id: 'read-label', effect: 'read-only',
  inputSchema: defineStandardSchema<JsonObject>(value =>
    value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === 1 && typeof (value as JsonObject).label === 'string'
      ? { value: value as JsonObject } : { issues: [{ message: 'Expected only a string label' }] }),
  async execute(args) { return args.label ?? null },
}] })
void custom; void dispatch
```

## Capability evidence

| Integration | Locally verified evidence | Not established |
|---|---|---|
| OpenAI and Anthropic | Existing official synthetic fixtures, durable composition, call ID/tool ID/arguments/signal and authorized effect/replay | Live endpoints, account/model coverage or native resume |
| Third-party API | Generic `createApiDriverFactory` with injected adapters and same policy-controlled dispatch | Arbitrary SDK/provider safety; generic wrapper refuses native continuation |
| CLI | Injected spawner/driver lifecycle and capability refusal; legacy synchronous execution preserved | Installed vendor binaries/versions, real cancellation/process-tree termination or native-session portability |
| Custom driver/tool | Published custom driver probes, schema validation, current authorization, redacted durable journal | Host closure sandboxing or arbitrary external exactly-once effects |
| Runtime/backend | Private materialization, fencing and identical public SQLite/non-SQLite clauses | Distributed SQLite, hosted Windows/Linux acceptance or packed installation |

Only the intersection of driver, runtime and current host policy is effective. Required unsupported capabilities refuse; optional degradation is explicit. The public driver suite uses active isolated probes and pre-aborted cancellation; it does not prove native resume, in-flight cancellation or tool interception. Unintercepted CLI/provider-hosted tools must not be advertised as local sandbox enforcement.

## Approvals, secrets and uncertainty

Tool arguments are untrusted JSON. Supply strict schemas and approve/authorize against the actual principal/run/workspace before effect admission and secret lookup. Secret references belong to host registration, never model arguments; redact before journal, observers, results and provider context. Host closures can still leak secrets or bypass controls and are trusted code, not an isolation boundary. On user/device/provider change, reauthorize and resolve credentials independently; no inherited approvals or native identity.

Completed effects replay recorded results without executing again. An unfinished non-idempotent effect requires reconciliation, not blind retry. Cancellation is intent until trusted handback; stronger process/isolation proof needs host enforcement. See [durable orchestration](./durable-orchestration.md) and [API executors](./api-executors.md).
