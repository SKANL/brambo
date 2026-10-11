# Provider Capability Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose validated model controls through built-in adapters and arbitrary custom drivers, including direct runs and immutable durable workflows, without granting execution privileges.

**Architecture:** Add a provider-neutral, opt-in control contract and caller-supplied model resolver; keep native schemas/mappings in adapter packages. Resolve layers before execution, store durable effective configuration atomically at admission, and replay that snapshot without reevaluating defaults or resolvers. Preserve every legacy construction/configuration path when the new surface is absent.

**Tech Stack:** TypeScript ESM, existing Standard Schema v1 contracts, Vitest, pnpm workspace; existing Node >=24 host. No new dependencies without approval.

**Spec:** `docs/superpowers/specs/2026-10-10-provider-capability-coverage-design.md` (user-approved after documentation commit `789476b74ee0b4975cb9d4ca801659431404a6be`). Executors read both spec and this plan.

## Global Constraints

- Strict TDD: **true**, from the current explicit user instruction; actual RED → GREEN → REFACTOR for each behavior, with tests committed alongside code.
- No hardcoded universal model catalog; unknown/custom model support remains explicit.
- Configuration may restrict behavior further, but never grants execution policy.
- Precedence: **host defaults < named model profile < task configuration < run override**.
- Structured objects/arrays replace atomically; null clears only where the owning schema permits it; absent/undefined does not override and is omitted before durable serialization.
- Existing constructors, string executor selections, required manifest fields, generic factory signatures and unconfigured drivers remain backward-compatible.
- No unrestricted body/argv overrides of auth, endpoints, model identity, prompts, messages, input, tools, approvals, storage or egress policy.
- Native semantics stay provider-owned. CLI flags/prompts are not an OS sandbox; do not expand the existing Claude permission-bypass default.
- English artifacts; Windows/POSIX-safe source and synthetic tests; no credentials in configuration, fixtures, receipts or diagnostics.
- No paid/native provider calls, installs, remote delivery or RDD invocation in this plan. Research during execution uses primary documentation only; native qualification needs separate authorization.

## Review Focus

1. RF1: Non-built-in provider with a schema-transforming, throwing or asynchronous resolver must work or fail safely without a core vendor enum (Tasks 1–2).
2. RF2: Aliases, insertion order, nested arrays/null and provider/model switches must not leak inherited configuration into another provider (Task 2).
3. RF3: Task options masquerading as auth/tools/policy or CLI root flags must produce zero fetch/spawn and no secret-bearing diagnostics (Tasks 2–4).
4. RF4: Host mutation, restart, duplicate admission and changed resolvers must not change the admitted configuration or start an unconfigured task (Task 6).
5. RF5: Legacy adapters/factories and public consumers must remain usable without the new manifest/configuration fields (Tasks 3–7).

---

## Execution and delivery

Status: plan written for human review; **none of the implementation steps below has run**. Preserve the previously selected **Subagent-driven** execution method and **stacked-to-main** chain strategy; plan approval is still required. RDD is off: use ordinary functional checks and the parent-authorized independent verification gate, not a new native review lifecycle.

Tracker: `odd/tasks/provider-capability-coverage.md`; stable PC1 complete, PC2–PC5 pending. Tasks 1–2 implement PC2, Tasks 3–4 PC3, Tasks 5–6 PC4, Task 7 PC5. Each task uses one delegated writer because its source/test/export boundaries span multiple non-trivial files. Never stage existing unrelated dirty/untracked planning files.

Forecast: 1,000–1,600 authored implementation/test/doc lines after this more precise decomposition. The approximately 400-line task heuristic is advisory, not permission to omit tests or compress code. Delivery remains **ask-on-risk**; proposed stacked-to-main slices are Tasks 1, 2, 3, 4, 5, 6 and 7 in dependency order, with tests/docs in each unit. Measure actual additions+deletions once per boundary. If a cohesive slice exceeds 400 after one honest slicing pass, stop for a maintainer exception/delivery decision. No push/PR/merge is authorized by plan approval alone.

## File map and interface decisions

Create `packages/contracts/src/execution-configuration.ts` for public types and data validation; `packages/orchestration/src/execution-configuration.ts` for host resolution; `packages/orchestration/src/configured-admission.ts` for atomic admission composition. Create `packages/adapter-cli/src/model-controls.ts` for native argument construction. Keep provider mappings in their existing provider files; no unrelated file splitting.

Add exports in each affected package's existing `src/index.ts`. Extend existing strict validators explicitly rather than accepting arbitrary manifest/request keys. Do not change `ExecutorCapability` into a vendor feature catalog: control IDs are a separate extensible namespace.

The following are proposed new interfaces, not existing APIs. Production definitions mark every field readonly (omitted below only to shorten the signature map); JSON values use existing `JsonObject`/`JsonValue` from contracts. IDs follow existing durable identifier validation; control IDs use the existing namespaced CapabilityId grammar without adding a closed enum. A model is required by an API control contract, optional for a CLI's preserved native default.

