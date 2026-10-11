# @brambodev/adapter-api

Transport-neutral API executor registry, opt-in allowlisted provider discovery, bounded local tool loop, redacted observations, and third-party conformance helpers. This package does not import a provider based on configuration.

See the [API executor guide](../../docs-site/docs/guides/api-executors.md) and [third-party provider guide](../../docs-site/docs/guides/third-party-executor-providers.md).

## Configured durable drivers

`createApiDriverFactory` supports paired `configurationControls` and
`createConfiguredAdapter` options. Both are required together. The returned
manifest advertises the owned contract; a conflicting explicit manifest contract
is rejected. `createConfigured(legacyConfiguration, effective, services)` keeps
the existing configuration schema on its first argument and revalidates the
second against the control contract without changing admitted values.

Configured drivers bind the frozen effective envelope and forward it in
`RunRequest`. An omitted run envelope uses that binding; an equal envelope is
accepted, but a different envelope rejects before adapter execution. Model
support receipts remain host evidence, not new tool or network permissions.
Legacy `create(configuration, services)` is unchanged and never opts in implicitly.

## Custom controls through public package roots

A trusted provider owns its schema, namespaced control IDs and native mapping.
Neither `ExecutorCapability` nor a core vendor enum needs an extra member.
**Chain integration pending:** direct configured API factory construction is
available now. The resolver/registry example below and durable admission described
after it become available with integration slice 7; this is not a current SDK
recipe. This synthetic example is not evidence of support by a real model:

```ts
import { defineStandardSchema, mapControlExtensions } from '@brambodev/contracts'
import type { ControlExtension, ExecutionControlContract, JsonObject, JsonValue } from '@brambodev/contracts'
import { createApiDriverFactory } from '@brambodev/adapter-api'
import { createDriverRegistry, resolveExecutionConfiguration } from '@brambodev/orchestration'

const budgetSchema = defineStandardSchema<JsonValue>(value =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? { value } : { issues: [{ message: 'expected a positive budget' }] })
const emptySchema = defineStandardSchema<JsonObject>(value =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0
    ? { value: {} } : { issues: [{ message: 'expected empty configuration' }] })
const nativeSchema = defineStandardSchema<JsonObject>(value =>
  value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === 1 && typeof (value as JsonObject)['budget'] === 'number' &&
  Number.isSafeInteger((value as JsonObject)['budget']) && Number((value as JsonObject)['budget']) > 0
    ? { value: value as JsonObject } : { issues: [{ message: 'invalid native budget' }] })
const extension: ControlExtension<JsonObject> = {
  descriptor: { id: 'acme:budget', schema: budgetSchema },
  map: value => ({ budget: value }),
}
const contract: ExecutionControlContract = {
  providerId: 'acme', requiresModel: true,
  configurationSchema: emptySchema, controls: [extension.descriptor],
}
const registry = createDriverRegistry()
registry.register(createApiDriverFactory({
  manifest: { id: 'acme-driver', version: '1', kind: 'api', capabilities: [], configurationSchema: emptySchema },
  configurationControls: contract,
  createAdapter: () => ({ run: async () => ({ status: 'ok', data: null, summary: 'legacy' }) }),
  createConfiguredAdapter: async (_legacy, admitted) => {
    const native = await mapControlExtensions(admitted.extensions, [extension], nativeSchema)
    return { run: async () => ({ status: 'ok', data: native, summary: 'synthetic' }) }
  },
}))
const effective = await resolveExecutionConfiguration({
  task: { model: 'custom-model', extensions: [{ id: 'acme:budget', value: 9, requiredSupport: true }] },
}, {
  contract,
  resolver: query => query.model === 'custom-model'
    ? { status: 'supported', version: 'synthetic-v1' }
    : { status: 'unknown', version: 'synthetic-v1' },
})
// Production hosts supply currently authorized dispatch/secret services.
const driver = await registry.resolve('acme-driver').createConfigured!({}, effective, {
  dispatchTool: async () => null, resolveSecret: async () => 'unused',
})
```

After slice 7, supply a normal `DriverRequest` to `driver.run`, or pass this same registered
factory/contract into `admitConfiguredWorkflowRun` for durable tasks. Store only
the resulting data envelope, never schema/resolver callbacks or credentials.
Custom native destination schemas belong to the trusted plugin; the mapper
rejects reserved/auth/policy destinations and overlapping writes, not malicious
host JavaScript. Built-in API adapters restrict extension destinations further.

## Support is evidence, not policy

| Resolver result | Resolution outcome |
|---|---|
| `supported` with evidence `version` | Validate any model-specific `valueSchema`; record `supported`. |
| `unsupported` | Reject, even if the host allows unknown support. |
| `unknown` or no resolver | Reject by default; explicit `allowUnverified(query)` may admit optional controls with `unverified` receipts. |
| `unknown` with `requiredSupport: true` | Always reject; the unverified opt-in cannot satisfy strict support. |

`requiredSupport` belongs to a requested extension. Configuration-key controls
also pass the same model-support path, but have no per-key strict-support flag;
omit `allowUnverified` to require known support for all controls. Receipt versions
identify the host's evidence, not an automatically detected model/native version.

The workspace consumer fixture typechecks root declarations and runs custom
configured construction alongside the existing conformance suite. The separate
packed-consumer proof packs and runs an offline **install**; it needs explicit
install authorization and is not established by workspace checks.
