# @brambodev/adapter-anthropic

Official Anthropic Messages API executor for Brambo. The host injects credentials, registers the provider explicitly, and authorizes local tools and optional hosted capabilities.

See the [Anthropic adapter guide](../../docs-site/docs/guides/anthropic-api-adapter.md).

## Typed model controls

The package exports `AnthropicConfiguration`, `ANTHROPIC_CONFIGURATION_SCHEMA`,
`ANTHROPIC_CONTROL_CONTRACT` and `createAnthropicControlContract(extensions?)`.
`AnthropicEffort` accepts `low`, `medium`, `high`, `xhigh` and `max`, mapped to `output_config.effort`.
The control contract exposes `effort`, `maxTokens`,
`temperature` and `stream` through namespaced `anthropic:<configurationKey>` IDs.

Resolve host defaults, named profile, task configuration and run overrides with
`resolveExecutionConfiguration` from `@brambodev/orchestration`, using the provider's
`manifest.configurationControls` and a host-owned model-capability resolver. Pass the
returned effective envelope as `RunRequest.executionConfiguration` to `adapter.run`.
Unknown models require an explicit host unverified-support decision; required unknown
or unsupported controls fail during resolution. There is no built-in universal model catalog.
The adapter rechecks provider, model, registered IDs, schemas and support receipts
before resolving credentials or calling transport. The envelope is data, NOT authorization.

Controlled invocations take model-behavior keys only from that envelope, not legacy
constructor configuration. Include every desired behavior in the resolution layers.
Constructor-only system text and host policy remain separate.
Omitting the envelope preserves legacy selection and request behavior.

Native registrations are extension-only: omit `configurationKey` and use namespaced
IDs in the resolved `extensions` list. Custom drivers may own broader configuration
schemas; this native-adapter constraint does not change that generic seam.

Trusted hosts may pass `controlExtensions` to `createAnthropicProvider`. The provider
owns descriptor/schema-port snapshots, rejects ID/alias collisions and advertises a
frozen derived contract. Mappers receive only validated values; their destinations
are restricted to model behavior/output fields (`output_config` (effort only), `max_tokens`, `temperature`, `stream`).
Duplicate or already-written destinations and auth, endpoints, model identity,
prompts, tools, storage, approvals and policy fields are rejected before I/O.
Trusted host code itself is not sandboxed by these schemas.

Effort is a behavioral signal, not a thinking-token budget or permission to enable thinking. Existing extended-thinking selection/host grants remain required; manual budget_tokens must stay below the invocation max_tokens. Effort availability and thinking modes differ by model and belong to host evidence, not guessed name matching. See [official Anthropic effort documentation](https://platform.claude.com/docs/en/build-with-claude/effort) and [manual thinking constraints](https://platform.claude.com/docs/en/build-with-claude/extended-thinking).

Verification is synthetic request-body/schema proof, not a live provider qualification.
Primary documentation checked: 2026-10-10.

### Coverage and unknown models

| Exposed typed key | Native field | Local proof | Model support |
|---|---|---|---|
| `effort` | `output_config.effort` | schema + exact fake transport body | host evidence required |
| `maxTokens` | `max_tokens` | schema + exact fake transport body | host evidence required |
| `temperature` | `temperature` | schema + exact fake transport body | host evidence required |
| `stream` | `stream` | `false` body + missing-grant refusal; legacy stream fixtures | host evidence required |

An arbitrary model name remains unknown until the host resolver supplies support.
Without `allowUnverified` resolution refuses requested controls; allowing unknown
support yields `unverified`, never `supported`. A requested extension with
`requiredSupport: true` still refuses unknown support. Explicitly unsupported
controls always refuse. Use `createAnthropicControlContract` for extension descriptors
and `createAnthropicProvider({ controlExtensions })` for the corresponding mappers;
registration neither enables extended thinking nor grants hosted/local tools.

Local composition includes resolver -> configured factory -> runtime -> fake
transport. It does not establish live authentication, provider acceptance of a
synthetic model, installed packaging or a universal thinking/effort compatibility rule.