```ts
interface RequestedControl { id: string; value: JsonValue; requiredSupport?: boolean }
interface ExecutionConfigurationLayer {
  providerId?: string; model?: string; configuration?: JsonObject;
  extensions?: readonly RequestedControl[];
}
interface ControlDescriptor {
  id: string; configurationKey?: string; aliases?: readonly string[];
  schema: StandardSchemaV1<JsonValue>;
}
interface ExecutionControlContract {
  providerId: string; requiresModel: boolean;
  configurationSchema: StandardSchemaV1<JsonObject>;
  controls: readonly ControlDescriptor[];
}
type ModelControlSupport =
  | { status: 'supported'; version: string; valueSchema?: StandardSchemaV1<JsonValue> }
  | { status: 'unsupported'; version: string }
  | { status: 'unknown'; version: string };
interface ModelControlQuery { providerId: string; model?: string; controlId: string; executorVersion?: string }
type ModelCapabilityResolver = (query: ModelControlQuery) => ModelControlSupport | Promise<ModelControlSupport>;
interface ControlSupportReceipt { id: string; status: 'supported' | 'unverified'; version: string }
interface EffectiveExecutionConfiguration {
  version: 1; providerId: string; model?: string; executorVersion?: string; configuration: JsonObject;
  extensions: readonly RequestedControl[]; support: readonly ControlSupportReceipt[];
}
interface ExecutionControlHost {
  contract: ExecutionControlContract; resolver?: ModelCapabilityResolver; executorVersion?: string;
  allowUnverified?: (query: ModelControlQuery) => boolean;
}
interface ExecutionConfigurationLayers {
  defaults?: ExecutionConfigurationLayer; profile?: ExecutionConfigurationLayer;
  task?: ExecutionConfigurationLayer; run?: ExecutionConfigurationLayer;
}
```

`configurationKey` connects a native configuration field to its canonical control ID; extension-only controls omit it. Validate both declared configuration controls and extensions through the same support path. No field escapes model validation because it is expressed as a native key rather than an extension. Only registered control keys/IDs are accepted on the new surface; legacy configuration remains its existing separate path.

Native extension registration stays trusted-host-only: `ControlExtension<T extends JsonObject> = { descriptor: ControlDescriptor; map(value: JsonValue): T }`; `mapControlExtensions<T extends JsonObject>(requested: readonly RequestedControl[], registrations: readonly ControlExtension<T>[], nativeSchema: StandardSchemaV1<T>, occupiedNativeFields?: readonly string[]): Promise<T>`. The receiving adapter supplies a strict schema limited to model-behavior/output fields and the names of fields already written by built-in controls; reject duplicate/occupied mapped destinations, unknown fields and reserved fields before merging into a request. Native object fields are atomic destinations, not implicit nested patch merges. The generic mapper never receives credentials, tools, policy or a mutable request body. A trusted custom plugin owns its destination schema; this is not isolation against malicious host/plugin code.

## Task 1: Public control contracts and safe optional compatibility (PC2)

**Files:** Create `packages/contracts/src/execution-configuration.ts` and `packages/contracts/test/execution-configuration.test.ts`; modify `packages/contracts/src/index.ts`, `executor-provider.ts`, `execution-driver.ts`, `executor.ts`, `workflow-run.ts`; extend `packages/contracts/test/executor-provider.compatibility.test.ts`, `execution-driver.test.ts`, `workflow-run.test.ts`.

**Interfaces:** Export the types above, `validateExecutionConfigurationLayer(value: unknown): ExecutionConfigurationLayer`, `validateEffectiveExecutionConfiguration(value: unknown): EffectiveExecutionConfiguration`, `EXECUTION_CONFIGURATION_LAYER_SCHEMA` and `EFFECTIVE_EXECUTION_CONFIGURATION_SCHEMA`. Add optional `configurationControls?: ExecutionControlContract` to ExecutorManifest/DriverManifest; `executionConfiguration?: EffectiveExecutionConfiguration` to RunRequest/DriverRequest; optional `DriverFactory.createConfigured(configuration: unknown, executionConfiguration: EffectiveExecutionConfiguration, services: DriverServices): Promise<ExecutionDriver>`. Preserve `create(configuration: unknown, services: DriverServices)`. The first argument remains the existing schema-validated driver configuration; controls never replace that arbitrary legacy configuration. Add optional `RunSnapshot.executionConfigurations?: readonly { taskId: string; driverId: string; driverVersion: string; configuration: EffectiveExecutionConfiguration }[]`, with unique task IDs tied to snapshot tasks and validated driver identity/version. `RuntimeRequest` already derives from DriverRequest. Older peers may safely reject new optional fields; backward compatibility means old inputs still work, not that old strict readers understand the new feature.

