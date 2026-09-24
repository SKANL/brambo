---
title: API executor adapters
audience: SDK hosts
prerequisites: Node.js >=20 and provider API access
outcome: Run a registered API executor without persisting a secret
scope: Transport-neutral registry and session composition
compatibility: Published packages support Node.js >=20
translationStatus: pending
---
# API executor adapters

> Traducción pendiente. La guía original en inglés se conserva para evitar instrucciones incompletas.

Install `@brambodev/adapter-api` and one provider package. A provider ID selects an **already registered** provider; it never names a package to import. The host owns credentials, model selection, workspace, budgets, and cancellation.

## Quick path

```ts
import {createExecutorRegistry} from '@brambodev/adapter-api'
import {createOpenAIProvider} from '@brambodev/adapter-openai'
import {runSession} from '@brambodev/session'

const registry = createExecutorRegistry()
registry.register(createOpenAIProvider({credential: () => process.env.OPENAI_API_KEY ?? ''}))
const result = await runSession({
  prompt: 'Explain the failing test',
  createAdapter: () => registry.create(
    {providerId: 'openai', model: process.env.OPENAI_MODEL ?? '', capabilities: ['streaming'], configuration: {stream: true}},
    {credential: undefined},
  ),
})
console.log(result.status)
```

Supply a valid model explicitly and fail your host startup if the credential or model is absent. Inject the credential from a secret manager or process environment at runtime, not from `~/.brambo/config.json`, project configuration, logs, or a saved profile. The provider also accepts a host-supplied `transport` for controlled HTTP egress and testing. See [OpenAI](./openai-api-adapter) and [Anthropic](./anthropic-api-adapter) for their distinct options.

## Streaming, results, and cancellation

Select `streaming` **and** set `configuration.stream: true`; provide `onEvent` on the provider for normalized, ordered deltas and correlation metadata. `run()` still returns the final `ResultEnvelope`. The optional `onObservation` receives usage, rate-limit, and normalized error observations. Do not log arbitrary event payloads as if they were non-sensitive. Pass an `AbortSignal` on a direct adapter `run()` call or own the surrounding session cancellation/deadline. Request IDs are diagnostic correlation values, not authorization tokens.

## Local tool calls

Selecting `local-tools` is insufficient on its own: supply a `toolLoop` with host definitions, `maxSteps`, `maxConcurrentCalls`, session/turn IDs, and `createExecution`. Each model call goes through `@brambodev/session`'s `executeTool()` boundary, with argument validation, sandbox policy, authorizer, and `approveTool`. The host decides which tools and capabilities to expose; never treat provider-supplied names or arguments as authority. The loop has no implicit unlimited continuation. See [Tools and sandbox](./tools-and-sandbox) and [API adapter security](../explanation/api-adapter-security).

## Optional hosted capabilities

Provider-advertised capabilities are not automatically enabled. Select each one and supply provider `capabilities.policy` plus its explicit configuration. Hosted web search, remote MCP, and file uploads cross a provider-owned egress/retention boundary; they do **not** use the local `executeTool()` sandbox. Track host-owned versus adapter-owned remote resources and call `dispose()` to clean adapter-owned resources. Provider-specific limits and unsupported cases are in the two provider guides.

## CLI migration

Legacy `brambo run --executor codex` (and `claude-code`/`opencode`) remains a CLI-process path. A host that bootstraps a registry may use `brambo run --executor-profile api:openai --model MODEL "prompt"`; there is no config-driven install or module import. The standalone CLI does not create arbitrary third-party providers from profile text. See [third-party providers](./third-party-executor-providers) for explicit host registration.
