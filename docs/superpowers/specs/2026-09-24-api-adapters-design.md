# API Executor Architecture: Common Core, Official Providers, and Third-Party Extensions

**Status:** Approved architecture

## Decision

Brambo will add a transport-neutral API executor foundation, `@brambodev/adapter-api`, plus two official provider packages:

- `@brambodev/adapter-openai`
- `@brambodev/adapter-anthropic`

The release target is a **complete coding-agent integration**, rather than a chat-only adapter: provider request execution, streaming, cancellation, normalized telemetry, a host-authorized multi-step local tool loop, and provider-specific capabilities that are relevant to coding-agent work. OpenAI and Anthropic are reference implementations of a public third-party provider contract.

Third parties distribute adapters as ordinary npm packages and are registered explicitly by the host. Configuration may select only a previously registered provider. Secure discovery of installed, allowlisted providers is an optional SDK extension point; configuration must never name an arbitrary module for import.

## Quick path for a host

```ts
import { createOpenAIProvider } from '@brambodev/adapter-openai'
import { createAnthropicProvider } from '@brambodev/adapter-anthropic'

const executors = createExecutorRegistry()
executors.register(createOpenAIProvider({ credential: openAIKey }))
executors.register(createAnthropicProvider({ credential: anthropicKey }))

const adapter = executors.create({ providerId: 'openai', model: 'gpt-5' })
await runSession({ prompt, workspaceProvider, createAdapter: () => adapter, toolComposition })
```

The host owns credential acquisition, provider registration, tool execution composition, and policy decisions. Brambo owns contract validation, lifecycle integration, request normalization, and correct propagation of the host's decisions.

---

## 1. Scope

### Goals

1. Support OpenAI and Anthropic APIs as official coding-agent executors.
2. Preserve the existing `ExecutorAdapter` boundary so sessions are independent of CLI versus API transport.
3. Make local tool calling complete, iterative, auditable, cancellable, and subject to Brambo policy and approval.
4. Publish stable contracts and conformance tests so third parties can implement providers without central-team changes.
5. Normalize transport concerns without pretending provider-specific semantics are interchangeable.
6. Keep all provider state, credentials, remote resources, and optional network capabilities under explicit ownership and policy.

### Non-goals

- A hosted multi-provider gateway, automatic model routing, provider billing, organization administration, API-key management, or user management.
- Treating API adapters as CLI adapters or extending `@brambodev/adapter-cli` with HTTP behavior.
- Automatically enabling hosted tools, remote MCP, web search, file stores, background jobs, computer use, or provider code execution.
- Dynamic installation or arbitrary import of provider code from JSON/YAML/configuration.
- Claiming identical behavior across OpenAI, Anthropic, and future vendors where their APIs differ.

### Boundary of “complete”

“Complete” means every capability currently offered by a provider that is relevant to an interactive coding-agent executor is either: (a) implemented and tested, (b) exposed as an explicit disabled-by-default capability with a concrete policy/ownership path, or (c) named as out of scope because it is a different product boundary. It does not mean implementing unrelated provider administration or media products.

---

## 2. Evidence and assumptions

### Confirmed by current Brambo source

| Fact | Evidence |
|---|---|
| The common executor port is `ExecutorAdapter.run(RunRequest): Promise<ResultEnvelope>`. | `packages/contracts/src/executor.ts` |
| `RunRequest` has an abstract workspace handle and optional `AbortSignal`; it is not inherently process based. | `packages/contracts/src/executor.ts` |
| `runSession()` reaches an executor through a kernel service/pipeline and forwards an abort signal. | `packages/session/src/run-session.ts` |
| Local tools are deliberately separate from `runSession()` and pass through `executeTool()`, optional `PermissionAuthorizer`, approval hook, policy, and `ToolExecutor`. | `packages/session/src/run-session.ts` |
| The current environment's shipped executor catalogue contains only `claude-code`, `codex`, and `opencode`. | `packages/environment/src/executors.ts` |
| Existing CLI adapter behavior is process/stream specific, so HTTP support does not belong in `adapter-cli`. | `packages/adapter-cli/src/traits.ts`, `packages/adapter-cli/src/node-child-spawner.ts` |