- [ ] **Step 1 — Write failing tests.** `configuration controls accept a non-built-in provider and reject hostile data` asserts a synthetic `acme-api`/`acme:deliberation` descriptor validates without any core enum addition; layer/effective validators reject unknown keys, unsafe descriptors/getters/proxy traps, invalid JSON and duplicate support/control IDs with fixed safe errors. Use own-descriptor reads; never invoke getters or include their thrown messages. `legacy manifests and run requests remain unchanged` asserts all existing fixtures pass with no optional fields. `execution snapshot rejects duplicate or foreign task controls` asserts invalid task IDs reject before store I/O.

```ts
expect(api.validateExecutionConfigurationLayer).toBeTypeOf('function');
expect(() => api.validateExecutionConfigurationLayer({ providerId: 'acme-api', extensions: [{ id: 'acme:deliberation', value: 'deep' }] })).not.toThrow();
expect(() => api.validateExecutionConfigurationLayer({ auth: 'synthetic-secret' })).toThrow();
expect(() => api.validateEffectiveExecutionConfiguration(hostile)).toThrow();
expect(getter).not.toHaveBeenCalled();
```

- [ ] **Step 2 — RED.** Run `pnpm --filter @brambodev/contracts test test/execution-configuration.test.ts --testNamePattern 'configuration controls|execution snapshot'`. Expected current failure: missing validator export, then unsupported optional-field validation; retain actual failing assertion, not a fabricated count.
- [ ] **Step 3 — Implement the declared contracts/validators and optional strict fields.** Reuse existing durable JSON/identifier/schema validation and safe error codes; clone/freeze owned snapshots. Executable schemas stay host-only. Durable receipts contain only IDs, fixed status and validated version strings, never resolver schemas/functions or arbitrary metadata.
- [ ] **Step 4 — GREEN then REFACTOR.** Rerun Step 2; all selected assertions pass. Then run `pnpm --filter @brambodev/contracts test`, `pnpm --filter @brambodev/contracts typecheck`, `pnpm --filter @brambodev/contracts lint`; all exit 0. Include compatibility test results; no runtime harness is applicable to this contract-only unit.
- [ ] **Step 5 — Commit.** Stage only Task 1 source/tests/exports and tracker evidence; `git commit -m "feat(contracts): add extensible execution control contracts"`. Rollback: new control module and optional fields, leaving legacy contracts intact.

## Task 2: Deterministic host resolution and controlled extensions (PC2)

**Files:** Create `packages/orchestration/src/execution-configuration.ts`, `packages/orchestration/test/execution-configuration.test.ts`; modify `packages/orchestration/src/index.ts`, `driver-registry.ts`; extend `packages/orchestration/test/drivers.test.ts`. Put generic extension mapping in the new contracts module and its test, not in a vendor-specific core package.

**Interfaces:** Export `resolveExecutionConfiguration(layers: ExecutionConfigurationLayers, host: ExecutionControlHost): Promise<EffectiveExecutionConfiguration>` from orchestration; export `ControlExtension`/`mapControlExtensions` from contracts. Registry snapshots new manifest descriptors/schemas using bound validation receivers, just as its current configuration schema snapshot does. Registry preserves optional createConfigured and validates effective provider/configuration against the registered contract before construction; descriptor/mapper registration conflicts reject synchronously.

- [ ] **Step 1 — Write failing tests.** Arrange inline Standard Schemas and an asynchronous synthetic acme resolver; no real transport. Tests: `control resolver distinguishes supported unsupported and unknown`; `configuration precedence replaces objects arrays and schema-cleared null`; `provider switch discards foreign inherited controls`; `model switch revalidates retained controls`; `aliases conflict independently of insertion order`; `extension mapper cannot overwrite reserved native fields`; `validator failures never echo synthetic secrets`. Model-switch regression changes a supported fixture model to an unsupported fixture model while retaining its effort request and asserts rejection, zero construction/I/O and the winning model in the resolver query. Extension regression also rejects writes occupied by a built-in control, not only conflicts between two extensions.

```ts
expect(effective.configuration).toEqual({ temperature: 0.7, output: { format: 'text' }, stops: ['run'] });
expect(effective.support).toEqual([{ id: 'acme:deliberation', status: 'unverified', version: 'fixture-v1' }]);
await expect(resolveExecutionConfiguration(layers, requiredUnknownHost)).rejects.toThrow();
expect(fetchSpy).not.toHaveBeenCalled(); expect(spawnSpy).not.toHaveBeenCalled();
expect(Object.isFrozen(effective.configuration)).toBe(true);
expect(safeError.message).not.toContain('synthetic-secret');
```

Use spies on the fake transport/spawner passed to a synthetic factory; resolution rejection must prevent its construction as well, not merely leave unrelated unused spies at zero. Required unknown support rejects even when allowUnverified returns true. Known unsupported always rejects. Supported valueSchema output is revalidated as JSON/provider data after transformation; schema rejection/exception diagnostics remain fixed. Pin an idempotent normalization (uppercase input to lowercase snapshot); later consumption must compare schema output to the frozen value and reject a transformation that would change it, not silently renormalize a replay.

