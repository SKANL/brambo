# API Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a transport-neutral API executor core, complete OpenAI and Anthropic coding-agent adapters, host-authorized local tools, and safe third-party extension.

**Architecture:** Preserve `ExecutorAdapter` as the sole session-facing port. Add provider contracts and explicit registration, put transport/stream/tool-loop mechanics in `@brambodev/adapter-api`, and keep OpenAI/Anthropic protocol mappings in independent packages. Hosted provider features are explicit policy-gated capabilities.

**Tech Stack:** TypeScript 7, Node.js >=20 for published packages, pnpm 11.23.0, Vitest 4, Node fetch/Web Streams, existing Brambo contracts/kernel/session.

**Spec:** `docs/superpowers/specs/2026-09-24-api-adapters-design.md`

## Global Constraints

- Preserve `ExecutorAdapter.run(request: RunRequest): Promise<ResultEnvelope>` and all CLI executor behavior.
- `kernel`, `session`, and `contracts` must not depend on provider SDKs or HTTP provider clients.
- Keep API transport outside `@brambodev/adapter-cli`.
- Every local provider tool request must use `executeTool()` with policy, `PermissionAuthorizer`, host approval, and `ToolExecutor`.
- Credentials are injected by the host; never read them at import time, write them to config, or include raw secrets/headers/payloads in generic logs.
- Configuration can select only a registered provider ID; it cannot carry a dynamic import, executable, package installation instruction, or credential.
- Retry only a request proven safe before side effects; never retry after abort or retry a local tool.
- Hosted capabilities require manifest advertisement, host selection, provider config validation, policy approval, telemetry, and explicit ownership cleanup.
- Preserve raw provider usage/request IDs/rate-limit metadata; do not invent cost/token/reset values.
- Use Conventional Commit messages only. No AI attribution trailers.
- Run source tests and a packed-artifact consumer proof before release.

## Review Focus

1. Abort racing a streamed tool request: no new tool dispatch after abort and final envelope is cancelled; Task 5.
2. Duplicate or unknown provider tool-call ID: fail before approval/execution; Task 5.
3. Possible side effect before a retry: no retry without idempotency proof; Task 3.
4. Credential in an error/header: normalized errors and diagnostics redact it; Task 4.
5. Resolver candidate outside the allowlist: reject without loading code; Task 10.

---

## File structure before implementation

| Path | Responsibility |
|---|---|
| `packages/contracts/src/executor-provider.ts` | Manifests, capabilities, selection, normalized API usage/error contracts. |
| `packages/adapter-api/src/registry.ts` | Explicit host-owned registration. |
| `packages/adapter-api/src/transport.ts` | Injected fetch, deadline, abort, retry classification. |
| `packages/adapter-api/src/redaction.ts` / `stream.ts` | Safe metadata and bounded normalized events. |
| `packages/adapter-api/src/tool-loop.ts` | Correlated, bounded bridge to session `executeTool()`. |
| `packages/adapter-api/src/remote-capability.ts` | Hosted capability policy and remote ownership ledger. |
| `packages/adapter-api/src/testing.ts` | Public black-box provider conformance suite. |
| `packages/adapter-openai/src/*` | Responses mapping, SSE, functions, explicit hosted capabilities. |
| `packages/adapter-anthropic/src/*` | Messages mapping, SSE, `tool_use`, explicit hosted capabilities. |
| `packages/environment/src/api-executors.ts` | Registered API provider selection only. |
| `docs-site/docs/guides/*api*` | Setup, security, third-party authoring, migration. |

Create every package using `packages/adapter-cli` ESM/package/test conventions. Do not create all source files up front: introduce each with its task and failing test.

### Task 1: Freeze executor and session compatibility

**Files:**
- Create: `packages/contracts/test/executor-provider.compatibility.test.ts`
- Modify: `packages/session/test/run-session.test.ts`

**Interfaces:** Consumes current `ExecutorAdapter`, `RunRequest`, `ResultEnvelope`, `runSession`. Produces regression evidence that an adapter need not be a CLI adapter.

- [ ] **Step 1: Write the compatibility test**