### Confirmed by provider documentation

- OpenAI function calling is an application-controlled loop: the application receives function calls and submits their outputs in a subsequent model request. [OpenAI function calling](https://platform.openai.com/docs/guides/function-calling).
- OpenAI exposes built-in tools and remote MCP in addition to application functions; use is provider- and configuration-dependent. [OpenAI tools](https://platform.openai.com/docs/guides/tools).
- Anthropic Messages tool use likewise requires the client to send `tool_result` content after `tool_use`. [Anthropic tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use).
- Anthropic streaming has structured events and requires incremental event handling rather than stdout parsing. [Anthropic streaming](https://platform.claude.com/docs/en/api/messages-streaming).
- Comparable SDK ecosystems commonly distribute community providers as installed packages and rely on explicit provider registration/composition. [Vercel AI SDK custom providers](https://ai-sdk.dev/providers/community-providers/custom-providers).

### Inferences

- A provider contract must include capabilities and protocol versions because the current `ExecutorAdapter` is deliberately minimal and cannot truthfully express hosted-tool, streaming, or resource-lifecycle behavior alone.
- `runSession()` must receive an API-capable adapter through the existing adapter seam initially; making API providers selectable by environment/CLI is a separate integration task after registry behavior is safe.

### Not yet determined

- Exact first supported model IDs and defaults; they must be chosen from current provider documentation immediately before implementation.
- Whether official packages use provider SDKs, fetch-based clients, or an injectable transport. The contract permits either; dependency/license/tree-shaking evidence should decide.
- Exact mapping of provider token categories to Brambo settlement/cost accounting. Raw provider usage must be retained even if no cross-provider price calculation is supplied.

---

## 3. Architecture

```text
                         Host application
  credentials · registry · policy · approval · workspace · telemetry sink
                                 │
                                 ▼
                       ExecutorRegistry (host-owned)
                explicit register / validate / resolve / diagnostics
                    │                         │
      ┌─────────────┘                         └──────────────┐
      ▼                                                        ▼
@brambodev/adapter-openai                         @brambodev/adapter-anthropic
provider protocol mapping                          provider protocol mapping
      │                                                        │
      └──────────────────────┬─────────────────────────────────┘
                             ▼
                  @brambodev/adapter-api
 abort · deadlines · retry classification · event normalization
 usage/error metadata · local tool-loop orchestration · ownership helpers
                             │
                             ▼
         ExecutorAdapter / ResultEnvelope / ActionPipeline / runSession
                             │
                             ▼
  executeTool() → policy → PermissionAuthorizer → approval → ToolExecutor
```

### Dependency rule

```text
contracts ← adapter-api ← adapter-openai
                       └← adapter-anthropic
kernel/session ← adapters through ExecutorAdapter only
```

- `kernel`, `session`, and `contracts` must not import official provider SDKs.
- `adapter-api` must not select a provider or read environment variables by itself.
- Official providers may depend on `adapter-api` and `contracts`, never on each other.
- The environment/CLI integration may depend on provider manifests, but manifests must not make the core kernel scan `node_modules`.

### Runtime flow: a local tool turn

```text
prompt + workspace + AbortSignal
  → API adapter builds provider request
  → provider stream/result indicates one or more tool calls
  → adapter validates provider call against declared Brambo tool schema
  → executeTool() validates invocation/context/policy
  → PermissionAuthorizer and host approval decide
  → ToolExecutor produces normalized ToolResult
  → adapter encodes provider-specific tool_result/function output
  → next provider request (same bounded turn)
  → final provider response
  → ResultEnvelope + provider observations + audit correlation
```

No provider adapter may execute a local tool callback directly, silently approve it, or turn a provider tool request into an unrestricted process invocation.

---

## 4. Public contracts

### Preserve the stable execution port

`ExecutorAdapter` remains the session-facing port. API support must not change the requirement that every adapter returns a valid `ResultEnvelope` with meaningful failure/cancellation errors.

### Add provider-oriented contracts

The names below are normative design targets; final TypeScript shapes may evolve only through normal public API review.

```ts
interface ExecutorManifest {
  readonly id: string                 // stable, namespaced, e.g. "openai"
  readonly displayName: string
  readonly contractVersion: string
  readonly packageName: string
  readonly capabilities: readonly ExecutorCapability[]
  readonly configurationSchema: StandardSchemaV1<unknown>
}

interface ExecutorProvider {
  readonly manifest: ExecutorManifest
  create(options: ExecutorProviderCreateOptions): ExecutorAdapter
}

interface ExecutorRegistry {
  register(provider: ExecutorProvider): void
  resolve(id: string): ExecutorProvider
  create(selection: ExecutorSelection): ExecutorAdapter
  list(): readonly ExecutorManifest[]
}
```

`ExecutorProviderCreateOptions` must carry an already-resolved credential source, a selected model/configuration, optional transport/clock hooks for tests, and host-bound tool-loop composition. It must not accept a bare `process.env` accessor as its required credential mechanism.

### Capability model

Capabilities describe behavior; they are not automatic permission grants. Examples:

```text
streaming | local-tools | remote-mcp | hosted-web-search | provider-files
conversation-state | prompt-caching | extended-thinking | background-jobs
```

A requested capability is enabled only when all are true:

1. the provider manifest advertises it;
2. the host selects it;
3. required Brambo policy/capabilities permit it;
4. required ownership/cleanup behavior is configured;
5. the provider-specific configuration validates.

### Third-party conformance

Publish `@brambodev/adapter-api/testing` with black-box contract cases. A third-party provider must prove, at minimum:

- manifest schema/version/ID validity and duplicate-ID rejection;
- valid `ResultEnvelope` status invariants;
- cancellation propagation;
- no retry after abort;
- normalized failure classification without secret leakage;
- local tool schema translation, ordering, correlation, denial, malformed arguments, and maximum-step enforcement;
- correct cleanup/ownership behavior for every enabled remote resource capability.

---

## 5. Registration and safe discovery

### Canonical path: explicit npm package + host registration

```ts
import { createPiProvider } from '@acme/brambo-adapter-pi'
registry.register(createPiProvider({ credential }))
```

This is deterministic, works with lockfiles/bundlers/serverless deployments, makes the dependency visible to review, and allows the host to inject credentials and policies deliberately.

Configuration may select only a provider already registered by ID:

```json
{ "executor": { "providerId": "openai", "model": "gpt-5" } }
```

Configuration cannot contain a module specifier, executable path, arbitrary endpoint, or credential. Provider configuration schemas may permit an endpoint only when the provider package defines it and the host policy permits network egress.

### Optional discovery port

A future host-owned `ExecutorProviderResolver` may discover installed providers. It is **not** part of the kernel lifecycle and is disabled by default.

Requirements:

- enumerate only host-provided candidate package names or an allowlist;
- load a versioned `brambo.executor` manifest;
- verify package identity, contract compatibility, unique provider ID, and manifest schema before registration;
- emit diagnostics/audit events for every candidate, acceptance, or rejection;
- never install packages, consult registries, or import a specifier supplied by runtime config;
- preserve explicit registration precedence over discovered registration.

This allows useful SDK integration while preventing the security anti-pattern:

```text
untrusted config → arbitrary dynamic import → code execution
```

---

## 6. Local tool loop and authorization

### Invariant

Every local tool request from OpenAI, Anthropic, or a third-party API adapter follows the existing Brambo boundary:

```text
provider request → normalized ToolInvocation → executeTool()
→ policy/capability validation → PermissionAuthorizer → host approval → ToolExecutor
```

The adapter passes a correlation context containing provider request/response IDs, session ID, turn ID, workspace ID, provider tool-call ID, and attempt/step number. It must redact arguments/results before any generic log sink unless the host expressly supplies a secure, scoped audit sink.

### Required loop controls

- Maximum tool-loop steps, maximum concurrent calls, and optional per-tool/per-turn budget.
- Strict call/result correlation; duplicate or unknown call IDs fail closed.
- Provider arguments must validate against the Brambo-declared JSON schema before approval.
- Denial, timeout, cancellation, tool exception, and malformed arguments become provider-valid tool-result responses when the provider protocol permits recovery; otherwise the adapter terminates with a typed failed/cancelled envelope.
- Abort cancels pending provider requests and prevents new tool dispatch. In-flight tools must receive the same abort signal where their contract supports it.
- Parallel tool calls are only dispatched if the provider requests them, the declared tool is concurrency-safe, and host policy permits it; output order follows provider call IDs.
- The adapter must not retry non-idempotent tool calls. Transport retries occur only before a tool dispatch or when provider semantics prove the request did not execute.

### Hosted and remote tools

Provider-hosted web search, remote MCP, files, and similar capabilities never pass through `executeTool()` because they execute outside the local host. They need separate capability flags, egress/data-retention policy, provider configuration, telemetry, and ownership rules. They must be off by default.

---

## 7. Provider capability matrix

| Capability | OpenAI official adapter | Anthropic official adapter | Release policy |
|---|---|---|---|
| Basic coding prompt/result | Core | Core | Required |
| System/developer instructions | Core where provider supports them | Core where provider supports them | Required |
| Streaming events | Core | Core | Required |
| Abort/deadline/cancellation | Core | Core | Required |
| Usage, request IDs, rate-limit metadata | Core | Core | Required when returned |
| Local function/tool loop | Core | Core | Required |
| Multi-step tool calls and tool errors | Core | Core | Required |
| Model/provider options schema | Core | Core | Required |
| Conversation continuation | Optional | Optional | Explicit capability + ownership |
| Prompt caching | Optional | Optional | Preserve provider semantics/observations; no false normalization |
| Extended reasoning/thinking | Optional | Optional | Explicit capability; retain provider metadata safely |
| Files/images/documents for coding tasks | Optional | Optional | Explicit upload/read/delete ownership |
| Remote MCP | Optional | Optional | Explicit egress/trust policy, disabled by default |
| Hosted web search/fetch | Optional | Optional | Explicit egress/cost/data policy, disabled by default |
| Hosted code execution/computer use | Out of scope | Out of scope | Separate runtime/sandbox product |
| Background/batch work | Out of scope | Out of scope | Separate async-job lifecycle |
| Billing/admin/org/key management | Out of scope | Out of scope | Not executor responsibilities |

The matrix must be reviewed against the current provider references before each implementation milestone. “Optional” means supported by a concrete, tested capability implementation or explicitly unavailable with a precise diagnostic; it must not silently degrade.

---

## 8. Transport, credentials, retries, streaming, usage, and errors

### Credentials and secrets

- Credential resolution is injected by the host, such as a callback, secret manager adapter, or provider SDK credential object.
- Official adapters may offer convenience constructors for environment variables, but only as opt-in helpers; neither package reads secrets implicitly during import or registry inspection.
- Credentials, authorization headers, raw prompts, tool arguments, and provider response bodies are never emitted to generic logs/errors.
- API endpoints, proxies, and custom headers are provider-scoped configuration and require validation plus host network policy approval.

### Deadlines, cancellation, and retry

`AbortSignal` is end-to-end authoritative. `adapter-api` supplies a single retry engine with provider-specific error classification, exponential backoff with jitter, deadline accounting, and observable retry events.

Retry candidates are limited to failures that occur before a potentially side-effecting request is accepted, or to protocol-safe idempotent requests using provider-supported idempotency semantics. Never retry after abort. Never retry a local tool invocation from transport policy.

### Streaming

Each provider maps its native SSE/SDK events into an adapter-api event stream for host observation. The final `ResultEnvelope` remains the authoritative session result. Stream events must carry sequence/correlation data, distinguish partial content from terminal status, and be bounded to avoid unbounded in-memory accumulation.

### Usage and cost

Raw provider usage is preserved with its source, category names, model, request ID, and observation time. Brambo must not fabricate token counts, rates, cost, or reset windows. The existing session action pipeline can settle an execution using provider-reported observations only when the accounting contract explicitly supports that representation.

### Error normalization

The API core defines a typed normalized error taxonomy, including invalid request, authentication, authorization, quota/rate limit, timeout, unavailable/transient, protocol/schema violation, tool failure, cancelled, and unknown provider failure. Provider status/code/body details are attached as safe metadata after redaction. User-facing `ResultEnvelope.errors` remain non-empty on failure/cancellation, per the existing contracts.

---

## 9. State and ownership

| Resource | Owner by default | Required cleanup rule |
|---|---|---|
| API credential | Host | Adapter may read/use; never persist or dispose it. |
| Workspace lease | Existing `runSession()` owner | API adapters receive only abstract handle; never delete it. |
| Local tool process/resource | Host `ToolExecutor` | `executeTool()` and sandbox provider contracts govern cleanup. |
| HTTP request/stream | Adapter run | Abort/close on terminal result, timeout, failure, or session cleanup. |
| Provider conversation | Host unless explicitly created by adapter | Persist/delete only through explicit capability and ownership record. |
| Uploaded provider file/resource | Explicit resource owner | Record provider ID/resource ID; delete only when Brambo created and owns it. |
| Remote MCP connection | Explicit capability owner | Close/revoke according to provider protocol; do not assume local cleanup is sufficient. |

Remote state is never silently created as a side effect of basic prompt execution unless the provider API itself mandates it and the adapter reports its identity/retention semantics.

---

## 10. Threat model

| Threat | Control |
|---|---|
| Arbitrary package execution through config | Explicit registration; optional discovery allowlist; no config-driven import/install. |
| Model-triggered local command/file/network access | All local calls traverse `executeTool()`, sandbox policy, authorizer, and approval. |
| Hosted tool data egress | Disabled-by-default capability plus egress/trust/data-retention policy. |
| Credential exposure | Injected secret source; redaction; no implicit import-time environment reads. |
| Duplicate side effects from retry | Deadline/idempotency classification; no tool retries. |
| Tool call confusion/replay | Strict provider call ID correlation and bounded step ledger. |
| Unbounded cost or loop | Action pipeline settlement, host budgets, max tool steps/calls, capability-specific budgets. |
| Provider protocol drift | Versioned manifests, fixtures, contract suite, live opt-in checks, safe unsupported-capability failures. |
| Dangling remote resources | Explicit ownership records and idempotent cleanup. |

This design does not make a provider API, a workspace, or an approval callback a sandbox. OS/process containment remains the responsibility of Brambo sandbox composition and the host's `ToolExecutor`.

---

## 11. Testing, conformance, and release acceptance

### Test layers

1. **Pure unit tests:** request mapping, response/event decoding, schema validation, error classification, redaction, retry eligibility, tool-call correlation.
2. **Adapter API contract tests:** cancel, timeout, stream termination, final envelope invariants, bounded loop, denial/error propagation, ownership cleanup.
3. **Provider fixtures:** recorded/redacted OpenAI and Anthropic success, stream, tool call, parallel call, invalid arguments, rate limit, auth, network failure, malformed payload, and cancelled cases.
4. **Local integration tests:** a fake HTTP/SSE provider plus real Brambo `executeTool()` composition and authorizer/policy behavior.
5. **Live opt-in tests:** isolated credentials, a bounded model/cost budget, explicit environment gate, resource cleanup assertions, and no default CI secret requirement.
6. **Third-party conformance package:** reusable tests run by official and external adapters.
7. **Consumer/package proof:** packed tarballs install into a clean consumer and execute fake-provider contract paths; no source-condition-only green result.

### Release acceptance checklist

- [ ] Two official packages are publishable, documented, and versioned independently of CLI adapters.
- [ ] OpenAI and Anthropic both pass the shared provider conformance suite.
- [ ] Each implements stream and non-stream execution, final-envelope validation, abort, deadline, retry classification, safe error metadata, request ID, and usage handling.
- [ ] Each executes a multi-step local tool loop through `executeTool()`, policy, authorizer, and approval; tests prove no bypass.
- [ ] Each supports declared optional capabilities with explicit disabled/default behavior, or reports an exact unsupported/unconfigured diagnostic.
- [ ] Provider-specific models/options are validated by public schemas and documented.
- [ ] No secret appears in logs, errors, fixture recordings, or package metadata.
- [ ] Documentation includes host setup, credential injection, local tools, policy, streaming observation, remote capability risks, and third-party provider authoring.
- [ ] CI runs deterministic tests without provider credentials; explicitly authorized manual local live tests prove both official paths using capped budgets.

---

## 12. Migration and compatibility

- Existing CLI executor IDs and `@brambodev/adapter-cli` behavior remain unchanged.
- `ExecutorAdapter` remains source-compatible. New provider-aware contracts are additive.
- API providers first enter `runSession()` through the existing adapter factory; this avoids making the current environment's closed CLI catalogue falsely claim API support.
- A later environment/CLI task may register official API providers intentionally, with credential-source selection and diagnostics. It must not infer credentials or change an existing CLI executor selection.
- Provider manifests use semver-compatible `contractVersion`; incompatible packages fail registration with an actionable diagnostic.
- The adapter API package must not force provider SDK dependencies onto applications that use only CLI adapters.

---

## 13. Implementation work breakdown

Implementation must be executed in independently testable work units, in this order:

1. **Contracts:** add provider manifest, registry, capabilities, normalized API observations/errors, and public schemas without changing existing executor behavior.
2. **API core:** add injected transport, timeout/abort/retry, stream normalization, redaction, request correlation, raw usage observation, and test harness.
3. **Tool-loop bridge:** define provider-neutral tool declarations/events and call the existing `executeTool()` boundary; add strict loop/control tests.
4. **Registry integration:** implement host-owned explicit registry and diagnostics; add duplicate/version/config validation tests.
5. **OpenAI adapter:** map supported OpenAI coding-agent APIs, streaming, local tools, metadata, and optional capabilities; satisfy conformance and live tests.
6. **Anthropic adapter:** map Messages streaming/tool use, metadata, and optional capabilities; satisfy the same suite and live tests.
7. **Third-party authoring:** publish templates, manifest contract, conformance runner, and an example external adapter package/fixture.
8. **Secure discovery:** only after explicit registry is proven; implement optional resolver/allowlist/diagnostics and threat tests.
9. **Environment/CLI integration:** only where a credential-safe selection UX is designed; it is not required for SDK usability.
10. **Documentation/release:** API guides, capability matrix, security guide, migration guide, package/consumer proof, and release checklist.

Each work unit should be a separate reviewable task/commit, run focused tests, and retain evidence before starting the next one.

---

## 14. Decisions intentionally left open

These are the minimum unresolved decisions that require current implementation evidence, not speculative design:

1. **HTTP implementation:** official provider SDK versus a fetch-based adapter transport, based on current SDK compatibility, bundle impact, and streaming/test seams.
2. **Model defaults:** exact model IDs and whether providers ship a default at all. Prefer requiring an explicit model unless current provider guidance establishes a stable coding-agent default.
3. **Provider remote resource retention:** exact defaults and cleanup API behavior for OpenAI/Anthropic files, conversations, and MCP sessions must be verified before enabling each optional capability.
4. **Environment/CLI credential UX:** opt-in profiles/configuration references versus SDK-only initial selection; no credentials in persisted Brambo config.

These decisions do not block the public contract and core/tool-loop work; they block only the corresponding provider capability activation.

## Review checklist

- [x] Kernel remains vendor-neutral.
- [x] CLI and API transports are separate adapters behind the same port.
- [x] Local tool calls cannot bypass Brambo approval/policy.
- [x] Third-party extension is deterministic and safe by default.
- [x] Optional hosted capabilities have explicit permission and ownership semantics.
- [x] No provider-specific claim is presented as cross-provider fact.
- [x] Acceptance criteria define functional completion without promising unrelated provider products.