- [ ] **Step 2 — RED.** Run `pnpm --filter @brambodev/orchestration test test/execution-configuration.test.ts --testNamePattern 'control resolver|configuration precedence|provider switch|model switch|aliases conflict|extension mapper|validator failures'`. Expected: missing resolution export/current registry drops the new contract/method. Once the seam exists, add each edge test before its fix and observe its specific incorrect merge/acceptance failure.
- [ ] **Step 3 — Implement resolution.** Resolve identity first; track each layer's provider scope, discard inherited configuration on provider switch, and reject explicitly foreign task/run fields. Canonicalize native-key and extension-ID requests per layer, rejecting alias/dual-representation duplicates within that layer; explicit higher-layer replacement of the same canonical control is allowed. Materialize each final control once: descriptors with configurationKey go into configuration, extension-only descriptors into extensions. Replace structured values atomically; undefined omission is only for optional fields, not array holes/invalid JSON. Resolve every requested declared control, default missing resolver to unknown, enforce host allowUnverified and requiredSupport, validate final schema, then copy/deep-freeze the result. Resolver failure is safe rejection, not implicit support. Preserve only schema-validated support receipts and host.executorVersion, never a task-supplied version assertion.
- [ ] **Step 4 — GREEN then REFACTOR.** Rerun Step 2 plus `pnpm --filter @brambodev/contracts test test/execution-configuration.test.ts`; run orchestration package `test`, `typecheck`, `lint` scripts and contracts `typecheck`, `lint`; all exit 0. These run no native providers.
- [ ] **Step 5 — Commit.** Stage Task 2 paths and tracker; `git commit -m "feat(orchestration): resolve model controls without policy escalation"`. Rollback: opt-in resolver/extension functionality; legacy registry/create behavior still works.

## Task 3: Typed API controls and direct-run mappings (PC3)

**Files:** Modify `packages/adapter-openai/src/openai-provider.ts`, `index.ts`, `packages/adapter-anthropic/src/anthropic-provider.ts`, `anthropic-capabilities.ts`, `index.ts`; create each adapter's `test/model-controls.test.ts`; extend existing `test/openai-provider.test.ts`, `test/anthropic-provider.test.ts`, `test/anthropic-capability-integration.test.ts`; update each package README alongside its behavior.

**Interfaces:** Export existing `OpenAIConfiguration`, `OpenAIReasoningEffort` and named `OPENAI_CONFIGURATION_SCHEMA`; export `AnthropicConfiguration`/`ANTHROPIC_CONFIGURATION_SCHEMA`. Publish `OPENAI_CONTROL_CONTRACT`/`ANTHROPIC_CONTROL_CONTRACT` and `createOpenAIControlContract(extensions?: readonly ControlExtension<JsonObject>[]): ExecutionControlContract` / `createAnthropicControlContract(extensions?: readonly ControlExtension<JsonObject>[]): ExecutionControlContract`. Add optional `controlExtensions?: readonly ControlExtension<JsonObject>[]` registrations to host provider options. Builders own/validate extension descriptors, reject ID/alias collisions and return frozen derived contracts; configured provider manifests advertise the same derived contract, while absent extensions use the baseline contract. Native adapter destination schemas remain strict model-behavior/output allowlists regardless of this generic host-registration type. Native adapters accept validated RunRequest.executionConfiguration, verify provider/schema/registered IDs before credential resolution or fetch, and use its model/config only for that invocation. Without this field, preserve current selection/configuration behavior. Direct callers resolve host/profile/task/run layers through Task 2 using the derived contract before calling adapter.run; the effective envelope is not an authorization token.

- [ ] **Step 1 — Research decision gate, before new native mapping.** During execution, verify primary OpenAI/Anthropic docs for intended reasoning fields, value sets, model-dependent combinations and token constraints. Record URLs/date and exact accepted request fields in the tracker. Existing OpenAI effort mapping is source-proven; do not alter it gratuitously. Only add Anthropic native effort if current primary evidence supports its field/values; then extend AnthropicConfiguration with the documented effort type and descriptor. If evidence is missing/contradictory, keep it rejected and PC3 partial—do not invent a mapping or describe thinking budget as effort. No provider call is required for this gate.
- [ ] **Step 2 — Write failing tests.** `OpenAI controlled run maps existing effort without changing legacy requests` uses captured fake transport bodies to assert low/high native mapping, model override, frozen invocation and legacy body equality. `API control rejection performs zero credential resolution and fetch` asserts wrong provider, unsupported/required unknown support, extension auth/model/tools attempts and malformed effective envelopes fail without I/O. `Anthropic controlled effort retains thinking policy` pins exact documented request after Step 1, and denies thinking when host grants are absent. No blanket low/high equivalence assumption.

```ts
expect(bodies[0].reasoning).toEqual({ effort: 'low' });
expect(bodies[1].reasoning).toEqual({ effort: 'high' });
expect(bodies[0].model).toBe('fixture-openai-model');
expect(credentialSpy).not.toHaveBeenCalled(); expect(transportSpy).not.toHaveBeenCalled();
expect(legacyBody).toEqual(baselineLegacyBody);
```

