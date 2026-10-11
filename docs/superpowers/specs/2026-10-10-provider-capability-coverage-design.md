# Provider capability coverage design

**Status:** written design for human review; not an implemented API or an implementation plan.

## Decision

Brambo should expose useful model controls through a small provider-agnostic configuration boundary, typed provider-owned schemas, and controlled plugin extensions. It should not promise every vendor feature or pretend that every model supports the same settings.

The user approved this direction and subsequent strict-TDD implementation. Approval of this written spec is still required before creating an implementation plan; that plan must be reviewed and an execution method selected before source changes.

Success means that a caller can discover, configure and validate supported controls, including reasoning where available, through both direct adapters and durable workflows without acquiring additional execution privileges.

## Current coverage: source evidence, not a live qualification

Baseline: worktree commit `82fc17fee9877fb27b4f2b35d764070354a948be`, branch `codex/provider-agnostic-orchestration`. Local `origin/main` inspected during the preceding mapping was `5afe8db5c6146bf5df91bde98538d990127d374f`; it is a tracking-ref snapshot, not a remote freshness guarantee.

In the table, **exposed** means a current Brambo option/schema; **forwarded** means an observable request/argv mapping; **validation** describes current local checks, not vendor acceptance. No provider calls or native CLI execution were performed for this matrix.

| Executor | Exposed today | Forwarded today | Validation today | Concrete gaps |
|---|---|---|---|---|
| OpenAI API | Selection model; configuration instructions, stream, maxOutputTokens, temperature, previousResponseId, reasoningEffort. Effort values: none, minimal, low, medium, high, xhigh. Host options separately configure tools/capabilities. | Responses body maps reasoningEffort to reasoning.effort; model, token cap, temperature and selected capability fields. | Strict known-key schema, enum/range checks, capability selection and host policy. No model-specific support check. | Configuration/effort types are not public exports. No native configuration fields for output format/verbosity, topP, toolChoice, reasoning summary or service tier; availability requires vendor/model evidence before additions. |
| Anthropic API | Selection model; system, stream, maxTokens, temperature. Host capability options expose adaptive/enabled thinking, enabled budget, prompt caching, files, MCP and search. | Messages body maps thinking, max_tokens and temperature alongside policy-authorized capability fields. | Strict configuration keys, temperature range, thinking budget minimum and budget below maxTokens; selected capability plus host grant required. No model-specific support check. | Native effort is not exposed in selection configuration. Thinking mode/budget are not interchangeable with OpenAI effort. No native topP/toolChoice/structured-output configuration fields in the current schema. |
| Codex CLI | Factory options and trusted-host raw extraArgs; copied public traits can define root/subcommand arguments. | Default argv: exec --json --skip-git-repo-check, then extraArgs; stdin prompt. | Run envelope and output parser; no typed model/reasoning option schema or native CLI version validation. | Typed model/reasoning mapping and root-versus-exec argument placement are absent. Generic extraArgs are not a safe task-config interface. |
| Claude Code CLI | Factory options and trusted-host raw extraArgs. | Default print/stream-json/verbose/no-session-persistence arguments plus dangerously-skip-permissions; stdin prompt. | Run envelope/output parser; no typed model/effort/max-turn option schema. | Typed native controls absent. Existing permission-bypass default must be disclosed, not described as sandboxed or silently expanded by configuration. |
| OpenCode CLI | Factory options and trusted-host raw extraArgs. | Default argv: run --format json; argument prompt after separator. | Run envelope/output parser; no typed model/variant option schema. | Typed model/native reasoning mapping and version/model support validation absent. |
| Arbitrary custom driver/API adapter | DriverManifest.configurationSchema, string capability IDs and DriverFactory.create(configuration, services); generic API wrapper's createAdapter(configuration, services). | Validated driver configuration reaches the custom factory. A custom adapter owns its native request mapping. | Caller-supplied Standard Schema plus durable JSON validation. No universal vendor/model validation. | No automatic forwarding of fields unsupported by built-in adapters. Discovery and per-run override contracts need additive extension; custom implementation remains responsible for native semantics. |

### Evidence locators