```ts
it('keeps the executor port transport-neutral', async () => {
  const adapter: ExecutorAdapter = { run: async (request: RunRequest): Promise<ResultEnvelope> => {
    expect(request.workspace.id).toBe('workspace-1')
    return { status: 'ok', data: null, summary: 'complete' }
  } }
  expect(adapter.run).toBeTypeOf('function')
})
```

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @brambodev/contracts test -- executor-provider.compatibility.test.ts`

Expected: PASS after adapting existing test fixtures; production exports remain unchanged.

- [ ] **Step 3: Add injected API-shaped adapter session proof**

```ts
it('runs an injected adapter without CLI traits', async () => {
  const result = await runSession({ prompt: 'inspect', workspaceProvider: fakeWorkspaceProvider(), createAdapter: () => ({ run: async () => ({ status: 'ok', data: { transport: 'api' }, summary: 'done' }) }) })
  expect(result).toMatchObject({ status: 'ok', data: { transport: 'api' } })
})
```

- [ ] **Step 4: Verify focused contracts and session tests**

Run: `pnpm --filter @brambodev/contracts test -- executor-provider.compatibility.test.ts && pnpm --filter @brambodev/session test -- run-session.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/test/executor-provider.compatibility.test.ts packages/session/test/run-session.test.ts
git commit -m "test(contracts): freeze executor transport compatibility"
```

### Task 2: Add provider manifests and normalized observation contracts

**Files:**
- Create: `packages/contracts/src/executor-provider.ts`
- Create: `packages/contracts/test/executor-provider.test.ts`
- Modify: `packages/contracts/src/index.ts`, `packages/contracts/src/errors.ts`

**Interfaces:** Produces `ExecutorCapability`, `ExecutorManifest`, `ExecutorProvider`, `ExecutorSelection`, `ExecutorProviderCreateOptions`, `ApiUsageObservation`, `ApiProviderError`, `validateExecutorManifest`, `validateExecutorSelection`.

- [ ] **Step 1: Write failing contract tests**

```ts
it('rejects an invalid manifest and duplicate capability', () => {
  expect(() => validateExecutorManifest({ id: 'Open AI', displayName: 'OpenAI', contractVersion: '1', packageName: '@brambo/openai', capabilities: ['streaming', 'streaming'], configurationSchema: schema })).toThrow(/id/)
})
it('keeps observed usage raw rather than inventing cost', () => {
  expect(validateApiUsageObservation({ providerId: 'openai', model: 'gpt-test', observedAt: '2026-09-24T00:00:00.000Z', inputTokens: 4, outputTokens: 7, requestId: 'req_1' })).not.toHaveProperty('cost')
})
```

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @brambodev/contracts test -- executor-provider.test.ts`

Expected: FAIL because provider contracts do not exist.

- [ ] **Step 3: Implement the additive public contracts**

```ts
export type ExecutorCapability = 'streaming' | 'local-tools' | 'conversation-state' | 'prompt-caching' | 'extended-thinking' | 'provider-files' | 'remote-mcp' | 'hosted-web-search'
export interface ExecutorManifest { readonly id: string; readonly displayName: string; readonly contractVersion: '1'; readonly packageName: string; readonly capabilities: readonly ExecutorCapability[]; readonly configurationSchema: StandardSchemaV1<unknown> }
export interface ExecutorProvider { readonly manifest: ExecutorManifest; create(options: ExecutorProviderCreateOptions): ExecutorAdapter }
export interface ExecutorSelection { readonly providerId: string; readonly model: string; readonly capabilities?: readonly ExecutorCapability[]; readonly configuration?: unknown }
```

Add validators, safe error categories, and coded Brambo errors for invalid manifest, invalid selection, unknown provider, and duplicate registration.

- [ ] **Step 4: Verify public exports**

Run: `pnpm --filter @brambodev/contracts test -- executor-provider.test.ts && pnpm --filter @brambodev/contracts typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/executor-provider.ts packages/contracts/src/index.ts packages/contracts/src/errors.ts packages/contracts/test/executor-provider.test.ts
git commit -m "feat(contracts): add API executor provider contracts"
```
### Task 3: Create explicit provider registry and API transport core