- [ ] **Step 3 — RED.** Run `pnpm --filter @brambodev/adapter-openai test test/model-controls.test.ts --testNamePattern 'controlled|control rejection'` and `pnpm --filter @brambodev/adapter-anthropic test test/model-controls.test.ts --testNamePattern 'controlled|control rejection'`. Expected: missing public control exports and current bodies ignoring per-run effective configuration. Each native addition gets its own observed RED after its research gate.
- [ ] **Step 4 — Implement public schemas/contracts and per-invocation mapping.** Do not mutate the captured adapter configuration or host capabilities. Validate before credential I/O; construct native behavior/output fields through the strict mapper; reuse existing tools/capability handlers and preserve primary-error diagnostics. Keep synchronous legacy provider creation and existing constructor errors unchanged.
- [ ] **Step 5 — GREEN then REFACTOR.** Rerun both focused commands; run both package-filter `test`, `typecheck`, `lint` scripts, all exit 0. Live filename exclusions remain intact. Record request-body proof using fixtures only, not raw provider output.
- [ ] **Step 6 — Commit.** Stage Task 3 paths/tracker; `git commit -m "feat(adapters): expose validated API model controls"`. If both providers cannot fit one cohesive delivery slice, split OpenAI and Anthropic into separately tested behavior commits, never code/tests by file type. Rollback: additive schemas/per-run mappings; existing API requests retained.

## Task 4: Typed CLI model controls without policy changes (PC3)

**Files:** Create `packages/adapter-cli/src/model-controls.ts`, `packages/adapter-cli/test/model-controls.test.ts`; modify `src/traits.ts`, `src/executors/codex.ts`, `claude-code.ts`, `opencode.ts`, `src/index.ts`; extend `test/executors.test.ts`, `test/adapter.test.ts`; update package README.

**Interfaces:** Export `CodexModelConfiguration = { readonly reasoningEffort?: string }`, `ClaudeCodeModelConfiguration = { readonly effort?: string }`, `OpenCodeModelConfiguration = { readonly variant?: string }` and `CODEX_CONTROL_CONTRACT`, `CLAUDE_CODE_CONTROL_CONTRACT`, `OPENCODE_CONTROL_CONTRACT`. Model identity remains the typed effective.model field, not a duplicate configuration key. Native value schemas narrow these strings using Step 1 evidence and caller model constraints, not a universal model enum. A field with no verified native surface remains explicitly unsupported. Add optional `modelControls?: EffectiveExecutionConfiguration` and `executorVersion?: string` to CliExecutorAdapterOptions. Export `buildCliModelArguments(traits: ExecutorTraits, effective: EffectiveExecutionConfiguration, executorVersion: string): readonly string[]`. Require the host-declared version to match the frozen effective.executorVersion; missing/mismatched version rejects new controlled requests. Build the full traits argv with native scope placement, then preserve existing trusted-host extraArgs/prompt delivery; never convert task fields into arbitrary extraArgs. Per-run executionConfiguration wins over the optional factory modelControls for that invocation; caller resolver already resolves other layers.

- [ ] **Step 1 — Research gate.** During execution, obtain primary CLI docs for model/reasoning/variant settings and root/subcommand placement, keyed by the host's declared executorVersion. Define the exact version-supported argument fixtures and corresponding typed schema keys before tests. No native --help/run/install is authorized here. Unsupported/missing evidence means rejection/PC3 partial, not guessed flags, arbitrary config assignment, or fallback to weaker approval flags.
- [ ] **Step 2 — Write failing tests.** `CLI typed model controls preserve command scope and policy argv` captures actual spawn seam arguments for all three factories; asserts exact documented control positions plus unchanged prompt/parser/env behavior. `CLI invalid controls spawn zero children` rejects unknown fields, reserved policy/auth flags, wrong provider and unsupported declared version. `CLI legacy extraArgs and both PWD aliases remain unchanged` reuses existing spawn-environment tests and asserts omission of modelControls produces baseline argv.

```ts
expect(spawner.children[0].args).toEqual(documentedExpectedArgv);
expect(spawner.children[0].args).toContain('--dangerously-skip-permissions'); // Claude case: baseline preserved, not added by controls
expect(spawner.children).toHaveLength(0); // separate rejected-request case
expect(safeError.message).not.toContain('synthetic-secret');
```