- OpenAI: `packages/adapter-openai/src/openai-provider.ts:45–74,217–226,352–359`; `openai-capabilities.ts:15–24,41–53,74`. Public exports: `packages/adapter-openai/src/index.ts`.
- Anthropic: `packages/adapter-anthropic/src/anthropic-provider.ts:43–59,151–159,201–205,269`; `anthropic-capabilities.ts:14–21,40–58,86`.
- CLI factories: `packages/adapter-cli/src/executors/codex.ts:71–92`, `claude-code.ts:88–110`, `opencode.ts:57–77`; shared argv assembly: `packages/adapter-cli/src/traits.ts:141–174,419–422`.
- Driver extension seam: `packages/contracts/src/execution-driver.ts:11–37`; `packages/adapter-api/src/api-driver.ts:7–10,44–47`; `packages/orchestration/src/driver-registry.ts:26–36,50–52`.
- Durable propagation: `packages/orchestration/src/workflow-registry.ts:4–38`; `packages/workflow-coordinator/src/worker.ts:277–283`; `packages/runtime-local/src/runtime.ts:191`.
- Missing direct per-run options: `packages/contracts/src/executor.ts:38–45`. Current provider selection: `packages/contracts/src/executor-provider.ts:18–21,71`.
- CLI workflow configuration presently accepts only an empty object and constructs an injected zero-argument adapter: `packages/orchestration/src/cli-drivers.ts:5–19,31–50`.
- Existing environment profiles configure executor detection/projection, not model settings: `packages/environment/src/executors.ts:93–124`. Session selection is executorId/layer/available: `packages/session/src/executors.ts:94–109`; CLI plugin executor selection is a string: `packages/adapter-cli/src/plugin.ts:119–134`.

## Architecture and ownership

### Minimal common contract

Introduce an additive, data-only execution-configuration envelope with executor/provider identity, model identity where applicable, and provider-owned configuration. Shared resolution rules belong in contracts/orchestration; native fields and request/argv translation belong in adapter packages.

Do not flatten reasoning into a universal low/high enum. OpenAI effort, Anthropic thinking/effort, and CLI-specific settings retain their native types. A common discovery descriptor identifies a control, its schema and meaning; it does not assert equivalence between controls with similar labels.

Keep three concepts separate:

1. **Configuration controls:** requested model behavior, token limits and output preferences.
2. **Model support:** whether an identified model/version supports a requested control and value.
3. **Execution policy:** host-authorized capabilities, tools, approvals, credentials and resource access.

Configuration may restrict behavior further, but never grants execution policy. Existing policy checks remain authoritative after configuration resolution.

### Typed provider configuration and controlled extensions

Export useful built-in configuration types and schemas from their owning public packages. Add optional discovery descriptors without breaking existing manifest validators or replacing their current required fields. Extend strict manifest schemas deliberately; unknown fields must not bypass validation.

For future plugins, use namespaced control IDs and an explicitly registered Standard Schema/native mapper owned by the driver/provider. The core must not contain a closed catalog of all vendors or require modifications for every custom model. Registration happens through trusted host composition; task JSON cannot register functions or arbitrary mapper code.

Extensions are not an unrestricted request-body or argv override bag. They cannot replace credentials/auth headers, endpoint policy, selected model identity, prompt/messages/input, tool definitions/dispatch, approval rules, storage/egress policy or other reserved execution fields. Token/output controls are permitted only through their registered schemas and mappings. Duplicate aliases and conflicting native field destinations are rejected before I/O.

Existing trusted-host low-level APIs such as extraArgs remain backward-compatible. They are explicitly outside the new safe typed task/run control surface; preserving them does not make arbitrary argv safe for untrusted callers.

### Caller-supplied model-capability resolution

A host can supply a resolver keyed by provider/executor ID, model ID and, for CLIs, the relevant declared version context. It reports known supported controls/value constraints, known unsupported controls, or unknown support, with a stable resolution/version identifier. It is not credential-bearing durable data.

- Known unsupported control/value: reject before fetch/spawn; never drop or downgrade silently.
- Known supported: validate both provider configuration schema and model constraints, then map the request.
- Unknown/custom model: expose the unknown result. New control requests default to rejection unless the host explicitly permits **unverified support** for that model/control. This permission bypasses only missing model knowledge, never provider schemas, policy or reserved-field restrictions.
- Required support means unknown is rejected even if unverified support is otherwise permitted.
- Legacy callers without the new control contract/resolver retain current schema validation and provider-side support behavior. Existing valid requests are not newly rejected solely because no resolver exists.

No hardcoded universal model catalog is introduced. Resolvers may be supplied by applications/plugins and updated independently. Brambo does not perform discovery network calls automatically or describe a caller assertion as vendor-verified support.

## Configuration resolution and durable propagation

For the new opt-in surface, precedence is **host defaults < named model profile < task configuration < run override**. Credentials and policy grants are host-owned inputs outside this precedence lattice.

Rules are deterministic:

- Absent/undefined fields do not override; undefined is omitted before durable serialization. Null is accepted only when the owning schema explicitly defines clearing semantics.
- Top-level configuration fields replace lower-layer fields; structured objects and arrays replace atomically, not implicit deep merge or union. Registered extension entries resolve by control ID; each entry's value replaces atomically.
- Provider/model identity is resolved first. A provider switch discards inherited provider-owned configuration from other providers; foreign fields explicitly submitted at the winning task/run layer are rejected. A model switch revalidates the remaining configuration against the winning model. Nothing is forwarded to a different provider accidentally.
- Canonical control IDs cannot occur twice through aliases. Conflicting values/mapper destinations fail, rather than depending on object insertion order.
- Resolve and validate before command admission. For durable workflows, store a copied, frozen JSON representation of the effective configuration and its support-resolution outcome/version. Attempts, continuations and restarts reuse that snapshot; they do not rerun mutable defaults or silently migrate model settings.
- A run override on a durable task must be captured in that admitted snapshot, not passed only through a process-local closure. Raw credentials, resolver functions and adapter instances are never persisted.
- Direct non-durable runs use an immutable validated snapshot for that invocation. Errors identify invalid control IDs with bounded safe diagnostics, never echo arbitrary configuration or secret values.

