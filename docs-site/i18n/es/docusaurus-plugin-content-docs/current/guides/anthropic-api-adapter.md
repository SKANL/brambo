---
title: Anthropic API adapter
audience: SDK hosts
prerequisites: API executor guide and an Anthropic API credential
outcome: Configure the official Messages API adapter
scope: Anthropic-specific selection and capabilities
compatibility: Published packages support Node.js >=20
translationStatus: pending
---
# Anthropic API adapter

> Traducción pendiente. La guía original en inglés se conserva para evitar instrucciones incompletas.

Install `@brambodev/adapter-api` and `@brambodev/adapter-anthropic`. Register the provider explicitly and supply a model enabled for your account.

```ts
import {createExecutorRegistry} from '@brambodev/adapter-api'
import {createAnthropicProvider} from '@brambodev/adapter-anthropic'

const registry = createExecutorRegistry()
registry.register(createAnthropicProvider({credential: () => process.env.ANTHROPIC_API_KEY ?? ''}))
const adapter = registry.create(
  {providerId: 'anthropic', model: process.env.ANTHROPIC_MODEL ?? '', capabilities: ['streaming'], configuration: {stream: true, maxTokens: 256}},
  {credential: undefined},
)
```

`configuration` accepts `system`, `stream`, `maxTokens`, and `temperature`. Streaming publishes structured Messages events through `onEvent`; `run()` returns the completed envelope. Local `tool_use` blocks require a host `toolLoop`; Brambo validates the arguments and routes execution through local policy, authorizer, and approval before sending `tool_result` blocks.

| Optional feature | Host obligation |
| --- | --- |
| Hosted web search | Select `hosted-web-search`, set `webSearch: true`, grant egress, and supply a paid-search policy with `maxUses` and an explicit domain allowlist. |
| Remote MCP | Select `remote-mcp`, grant egress, and configure HTTPS server URLs plus unique allowed tool names. This is provider-side execution, not the local sandbox. |
| Provider files | Select `provider-files`, grant retention/deletion, provide supported file/media types, and call `dispose()` for adapter-owned uploads. |
| Prompt caching | Select and grant `prompt-caching` and set `promptCaching: true`. |
| Extended thinking | Select and grant `extended-thinking`; configure adaptive thinking or a valid token budget. |

Provider features vary by model and account; an advertised adapter capability is not a model guarantee. Check the [Anthropic tool-use guide](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use) and [Messages streaming guide](https://platform.claude.com/docs/en/api/messages-streaming) before deployment. Credentials remain host-injected; do not persist them in profiles or logs.