Use the existing `test/fake-spawner.ts` FakeSpawner.children capture API for argv; document exact expected argv from Step 1, not a dynamically generated expectation using the implementation under test. Its env merge is a test double, not proof of the actual environment boundary: environment assertions must use the existing direct spawn-entry capture pattern with synthetic env values, never inspect or print ambient credentials.
- [ ] **Step 3 — RED.** Run `pnpm --filter @brambodev/adapter-cli test test/model-controls.test.ts --testNamePattern 'CLI typed|CLI invalid|CLI legacy'`. Expected: no typed builder/export or no native model arguments at spawn. Observe separate wrong-position and rejected-policy regressions before their fixes.
- [ ] **Step 4 — Implement typed argv construction and invocation snapshots.** Preserve command/subcommand, prompt separator/stdin, parsers, environment allowlist/key blanking behavior and cancellation. Reject simultaneous conflicting trusted-host raw model overrides on the new opt-in path; retain arbitrary extraArgs unchanged on legacy paths. Typed settings never change approval/sandbox/config-loading/tools flags.
- [ ] **Step 5 — GREEN then REFACTOR.** Rerun Step 3 and `pnpm --filter @brambodev/adapter-cli test --testNamePattern 'spawn environment'`; run package `test`, `typecheck`, `lint`, all exit 0. Synthetic spawners only; skipped live suites are reported, not exercised.
- [ ] **Step 6 — Commit.** Stage Task 4 paths/tracker; `git commit -m "feat(adapter-cli): add policy-preserving typed model controls"`. Rollback: opt-in typed builder/options, preserving existing traits/raw host options.

## Task 5: Configured driver construction and direct runtime propagation (PC4)

**Files:** Modify `packages/adapter-api/src/api-driver.ts`, `index.ts`, `packages/orchestration/src/cli-drivers.ts`, `driver-registry.ts`, `packages/runtime-local/src/runtime.ts`; extend `packages/adapter-api/test/api-driver.test.ts`, `packages/orchestration/test/cli-drivers.test.ts`, `drivers.test.ts`, `packages/runtime-local/test/runtime.test.ts`; update affected READMEs.

**Interfaces:** Add optional paired `configurationControls?: ExecutionControlContract` and `createConfiguredAdapter?: (configuration: unknown, executionConfiguration: EffectiveExecutionConfiguration, services: DriverServices) => ExecutorAdapter | Promise<ExecutorAdapter>` to ApiDriverOptions/CliDriverOptions. Require both or neither; factories advertise that contract on the returned manifest and reject a conflicting explicitly supplied manifest contract. Factories expose createConfigured only when configured construction is available; legacy create stays unchanged. The registered legacy configuration schema validates the first argument on both paths; the control contract separately validates the second. Constructed configured drivers bind the effective configuration and forward it in RunRequest; reject a different DriverRequest.executionConfiguration instead of reconfiguring an already constructed driver. Runtime owns a deep-frozen copy of optional executionConfiguration before workspace materialization/driver.run; never evaluates resolvers or grants new runtime capabilities.

- [ ] **Step 1 — Write failing tests.** `configured custom driver forwards controls through actual runtime` uses synthetic acme API factory/adapter plus existing local runtime fixture to capture the actual run request. `configured CLI factory preserves zero-argument legacy path` asserts legacy empty config still works and new effective config reaches the opt-in adapter. `runtime configuration resists caller mutation and mismatched driver settings` uses a materialization barrier, mutates source after execute starts, and checks frozen captured value; mismatch rejects before adapter.run.

```ts
expect(received.executionConfiguration.configuration).toEqual({ deliberation: 'deep' });
expect(configuredAdapter).toHaveBeenCalledWith(validatedLegacyConfiguration, effective, expect.anything());
expect(legacyAdapter).toHaveBeenCalledWith();
expect(Object.isFrozen(received.executionConfiguration)).toBe(true);
expect(runSpy).not.toHaveBeenCalled(); // mismatched effective-envelope case
```

- [ ] **Step 2 — RED.** Run `pnpm --filter @brambodev/adapter-api test test/api-driver.test.ts --testNamePattern 'configured'`, `pnpm --filter @brambodev/orchestration test test/cli-drivers.test.ts test/drivers.test.ts --testNamePattern 'configured'`, `pnpm --filter @brambodev/runtime-local test test/runtime.test.ts --testNamePattern 'configuration'`. Expected current wrapper drops the envelope, registry loses optional construction method and runtime shallow copy permits mutation.
- [ ] **Step 3 — Implement the declared optional construction seam and deep-copy propagation.** Use existing registry schema validation for legacy driver configuration before factory calls; never put resolver functions in DriverServices. Effective control revalidation must produce a JSON value equal to the frozen configuration, or reject before adapter creation; never let another schema transformation change admitted controls. Keep native continuation restrictions and reconstruction authorization unchanged.
- [ ] **Step 4 — GREEN then REFACTOR.** Rerun Step 2; run all three owning package `test`, `typecheck`, `lint` scripts, all exit 0. This task's actual synthetic runtime/adapter seam is the harness proof; no native provider invocation.
- [ ] **Step 5 — Commit.** Stage Task 5 paths/tracker; `git commit -m "feat(runtime): propagate frozen execution controls through drivers"`. Rollback: new configured construction/runtime field only; legacy driver execution retained.

## Task 6: Freeze and persist configuration before durable admission (PC4)