**Files:**
- Create: `packages/adapter-api/package.json`, `tsconfig.json`, `tsconfig.build.json`
- Create: `packages/adapter-api/src/types.ts`, `registry.ts`, `transport.ts`, `index.ts`
- Create: `packages/adapter-api/test/registry.test.ts`, `transport.test.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:** Consumes Task 2 types. Produces `createExecutorRegistry(): ExecutorRegistry`, `executeWithRetry<T>(request: ApiRequest<T>, dependencies: ApiTransportDependencies): Promise<T>`, `IdempotencyProof`.

- [ ] **Step 1: Write registry and retry RED tests**

```ts
it('creates only a host-registered provider', () => {
  const registry = createExecutorRegistry()
  registry.register(fakeProvider('openai'))
  expect(registry.create({ providerId: 'openai', model: 'gpt-test' }, createOptions)).toBeDefined()
  expect(() => registry.resolve('unknown')).toThrow(/unknown/)
})
it('does not retry a possible accepted side effect', async () => {
  const send = vi.fn().mockRejectedValue({ category: 'unavailable', requestAccepted: true })
  await expect(executeWithRetry({ send, signal: new AbortController().signal, idempotency: 'unknown' }, deps)).rejects.toMatchObject({ category: 'unavailable' })
  expect(send).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @brambodev/adapter-api test -- registry.test.ts transport.test.ts`

Expected: FAIL because this package does not exist.

- [ ] **Step 3: Scaffold the package and implement explicit registration**

```ts
export interface ExecutorRegistry { register(provider: ExecutorProvider): void; resolve(providerId: string): ExecutorProvider; create(selection: ExecutorSelection, options: ExecutorProviderCreateOptions): ExecutorAdapter; list(): readonly ExecutorManifest[] }
export function createExecutorRegistry(): ExecutorRegistry { /* validate manifest; reject duplicate; validate capability subset/configuration schema before provider.create */ }
```

Copy package exports/scripts from `packages/adapter-cli/package.json`, replacing dependencies with `@brambodev/contracts`, `@brambodev/session` only where the tool bridge later requires it, and test/typecheck/lint/build scripts unchanged in form.

- [ ] **Step 4: Implement one injectable retry engine**

```ts
export type IdempotencyProof = 'safe' | 'provider-key' | 'unknown'
export interface ApiRequest<T> { readonly send: () => Promise<T>; readonly signal: AbortSignal; readonly deadlineAt?: number; readonly idempotency: IdempotencyProof }
export interface ApiTransportDependencies { readonly now: () => number; readonly sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>; readonly random: () => number; readonly maxAttempts: number }
```

Before each attempt/sleep, check abort and deadline. Retry only classified transient errors with `requestAccepted === false` and `safe`/`provider-key` idempotency. Use full jitter and emit attempt observations; convert abort into a normalized cancelled error.

- [ ] **Step 5: Add deadline, 429, unknown-idempotency, and abort tests**

```ts
it('retries a 429 before acceptance within deadline', async () => { /* fake clock produces exactly two sends */ })
it('does not sleep past deadline', async () => { /* one send and deadline failure */ })
it('does not retry after abort', async () => { /* abort in first send; one call */ })
```

- [ ] **Step 6: Verify and commit**

Run: `pnpm --filter @brambodev/adapter-api test -- registry.test.ts transport.test.ts && pnpm --filter @brambodev/adapter-api typecheck && pnpm --filter @brambodev/adapter-api lint`

```bash
git add packages/adapter-api pnpm-lock.yaml
git commit -m "feat(adapter-api): add registry and retry transport"
```

### Task 4: Add redaction, raw observations, and bounded stream events

**Files:**
- Create: `packages/adapter-api/src/redaction.ts`, `stream.ts`
- Create: `packages/adapter-api/test/redaction.test.ts`, `stream.test.ts`
- Modify: `packages/adapter-api/src/index.ts`

**Interfaces:** Produces `redactProviderMetadata(value: unknown, secrets: readonly string[]): unknown`, `normalizeProviderError(input: ProviderFailureInput): ApiProviderError`, `createApiEventStream(options: ApiEventStreamOptions): ApiEventStream`.

- [ ] **Step 1: Write failing safety tests**

```ts
it('redacts authorization, nested API keys, and configured secrets', () => {
  expect(redactProviderMetadata({ Authorization: 'Bearer sk-secret', nested: { api_key: 'sk-secret' } }, ['sk-secret'])).toEqual({ Authorization: '[REDACTED]', nested: { api_key: '[REDACTED]' } })
})
it('bounds retained events while retaining monotonic sequence', () => {
  const stream = createApiEventStream({ maxRetainedEvents: 2 })
  stream.append({ kind: 'text.delta', sequence: 1, data: 'a' }); stream.append({ kind: 'text.delta', sequence: 2, data: 'b' }); stream.append({ kind: 'text.delta', sequence: 3, data: 'c' })
  expect(stream.snapshot()).toMatchObject({ dropped: 1, events: [{ sequence: 2 }, { sequence: 3 }] })
})
```

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @brambodev/adapter-api test -- redaction.test.ts stream.test.ts`

Expected: FAIL because safe observation APIs are absent.

- [ ] **Step 3: Implement redaction and normalized error behavior**

```ts
export function redactProviderMetadata(value: unknown, secrets: readonly string[]): unknown { /* recursively replace authorization/api-key/token keys and exact configured secret substrings */ }
export function normalizeProviderError(input: ProviderFailureInput): ApiProviderError { /* category plus redacted status/code/requestId/retryAfter only */ }
```

Reject non-monotonic stream sequence with a protocol error. Retain only bounded event snapshots; secure observers receive events directly and generic diagnostics never contain full request/response bodies.

- [ ] **Step 4: Add review-focus leak regression**

```ts
it('never exposes a configured secret in normalized errors or diagnostics', () => {
  const error = normalizeProviderError({ providerId: 'openai', message: 'Bearer sk-live', headers: { authorization: 'Bearer sk-live' }, secrets: ['sk-live'] })
  expect(JSON.stringify(error)).not.toContain('sk-live')
})
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @brambodev/adapter-api test -- redaction.test.ts stream.test.ts && pnpm --filter @brambodev/adapter-api lint`

```bash
git add packages/adapter-api/src/redaction.ts packages/adapter-api/src/stream.ts packages/adapter-api/src/index.ts packages/adapter-api/test/redaction.test.ts packages/adapter-api/test/stream.test.ts
git commit -m "feat(adapter-api): normalize safe provider events"
```

### Task 5: Implement the complete host-authorized local tool loop

**Files:**
- Create: `packages/adapter-api/src/tool-loop.ts`
- Create: `packages/adapter-api/test/tool-loop.test.ts`
- Modify: `packages/adapter-api/src/types.ts`, `index.ts`

**Interfaces:** Consumes `executeTool`/`ExecuteToolOptions` from `@brambodev/session`. Produces `runLocalToolLoop<TState>(options: LocalToolLoopOptions<TState>): Promise<LocalToolLoopResult<TState>>`, `ProviderToolCall`, `ProviderToolResultEncoder`.

- [ ] **Step 1: Write failing authorization and duplicate-ID tests**

```ts
it('uses the supplied executeTool boundary for every provider call', async () => {
  const execute = vi.fn(async () => ({ status: 'ok', data: { path: 'a.ts' } }))
  await runLocalToolLoop({ ...fixture, executeTool: execute, next: oneCallThenFinal('call_1') })
  expect(execute).toHaveBeenCalledWith(expect.objectContaining({ invocation: expect.objectContaining({ id: 'call_1' }) }))
})
it('rejects duplicate provider call IDs before second approval', async () => {
  const execute = vi.fn()
  await expect(runLocalToolLoop({ ...fixture, executeTool: execute, next: duplicateCall('call_1') })).rejects.toThrow(/duplicate tool call/i)
  expect(execute).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @brambodev/adapter-api test -- tool-loop.test.ts`

Expected: FAIL because the loop is absent.

- [ ] **Step 3: Implement the bounded correlated loop**

```ts
export interface LocalToolLoopOptions<TState> {
  readonly state: TState; readonly signal: AbortSignal
  readonly limits: { readonly maxSteps: number; readonly maxConcurrentCalls: number }
  readonly next: (state: TState, priorResults: readonly EncodedProviderToolResult[]) => Promise<ProviderTurn<TState>>
  readonly executeTool: (options: ExecuteToolOptions) => Promise<ToolResult>
  readonly encodeResult: ProviderToolResultEncoder
  readonly createExecution: (call: ProviderToolCall, signal: AbortSignal) => ExecuteToolOptions
}
```

Track IDs over the entire turn, validate arguments before approval, check abort before scheduling, preserve provider call order, and only parallelize when the provider requests it, each tool is concurrency-safe, and policy limits allow it.

- [ ] **Step 4: Add cancellation and adverse tool cases**

```ts
it('dispatches no later tool after abort and returns cancelled', async () => { /* first call aborts; second stays uncalled */ })
it('encodes denied tool output once without retry', async () => { /* next receives denial result */ })
it('fails malformed arguments before approval', async () => { /* executeTool has zero calls */ })
it('stops at maxSteps', async () => { /* no maxSteps + 1 dispatch */ })
```

- [ ] **Step 5: Verify session boundary and commit**

Run: `pnpm --filter @brambodev/adapter-api test -- tool-loop.test.ts && pnpm --filter @brambodev/session test -- tool-composition.test.ts`

```bash
git add packages/adapter-api/src/tool-loop.ts packages/adapter-api/src/types.ts packages/adapter-api/src/index.ts packages/adapter-api/test/tool-loop.test.ts
git commit -m "feat(adapter-api): enforce authorized local tool loops"
```

### Task 6: Gate hosted capabilities and track remote ownership

**Files:**
- Create: `packages/adapter-api/src/remote-capability.ts`, `packages/adapter-api/test/remote-capability.test.ts`
- Modify: `packages/adapter-api/src/types.ts`, `index.ts`

**Interfaces:** Produces `authorizeRemoteCapability(request: RemoteCapabilityRequest): RemoteCapabilityGrant`, `createRemoteResourceLedger(): RemoteResourceLedger`.

- [ ] **Step 1: Write failing policy and ownership tests**

```ts
it('denies remote MCP without manifest and policy grants', () => {
  expect(() => authorizeRemoteCapability({ capability: 'remote-mcp', advertised: [], selected: ['remote-mcp'], policy: allowPolicy })).toThrow(/not advertised/)
})
it('deletes only adapter-owned remote resources', async () => {
  const ledger = createRemoteResourceLedger(); ledger.record({ providerId: 'openai', kind: 'file', id: 'owned', owner: 'adapter' }); ledger.observe({ providerId: 'openai', kind: 'file', id: 'host', owner: 'host' })
  await ledger.dispose(remove)
  expect(remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'owned' })); expect(remove).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'host' }))
})
```

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @brambodev/adapter-api test -- remote-capability.test.ts`

Expected: FAIL because capability gate and ledger are absent.

- [ ] **Step 3: Implement positive-grant-only handling**

```ts
export interface RemoteCapabilityRequest { readonly capability: ExecutorCapability; readonly advertised: readonly ExecutorCapability[]; readonly selected: readonly ExecutorCapability[]; readonly policy: RemoteCapabilityPolicy }
export interface RemoteResourceLedger { record(resource: OwnedRemoteResource): void; observe(resource: ObservedRemoteResource): void; dispose(remove: (resource: OwnedRemoteResource) => Promise<void>): Promise<void> }
```

Require advertisement, selection, and policy grant. Record resource IDs before exposing handles. Make disposal idempotent, aggregate cleanup errors, and never delete observed host-owned resources.

- [ ] **Step 4: Add egress/retention tests**

```ts
it('requires egress policy for hosted web search', () => { /* denied without host network rule */ })
it('requires explicit retention and deletion policy for provider files', () => { /* denied until both exist */ })
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @brambodev/adapter-api test -- remote-capability.test.ts && pnpm --filter @brambodev/adapter-api typecheck`

```bash
git add packages/adapter-api/src/remote-capability.ts packages/adapter-api/src/types.ts packages/adapter-api/src/index.ts packages/adapter-api/test/remote-capability.test.ts
git commit -m "feat(adapter-api): gate hosted capabilities"
```

### Task 7: Publish reusable provider conformance tests

**Files:**
- Create: `packages/adapter-api/src/testing.ts`, `packages/adapter-api/test/conformance.test.ts`
- Modify: `packages/adapter-api/package.json`, `packages/adapter-api/src/index.ts`

**Interfaces:** Produces `defineExecutorProviderConformance(subject: ExecutorProviderConformanceSubject): void` exported from `@brambodev/adapter-api/testing`.

- [ ] **Step 1: Write self-conformance test against a fake provider**

```ts
import { defineExecutorProviderConformance } from '../src/testing.ts'
defineExecutorProviderConformance({ name: 'fake', provider: fakeProvider, createOptions, runRequest: fakeRunRequest, fixtures: fakeFixtures })
```

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @brambodev/adapter-api test -- conformance.test.ts`

Expected: FAIL because the test API is absent.

- [ ] **Step 3: Implement black-box assertions**

```ts
export function defineExecutorProviderConformance(subject: ExecutorProviderConformanceSubject): void {
  describe(subject.name, () => {
    it('publishes a valid manifest'); it('returns valid success and non-empty failure envelopes')
    it('propagates cancellation'); it('does not retry tools'); it('rejects malformed and duplicate calls')
    it('redacts failures'); it('disposes only owned resources')
  })
}
```

Implement each declaration as an actual fixture-backed assertion. Add a `./testing` source/dist conditional export in `package.json`.

- [ ] **Step 4: Prove consumer import**

```ts
import { defineExecutorProviderConformance } from '@brambodev/adapter-api/testing'
expectTypeOf(defineExecutorProviderConformance).toBeFunction()
```

Add an adapter-api packed-consumer Vitest proof matching `packages/session` consumer-install conventions.

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @brambodev/adapter-api test && pnpm --filter @brambodev/adapter-api build`

```bash
git add packages/adapter-api/src/testing.ts packages/adapter-api/src/index.ts packages/adapter-api/package.json packages/adapter-api/test/conformance.test.ts
git commit -m "feat(adapter-api): publish provider conformance suite"
```

### Task 8: Implement complete OpenAI Responses adapter

**Files:**
- Create: `packages/adapter-openai/package.json`, `tsconfig.json`, `tsconfig.build.json`
- Create: `packages/adapter-openai/src/openai-provider.ts`, `openai-events.ts`, `openai-tools.ts`, `openai-capabilities.ts`, `index.ts`
- Create: `packages/adapter-openai/test/openai-provider.test.ts`, `openai-events.test.ts`, `openai-tools.test.ts`, `openai-capabilities.test.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:** Consumes Tasks 2–7. Produces `OPENAI_EXECUTOR_MANIFEST` and `createOpenAIProvider(options: OpenAIProviderOptions): ExecutorProvider`.

- [ ] **Step 1: Write request/secret RED test**

```ts
it('maps a Brambo run to Responses without leaking credentials', async () => {
  const transport = fakeOpenAITransport(); const adapter = createOpenAIProvider({ credential: bearer('sk-test'), transport }).create(createOptions({ model: 'gpt-5' }))
  await adapter.run(fakeRunRequest('read package.json'))
  expect(transport.requests[0].body).toMatchObject({ model: 'gpt-5', input: expect.any(Array) })
  expect(JSON.stringify(transport.observations)).not.toContain('sk-test')
})
```

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @brambodev/adapter-openai test -- openai-provider.test.ts openai-events.test.ts openai-tools.test.ts openai-capabilities.test.ts`

Expected: FAIL because package is absent.

- [ ] **Step 3: Implement manifest and base Responses execution**

```ts
export const OPENAI_EXECUTOR_MANIFEST: ExecutorManifest = { id: 'openai', displayName: 'OpenAI API', contractVersion: '1', packageName: '@brambodev/adapter-openai', capabilities: ['streaming', 'local-tools', 'conversation-state', 'prompt-caching', 'provider-files', 'remote-mcp', 'hosted-web-search'], configurationSchema: OPENAI_CONFIGURATION_SCHEMA }
export function createOpenAIProvider(options: OpenAIProviderOptions): ExecutorProvider { /* injected credential/transport, validated selection */ }
```

Use current official Responses API request fields verified immediately before implementation. Map terminal output, request ID, usage, and rate-limit headers to common observations.

- [ ] **Step 4: Implement SSE/functions/tool loop**

```ts
export function decodeOpenAIResponseEvent(event: unknown): OpenAIProviderEvent { /* validate type, output/call IDs, sequence */ }
export function toOpenAIToolDefinition(tool: BramboToolDefinition): OpenAIToolDefinition { /* strict JSON schema */ }
export function toOpenAIToolOutput(result: EncodedProviderToolResult): OpenAIFunctionCallOutput { /* call_id correlation */ }
```

Call `runLocalToolLoop`; test deltas, terminal completion, function arguments, malformed args, duplicate `call_id`, denied tool, and submitted function output.

- [ ] **Step 5: Implement optional capabilities with explicit gates**

```ts
export function createOpenAICapabilityHandlers(options: OpenAICapabilityOptions): ProviderCapabilityHandlers { return { webSearch: gateHostedWebSearch(options), remoteMcp: gateRemoteMcp(options), files: gateProviderFiles(options), conversationState: gateConversationState(options), promptCaching: observePromptCaching(options) } }
```

Prove default requests contain none of web search/MCP/files; prove selected allowed capability records ownership and cleanup. Exclude computer use, hosted code execution, and background jobs.

- [ ] **Step 6: Verify conformance and commit**

Run: `pnpm --filter @brambodev/adapter-openai test && pnpm --filter @brambodev/adapter-openai typecheck && pnpm --filter @brambodev/adapter-openai build`

```bash
git add packages/adapter-openai pnpm-lock.yaml
git commit -m "feat(adapter-openai): add Responses coding adapter"
```

### Task 9: Implement complete Anthropic Messages adapter

**Files:**
- Create: `packages/adapter-anthropic/package.json`, `tsconfig.json`, `tsconfig.build.json`
- Create: `packages/adapter-anthropic/src/anthropic-provider.ts`, `anthropic-events.ts`, `anthropic-tools.ts`, `anthropic-capabilities.ts`, `index.ts`
- Create: `packages/adapter-anthropic/test/anthropic-provider.test.ts`, `anthropic-events.test.ts`, `anthropic-tools.test.ts`, `anthropic-capabilities.test.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:** Consumes Tasks 2–7. Produces `ANTHROPIC_EXECUTOR_MANIFEST` and `createAnthropicProvider(options: AnthropicProviderOptions): ExecutorProvider`.

- [ ] **Step 1: Write Messages/credential RED test**

```ts
it('maps a Brambo prompt to Messages and keeps the API key in transport headers only', async () => {
  const transport = fakeAnthropicTransport(); const adapter = createAnthropicProvider({ credential: apiKey('anthropic-test'), transport }).create(createOptions({ model: 'claude-test' }))
  await adapter.run(fakeRunRequest('inspect source'))
  expect(transport.requests[0].body).toMatchObject({ model: 'claude-test', messages: expect.any(Array) })
  expect(JSON.stringify(transport.events)).not.toContain('anthropic-test')
})
```

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @brambodev/adapter-anthropic test -- anthropic-provider.test.ts anthropic-events.test.ts anthropic-tools.test.ts anthropic-capabilities.test.ts`

Expected: FAIL because package is absent.

- [ ] **Step 3: Implement manifest and base Messages path**

```ts
export const ANTHROPIC_EXECUTOR_MANIFEST: ExecutorManifest = { id: 'anthropic', displayName: 'Anthropic API', contractVersion: '1', packageName: '@brambodev/adapter-anthropic', capabilities: ['streaming', 'local-tools', 'prompt-caching', 'extended-thinking', 'provider-files', 'remote-mcp', 'hosted-web-search'], configurationSchema: ANTHROPIC_CONFIGURATION_SCHEMA }
export function createAnthropicProvider(options: AnthropicProviderOptions): ExecutorProvider { /* injected credential/transport and validated config */ }
```

Use current Messages API version/header/request rules verified immediately before implementation. Map text, stop reason, usage, request ID, and rate-limit metadata without fabricating cost.

- [ ] **Step 4: Implement SSE and `tool_use`/`tool_result` translation**

```ts
export function decodeAnthropicSseEvent(event: unknown): AnthropicProviderEvent { /* validate data and sequence */ }
export function toAnthropicToolDefinition(tool: BramboToolDefinition): AnthropicToolDefinition { /* input_schema */ }
export function toAnthropicToolResult(result: EncodedProviderToolResult): AnthropicToolResultBlock { /* tool_use_id */ }
```

Use `runLocalToolLoop`, resulting in the next Messages request carrying correlated `tool_result` blocks. Test multiple calls, malformed input, denial/error output, stream error, cancellation, and max-step termination.

- [ ] **Step 5: Implement optional capabilities with explicit gates**

```ts
export function createAnthropicCapabilityHandlers(options: AnthropicCapabilityOptions): ProviderCapabilityHandlers { return { webSearch: gateHostedWebSearch(options), remoteMcp: gateRemoteMcp(options), files: gateProviderFiles(options), promptCaching: observePromptCaching(options), extendedThinking: gateExtendedThinking(options) } }
```

Prove extended thinking and every hosted feature are absent by default. Preserve cache/thinking observations provider-specifically. Exclude code execution, computer use, and batch/background products.

- [ ] **Step 6: Verify conformance and commit**

Run: `pnpm --filter @brambodev/adapter-anthropic test && pnpm --filter @brambodev/adapter-anthropic typecheck && pnpm --filter @brambodev/adapter-anthropic build`

```bash
git add packages/adapter-anthropic pnpm-lock.yaml
git commit -m "feat(adapter-anthropic): add Messages coding adapter"
```

### Task 10: Add safe opt-in installed-provider discovery

**Files:**
- Create: `packages/adapter-api/src/discovery.ts`, `packages/adapter-api/test/discovery.test.ts`
- Modify: `packages/adapter-api/src/index.ts`

**Interfaces:** Produces `discoverExecutorProviders(options: ExecutorProviderDiscoveryOptions): Promise<ExecutorProviderDiscoveryResult>`.

- [ ] **Step 1: Write allowlist-before-load RED test**

```ts
it('does not load a candidate outside host allowlist', async () => {
  const load = vi.fn(); const result = await discoverExecutorProviders({ allowlist: ['@acme/known'], candidates: ['@attacker/arbitrary'], load, registry })
  expect(load).not.toHaveBeenCalled(); expect(result.rejected[0]).toMatchObject({ packageName: '@attacker/arbitrary', reason: 'not-allowlisted' })
})
it('rejects incompatible manifest before registry mutation', async () => { /* loader returns contractVersion: 2; registry stays empty */ })
```

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @brambodev/adapter-api test -- discovery.test.ts`

Expected: FAIL because resolver is absent.

- [ ] **Step 3: Implement host-owned resolver**

```ts
export interface ExecutorProviderDiscoveryOptions { readonly allowlist: readonly string[]; readonly candidates: readonly string[]; readonly load: (packageName: string) => Promise<unknown>; readonly registry: ExecutorRegistry }
export async function discoverExecutorProviders(options: ExecutorProviderDiscoveryOptions): Promise<ExecutorProviderDiscoveryResult> { /* allowlist, load, schema/version validation, then registry.register */ }
```

Never parse configuration, install packages, fetch registries, resolve globs, or load an unallowlisted candidate. Return ordered acceptance/rejection diagnostics and refuse duplicate IDs, preserving explicit registration precedence.

- [ ] **Step 4: Test compatible discovery and commit**

```ts
it('registers an allowlisted compatible provider in candidate order', async () => { /* valid provider appears in registry and accepted diagnostic */ })
```

Run: `pnpm --filter @brambodev/adapter-api test -- discovery.test.ts && pnpm --filter @brambodev/adapter-api lint`

```bash
git add packages/adapter-api/src/discovery.ts packages/adapter-api/src/index.ts packages/adapter-api/test/discovery.test.ts
git commit -m "feat(adapter-api): add allowlisted provider discovery"
```

### Task 11: Integrate registered API profiles into environment and CLI

**Files:**
- Create: `packages/environment/src/api-executors.ts`, `packages/environment/test/api-executors.test.ts`
- Modify: `packages/environment/src/index.ts`, `packages/cli/src/run.ts`
- Create or Modify: `packages/cli/test/run.test.ts`

**Interfaces:** Consumes `ExecutorRegistry`, `ExecutorSelection`. Produces `selectRegisteredApiExecutor(selection, registry, options): ExecutorAdapter` and CLI diagnostics for registered API profiles.

- [ ] **Step 1: Write no-secret selection RED tests**

```ts
it('selects registered OpenAI by provider ID and model', () => { expect(selectRegisteredApiExecutor({ providerId: 'openai', model: 'gpt-test' }, registry, createOptions)).toBeDefined() })
it('rejects credential and module fields in persisted profile', () => {
  expect(() => validateApiExecutorProfile({ providerId: 'openai', model: 'gpt-test', apiKey: 'secret' })).toThrow(/credential/)
  expect(() => validateApiExecutorProfile({ providerId: '@evil/module', model: 'x' })).toThrow(/providerId/)
})
```

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @brambodev/environment test -- api-executors.test.ts && pnpm --filter @brambodev/cli test -- run.test.ts`

Expected: FAIL because API profile selection is absent.

- [ ] **Step 3: Implement SDK-first selection**

```ts
export function selectRegisteredApiExecutor(selection: ExecutorSelection, registry: ExecutorRegistry, options: ExecutorProviderCreateOptions): ExecutorAdapter { return registry.create(selection, options) }
```

Environment validates only provider ID/model/capabilities and reports unregistered/unconfigured paths. It neither scans environment variables nor registers packages.

- [ ] **Step 4: Add CLI opt-in diagnostics**

```text
brambo run --executor-profile api:openai --model gpt-5
```

Wire only to a bootstrap that already registers OpenAI. For an unregistered profile, return structured JSON/human diagnostic with registration guidance; do not dynamically import. Test that output omits API keys.

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @brambodev/environment test -- api-executors.test.ts && pnpm --filter @brambodev/cli test -- run.test.ts && pnpm --filter @brambodev/environment typecheck && pnpm --filter @brambodev/cli typecheck`

```bash
git add packages/environment/src/api-executors.ts packages/environment/src/index.ts packages/environment/test/api-executors.test.ts packages/cli/src/run.ts packages/cli/test/run.test.ts
git commit -m "feat(cli): select registered API executor profiles"
```

### Task 12: Add live evidence, documentation, package metadata, and final verification

**Files:**
- Create: `packages/adapter-openai/test/openai-live.test.ts`, `packages/adapter-anthropic/test/anthropic-live.test.ts`, `scripts/run-api-adapter-live-tests.mjs`
- Keep the bounded local `pnpm test:api-live` harness; do not add a GitHub-hosted live workflow.
- Modify: `.github/workflows/ci.yml`, `typedoc.json`, `README.md`, `docs-site/sidebars.ts`
- Create: `docs-site/docs/guides/api-executors.md`, `openai-api-adapter.md`, `anthropic-api-adapter.md`, `third-party-executor-providers.md`, `docs-site/docs/explanation/api-adapter-security.md`
- Create: `.changeset/api-adapter-core.md`, `.changeset/api-adapter-openai.md`, `.changeset/api-adapter-anthropic.md`
- Create: `docs/superpowers/reports/2026-09-24-api-adapters-verification.md`

**Interfaces:** Consumes all final public exports. Produces credible deterministic and authorized-live release evidence, consumable SDK docs, migration instructions, and version metadata.

- [ ] **Step 1: Write guarded live tests**

```ts
const liveIt = process.env.BRAMBO_RUN_LIVE_API_TESTS === '1' && process.env.OPENAI_API_KEY ? it : it.skip
liveIt('runs one bounded OpenAI tool turn and cleans owned resources', async () => { /* one harmless local tool, asserted request cap and cleanup */ })
```

Mirror for `ANTHROPIC_API_KEY`. Require explicit model/configuration and request cap. Ordinary package test scripts exclude these files and need no secrets.

- [ ] **Step 2: Build guarded local live runner**

```js
if (process.env.BRAMBO_RUN_LIVE_API_TESTS !== '1') throw new Error('live API tests require BRAMBO_RUN_LIVE_API_TESTS=1')
if (Number(process.env.BRAMBO_LIVE_API_MAX_REQUESTS ?? '0') < 1) throw new Error('set BRAMBO_LIVE_API_MAX_REQUESTS')
```

Run providers serially with deadline/request limits. Require explicit local operator opt-in and temporary credentials; output only redacted request IDs/status and cleanup results. Keep GitHub Actions and normal CI deterministic and credential-free.

- [ ] **Step 3: Make docs examples executable before publishing prose**

```ts
const registry = createExecutorRegistry()
registry.register(createOpenAIProvider({ credential: fromSecretManager(secrets, 'openai') }))
const adapter = registry.create({ providerId: 'openai', model: 'gpt-5', capabilities: ['local-tools'] }, toolEnabledOptions)
```

Add snippets to the existing docs example validation path. Include a negative example showing a provider ID is not a module specifier.

- [ ] **Step 4: Write guides and API metadata**

Document registration, injected credentials, streaming, OpenAI/Anthropic setup, local tool approval/policy, hosted feature enablement/ownership, cancellation/errors, third-party manifest/conformance authoring, discovery restrictions, CLI migration, and excluded products. Update TypeDoc entry points, README package map, and Docusaurus sidebar. Link official provider docs verified at publication time.

- [ ] **Step 5: Run deterministic release verification**

Run: `pnpm check && pnpm build && pnpm proof:consumer-install && pnpm docs:check`

Expected: PASS without API credentials.

- [ ] **Step 6: Run authorized live evidence once per configured provider**

Run: follow the temporary-environment PowerShell procedure in `docs-site/docs/explanation/api-adapter-security.md`, which sets both provider keys and models, `BRAMBO_RUN_LIVE_API_TESTS=1`, a 2–4 request cap, and a 1000–60000 ms timeout before invoking `pnpm test:api-live`.

Expected: bounded, redacted OpenAI/Anthropic result and cleanup evidence. Do not run without explicit authorization and disposable credentials; never persist secrets.

- [ ] **Step 7: Record observed evidence and commit**

```md
# API Adapter Verification Report
## Deterministic checks
- Record each executed command verbatim with its observed pass/fail result.
## Live checks
- Record either the redacted OpenAI result or the exact statement that live execution was not authorized.
- Record either the redacted Anthropic result or the exact statement that live execution was not authorized.
## Known limits
- List only a limit demonstrated by the executed checks or provider documentation.
```

Populate report fields only from executed commands; do not claim live success when unavailable. Add Changesets for every newly publishable package and public contract version change.

```bash
git add packages/adapter-openai/test/openai-live.test.ts packages/adapter-anthropic/test/anthropic-live.test.ts scripts/run-api-adapter-live-tests.mjs .github/workflows docs-site README.md typedoc.json .changeset docs/superpowers/reports/2026-09-24-api-adapters-verification.md
git commit -m "docs: publish API adapter integration guides"
```

## Plan self-review

### Spec coverage

| Spec requirement | Tasks |
|---|---|
| Transport-neutral contracts and compatibility | 1–2 |
| Explicit registry/manifest/third-party extension | 2–3, 7, 10 |
| Abort, retry, streams, usage, errors, redaction | 3–4, 8–9 |
| Local multi-step tools with policy and approval | 5, 8–9 |
| Hosted capabilities, egress, retention, ownership | 6, 8–9 |
| Official OpenAI adapter | 8, 12 |
| Official Anthropic adapter | 9, 12 |
| Secure discovery | 10 |
| Environment/CLI integration | 11 |
| Conformance, CI, packages, docs, release evidence | 7, 12 |

All approved-spec responsibilities have an owning task.

### Type consistency

Task 2 defines provider contracts; Task 3 defines `ExecutorRegistry` and retry; Task 4 defines safe observation helpers; Task 5 defines `runLocalToolLoop`; Task 6 defines capability/ownership APIs; Task 7 defines conformance; Tasks 8–9 consume exactly these names. Tasks 10–11 consume `ExecutorRegistry` without altering its registration semantics.

### Review-focus mapping

- Abort tool race: Task 5 cancellation test.
- Duplicate call ID: Task 5 duplicate-ID test.
- Accepted request retry: Task 3 retry test.
- Error/header secret leak: Task 4 redaction test.
- Arbitrary discovery code load: Task 10 allowlist-before-load test.

### Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-24-api-adapters.md`. Please review the plan. Does it capture what you want?