The implementation plan must specify the additive task/run fields and public exports. Existing DriverFactory.create(configuration, services) remains the generic construction seam. Legacy zero-argument CLI adapter factories remain usable when no new options are requested; an opt-in factory variant receives validated typed configuration. Unsupported overrides on a legacy driver are rejected, not silently ignored.

Named **model profiles** are an additive concept, not a reinterpretation of today's environment ExecutorProfile or string session/plugin executor selection. Existing names and configuration shapes retain their meaning.

## Native mapping priorities and boundaries

1. Make existing supported API controls public and discoverable, including OpenAI reasoningEffort. Do not reimplement working mappings merely to claim new coverage.
2. Add concrete, documented missing reasoning controls where the provider/model supports them. Anthropic thinking and native effort stay distinct; resolve supported combinations explicitly.
3. Add typed model/reasoning controls for the three CLI adapters. Each mapping requires primary CLI documentation/version evidence and synthetic exact-argv tests, including root versus subcommand placement. No guess based on a flag's name or a raw extraArgs example establishes support.
4. Carry the same validated configuration through direct runs and durable tasks, with compatibility tests for legacy callers and custom drivers.

Structured output, tool choice, sampling and service controls are extension candidates, not a commitment to implement every vendor field in this slice. Add them only when an explicit scoped requirement and native support evidence exist. Future plugins can supply their own registered controls.

The existing Claude Code permission-bypass default is a pre-existing trust boundary. This feature must not introduce additional bypass flags or claim to enforce OS isolation. Changing that default would require a separate compatibility/security decision. CLI policy flags and prompts are not an OS sandbox.

## Failure behavior and regression acceptance

All validation failures occur before native execution. Tests must demonstrate zero fetch/spawn calls on unsupported values, unknown required support, reserved-field attempts and policy escalation.

Required synthetic coverage:

- Existing OpenAI low/high mappings and configuration keys remain accepted; public exported types are consumable.
- Anthropic enabled budget/adaptive thinking remain policy-gated, and newly supported effort combinations map only with explicit native/model evidence.
- Typed CLI argument construction preserves prompt delivery, parser behavior, environment isolation and existing policy flags; options occupy the correct command scope.
- Custom driver control schemas work without adding a core vendor enum; unsupported legacy overrides fail while unchanged legacy runs succeed.
- Known supported, known unsupported, unknown and explicitly permitted unverified model cases remain distinguishable.
- Host/profile/task/run precedence, atomic object replacement, duplicate aliases, provider switches and model switches have exact expected outcomes.
- Caller mutation after admission, mutable resolver/default changes, retries and worker restart cannot alter the frozen effective durable configuration.
- Configuration cannot grant an unselected/unapproved capability or replace auth, model selection, prompts, tools or policy through extensions.
- Durable configuration contains only validated JSON and safe support metadata, not functions, credentials or raw provider responses.

Strict TDD is enabled by the current explicit user instruction. Every implemented behavior requires actual failing RED evidence, then GREEN and REFACTOR checks. Planned package-filter commands and task ownership are in `odd/tasks/provider-capability-coverage.md`; no tests/builds were run for this documentation-only unit.

Use fake transports and synthetic spawners for functional verification. A provider smoke test is optional, separately authorized evidence of a particular model/version, not proof of every advertised control or policy isolation.

## Tradeoff and non-goals

Typed schemas plus caller-supplied support resolution require more deliberate configuration than unrestricted passthrough, but make rejection and policy ownership explicit. Avoiding a central model catalog preserves custom-provider support at the cost of surfacing unknown compatibility honestly. Frozen durable resolution improves reproducibility; a deliberate new run is required to adopt changed defaults/support metadata.

This design does not replace transport/auth/lease/storage contracts, build a UI, grant remote execution, change CLI isolation, or promise all-vendor parity. It adds configuration and discovery, not privileges.

## Review state and next gate

Self-review: no placeholders; current/proposed behavior separated; source locators checked; precedence and unknown-model handling explicit; policy ownership and legacy behavior consistent; no claim of live qualification or OS sandboxing. Delivery slicing remains an explicit later decision, not an implementation ambiguity.

**Human review pending.** Review this written design before implementation planning. Approval permits the writing-plans stage only; source implementation waits for review of that plan and selection of its execution method.