**Files:** Create `packages/orchestration/src/configured-admission.ts`, `packages/orchestration/test/configured-admission.test.ts`; modify `src/workflow-registry.ts`, `durable-engine.ts`, `import-run.ts`, `index.ts`, `packages/workflow-coordinator/src/worker.ts`; extend `packages/orchestration/test/recovery.test.ts`, `import-run.test.ts`, `packages/workflow-coordinator/test/worker.test.ts`, `packages/contracts/test/workflow-store-conformance.test.ts`. Add `packages/workflow-coordinator/test/configuration-replay.test.ts` using existing owned synthetic fixture infrastructure; no native CLI/auth stores.

**Interfaces:** Add optional `WorkflowTaskDefinition.execution?: ExecutionConfigurationLayer`. Export `ConfiguredAdmissionOptions = { store: RunStore; snapshot: RunSnapshot; command: Command; actor: Principal; definition: WorkflowDefinition; drivers: DriverRegistry; hostForTask(task: WorkflowTaskDefinition): ExecutionControlHost; layersForTask(task: WorkflowTaskDefinition): Omit<ExecutionConfigurationLayers, 'task'> }` and `admitConfiguredWorkflowRun(options: ConfiguredAdmissionOptions): Promise<Admission>`. This helper handles start admission only: it resolves configured tasks, verifies createConfigured availability, copies/freezes snapshot.executionConfigurations and calls existing RunStore.create exactly once. Task layer is task.execution; all raw driver configuration remains separate and must pass its existing schema. Do not resolve unconfigured legacy tasks or emit an optional empty field for old runs.

Add `TaskExecutionContext.executionConfiguration?: EffectiveExecutionConfiguration`; engine derives it solely from stored snapshot task entries. Admission records each configured task's registered driverId/driverVersion. Worker checks the current registration matches those stored identities before calling `factory.createConfigured(context.definition.configuration, context.executionConfiguration, services)`, otherwise blocks with zero adapter construction; legacy tasks still use create. Include the same frozen field in runtime.execute. No worker/default/resolver lookup on replay. The helper SHA256-fingerprints canonical `{ definition, executionConfigurations }` into new command payload `{ intent: originalCommandPayload, executionConfigurationFingerprint: string }` before create so a same idempotency key with changed effective controls or legacy driver configuration conflicts rather than reconfigures. Existing callers/command payloads remain unchanged outside the helper.

- [ ] **Step 1 — Write failing tests.** `configured admission persists resolved controls before any command is visible` captures the first actual store.create arguments and pending receipt; requires complete validated snapshots at that atomic point. `configured admission rejection performs zero store mutation or driver creation` asserts unsupported required support, unsupported legacy factory and malformed snapshot reject with create/admit/factory/runtime counters zero. `durable configuration replay does not reevaluate host defaults or resolver` reopens the fixture/worker after a controlled checkpoint, replaces defaults/resolver with throwing sentinels, and captures factory/runtime/adapter values on continuation. `durable configuration replay refuses changed driver or executor versions` changes each stored binding separately and asserts zero adapter/factory execution, not a silent remap. `duplicate admission and import preserve execution configuration identity` checks changed override conflicts and snapshot exports/imports/replay retain exact values. Configuration changes on an already admitted run are refused; a new run is required.

```ts
expect(firstCreate.snapshot.executionConfigurations[0].configuration.configuration).toEqual({ deliberation: 'deep' });
expect(firstCreate.command.payload.executionConfigurationFingerprint).toMatch(/^[a-f0-9]{64}$/);
expect(createSpy).not.toHaveBeenCalled(); expect(factorySpy).not.toHaveBeenCalled();
expect(replayResolver).not.toHaveBeenCalled();
expect(replayedEffective).toEqual(admittedEffective);
expect(changedDuplicate.status).toBe('conflict');
```

Arrange the existing `test/helpers/workflow-fixture.ts` file authority for deterministic admission/reopen tests, not as a claim of multi-process SQLite proof. Coordinator replay uses actual createWorkflowWorker + synthetic configured driver/runtime and production openSqliteRunStore from `@brambodev/workflow-store-sqlite`, following the public import/owned root pattern in `packages/workflow-coordinator/test/fixtures/coordinator-process.ts` and `durable-cli-restart.test.ts`; do not change those existing fixtures or introduce SDK dependencies for test resolution. Use explicit barriers/owned cleanup and unchanged TTLs/timeouts. Use configured-admission spies on the real method entry before reading arguments, not counters after successful parsing.
- [ ] **Step 2 — RED.** Run `pnpm --filter @brambodev/orchestration test test/configured-admission.test.ts --testNamePattern 'configured admission|duplicate admission'` and `pnpm --filter @brambodev/workflow-coordinator test test/configuration-replay.test.ts --testNamePattern 'durable configuration replay'`. Expected missing admission export/no persisted optional snapshot or worker using mutable definition configuration. Then run each import/identity regression before its source fix.
- [ ] **Step 3 — Implement atomic admission and snapshot consumption.** Validate all configured tasks before any write; no accepted receipt while resolution is pending. Use existing store atomic create, not a post-admission configuration event/CAS. Check task/provider identity and driver opt-in at admission and worker consumption; never trust raw metadata to grant policy. Preserve effective configuration in import/export compatibility fingerprints and snapshot spreads, including cross-device continuation; do not change leases, SQLite schema, ownership, policies or transport version. Revalidate data/schema/driver compatibility on consumption without rerunning model-support/default resolution; mismatch blocks rather than silently substituting configuration.
- [ ] **Step 4 — GREEN then REFACTOR.** Rerun Step 2 plus `pnpm --filter @brambodev/orchestration test test/recovery.test.ts test/import-run.test.ts`; run orchestration, workflow-coordinator and contracts `test`, `typecheck`, `lint` scripts, all exit 0. Coordinator package's existing maxWorkers=2 stays effective; no timeout/TTL inflation. Preserve every nonzero gate result as partial, including unclassified child failures.
- [ ] **Step 5 — Commit.** Stage Task 6 paths/tracker; `git commit -m "feat(orchestration): freeze model controls at durable admission"`. Rollback: additive configured admission/snapshot consumption; no underlying store or policy contract removal.

