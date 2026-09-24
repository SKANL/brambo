---
title: OpenAI API adapter
audience: SDK hosts
prerequisites: API executor guide and an OpenAI API credential
outcome: Configure the official Responses API adapter
scope: OpenAI-specific selection and capabilities
compatibility: Published packages support Node.js >=20
translationStatus: pending
---
# OpenAI API adapter

> Traducción pendiente. La guía original en inglés se conserva para evitar instrucciones incompletas.

Install `@brambodev/adapter-api` and `@brambodev/adapter-openai`. Register `createOpenAIProvider({credential})` in the [executor registry](./api-executors). The host supplies a currently supported model ID; this adapter does not guess a default.

```ts
import {createExecutorRegistry} from '@brambodev/adapter-api'
import {createOpenAIProvider} from '@brambodev/adapter-openai'

const registry = createExecutorRegistry()
registry.register(createOpenAIProvider({credential: () => process.env.OPENAI_API_KEY ?? ''}))
const adapter = registry.create(
  {providerId: 'openai', model: process.env.OPENAI_MODEL ?? '', capabilities: ['streaming'], configuration: {stream: true, maxOutputTokens: 256}},
  {credential: undefined},
)
```

`configuration` accepts `instructions`, `stream`, `maxOutputTokens`, `temperature`, and `previousResponseId`; unknown keys fail validation. Streaming delivers `response.*` events via `onEvent` and a final envelope via `run()`. Function calls use the host-controlled local tool loop and correlate `call_id` output across requests. Set strict request and tool-step budgets in the host.

| Optional feature | Host obligation |
| --- | --- |
| Conversation state | Select `conversation-state`, grant retention/deletion policy, and own cleanup; otherwise requests use `store: false`. |
| Hosted web search | Select `hosted-web-search`, grant network egress, and set `webSearch: true`. Provider-side search is not local sandbox execution. |
| Remote MCP | Select `remote-mcp`, provide HTTPS servers and allowed tools, plus `mcpAuthorizer`; an undecided approval is denied. |
| Provider files | Select `provider-files`, grant retention/deletion, supply file inputs or use upload/read/delete methods, and call `dispose()`. |
| Prompt caching | Select and grant `prompt-caching` where the chosen model/API supports it. |

The adapter rejects non-HTTPS custom endpoints or URLs containing embedded credentials. Keep API keys out of persisted profiles and event logs. For current model/API/tool availability, verify the [OpenAI tools guide](https://platform.openai.com/docs/guides/tools) and [function calling guide](https://platform.openai.com/docs/guides/function-calling) before deployment; Brambo's manifest is not a promise that every model supports every capability.
