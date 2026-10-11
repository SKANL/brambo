# @brambodev/adapter-openai

Official OpenAI Responses API executor for Brambo. The host injects credentials, registers the provider explicitly, and authorizes local tools and optional hosted capabilities.

See the [OpenAI adapter guide](../../docs-site/docs/guides/openai-api-adapter.md).

## Typed model controls

The package exports `OpenAIConfiguration`, `OPENAI_CONFIGURATION_SCHEMA`,
`OPENAI_CONTROL_CONTRACT` and `createOpenAIControlContract(extensions?)`.
`OpenAIReasoningEffort` retains the existing values and mapping to `reasoning.effort`.
The control contract exposes `reasoningEffort`, `maxOutputTokens`,
`temperature` and `stream` through namespaced `openai:<configurationKey>` IDs.

### Chain integration pending

The direct adapter control contract and validated execution envelope are available
now. The orchestration resolver and configured factory/runtime composition described
below are not yet available in this delivery slice; they arrive with integration
slice 7. This is a planned integration example, not a current SDK recipe.

After slice 7, resolve host defaults, named profile, task configuration and run overrides with
`resolveExecutionConfiguration` from `@brambodev/orchestration`, using the provider's
`manifest.configurationControls` and a host-owned model-capability resolver. Pass the
returned effective envelope as `RunRequest.executionConfiguration` to `adapter.run`.
Unknown models require an explicit host unverified-support decision; required unknown
or unsupported controls fail during resolution. There is no built-in universal model catalog.
The adapter rechecks provider, model, registered IDs, schemas and support receipts
before resolving credentials or calling transport. The envelope is data, NOT authorization.

Controlled invocations take model-behavior keys only from that envelope, not legacy
constructor configuration. Include every desired behavior in the resolution layers.
Constructor-only instructions/conversation state and host policy remain separate.
Omitting the envelope preserves legacy selection and request behavior.

Native registrations are extension-only: omit `configurationKey` and use namespaced
IDs in the resolved `extensions` list. Custom drivers may own broader configuration
schemas; this native-adapter constraint does not change that generic seam.

Trusted hosts may pass `controlExtensions` to `createOpenAIProvider`. The provider
owns descriptor/schema-port snapshots, rejects ID/alias collisions and advertises a
frozen derived contract. Mappers receive only validated values; their destinations
are restricted to model behavior/output fields (`reasoning`, `max_output_tokens`, `temperature`, `stream`).
Duplicate or already-written destinations and auth, endpoints, model identity,
prompts, tools, storage, approvals and policy fields are rejected before I/O.
Trusted host code itself is not sandboxed by these schemas.

Model-specific effort availability and incompatible sampling combinations must be supplied by host support/schema evidence. Existing effort values are retained, not expanded automatically from a model catalog. See [official OpenAI reasoning documentation](https://developers.openai.com/api/docs/guides/reasoning).

Verification is synthetic request-body/schema proof, not a live provider qualification.
Primary documentation checked: 2026-10-10.

### Coverage and unknown models

| Exposed typed key | Native field | Local proof | Model support |
|---|---|---|---|
| `reasoningEffort` | `reasoning.effort` | schema + exact fake transport body | host evidence required |
| `maxOutputTokens` | `max_output_tokens` | schema + exact fake transport body | host evidence required |
| `temperature` | `temperature` | schema + exact fake transport body | host evidence required |
| `stream` | `stream` | `false` body + missing-grant refusal; legacy stream fixtures | host evidence required |

An arbitrary model name remains unknown until the host resolver supplies support.
Without `allowUnverified` resolution refuses requested controls; allowing unknown
support yields `unverified`, never `supported`. A requested extension with
`requiredSupport: true` still refuses unknown support. Explicitly unsupported
controls always refuse. Use `createOpenAIControlContract` for extension descriptors
and `createOpenAIProvider({ controlExtensions })` for the corresponding mappers;
registration does not enable tools or change network/credential policy.

Prior final-source synthetic evidence includes resolver -> configured factory -> runtime -> fake
transport; that integrated composition remains pending until slice 7. It does not
establish live authentication, provider acceptance of a
synthetic model, installed packaging or universal effort/sampling compatibility.