## Task 7: Public consumer proof and honest coverage documentation (PC5)

**Files:** Extend `packages/adapter-api/test/consumer-conformance.fixture.ts`, `consumer-install.proof.ts`, `packages/orchestration/test/index.test.ts`; update `packages/adapter-api/README.md`, `packages/adapter-openai/README.md`, `packages/adapter-anthropic/README.md`, `packages/adapter-cli/README.md`, `packages/orchestration/README.md`, `packages/workflow-coordinator/README.md`; update tracker coverage/evidence. Check local file paths before edits; do not touch historical untracked plan/spec/tracker.

**Interfaces:** Public package roots export all contracts/functions explicitly named above. Consumer fixture imports them from package roots, never private src subpaths. Synthetic acme registration, direct API run and admitted durable configuration use the same control IDs/schemas without adding a vendor enum. Existing consumer fixture requirements remain in force.

- [ ] **Step 1 — Write consumer acceptance assertions.** `public model control exports compose a custom provider` asserts root exports and synthetic acme typed schema/factory construction; `coverage documentation distinguishes unknown support and CLI trust boundaries` pins truthful examples for unknown support, legacy mode, typed task/run precedence and no OS sandbox promise. This final unit adds proof/docs, not a new product behavior; earlier owning tasks already added their required exports through actual TDD.
- [ ] **Step 2 — Observe consumer acceptance; RED only for a real discovered defect.** Run `pnpm --filter @brambodev/orchestration test test/index.test.ts --testNamePattern 'public model control'`; run `pnpm --filter @brambodev/adapter-api typecheck` with the new public consumer fixture. Expected PASS after Tasks 1–6. If a root export/type/integration defect actually fails, retain that precise RED assertion before fixing it and rerun GREEN; do not remove a correct export or invent a failing count to manufacture RED. Missing-file/module infrastructure errors are not behavioral RED proof.
- [ ] **Step 3 — Correct observed consumer defects, if any, and document coverage.** Explain configuration versus policy, known/unsupported/unknown support, requiredSupport, atomic replacements, persisted run overrides and custom extension registration. Publish only mappings with recorded native/version evidence; leave unsupported/unknown controls explicit. Record actual acceptance commands/counts and any genuine corrective RED/GREEN, skipped/failed/pending checks in tracker. With no defect, implementation TDD is N/A for this proof/documentation unit.
- [ ] **Step 4 — GREEN then REFACTOR and integrated gates.** Rerun Step 2; run the eight package-filter test commands in the tracker and every affected package's typecheck/lint; all must exit 0. Package scripts were inspected during planning, not run. Before broader repository build/docs/consumer-install gates, inspect their exact scripts and obtain authorization if they install/download or invoke external providers. Do not claim full packaging proof from a focused fixture; unavailable offline dependencies remain pending.
- [ ] **Step 5 — Commit.** Stage only Task 7 consumer/docs/export corrections/tracker; `git commit -m "docs: document extensible provider control coverage and limitations"` (use `test:` if executable consumer work dominates). Rollback: consumer assertions/examples only; no weakening of existing proof or export-count assertions.

## Self-review and handoff

Spec coverage: minimal typed contract/extension seams Tasks 1–2; model unknown/compatibility Task 2; native controls/policy boundaries Tasks 3–4; direct configured runtime Task 5; durable admission/restart/import Task 6; public consumer/docs Task 7. Every Review Focus risk has a named owning test. Signatures and field names match the interface blocks. Mapping research is an execution gate, not an invented current-vendor claim. No implementation checks have run or passed during this documentation phase.

The human now reviews this plan and confirms it captures the approved outcome. Preserve Subagent-driven and stacked-to-main; do not present a new method menu. Start Task 1 only after that review is accepted, then run actual strict TDD and the existing ordinary verification policy task-by-task.
