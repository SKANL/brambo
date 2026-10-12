---
title: adapter-api
audience: Developers integrating @brambodev/adapter-api
prerequisites: Node.js >=20
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/adapter-api 0.5.x'
compatibility: Node.js >=20
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/adapter-api

<Badge status="experimental">Experimental</Badge>

*Experimental: tested and usable, but its surface may still change, and it has less platform evidence or fewer in-repo consumers than the stable packages.*

Transport-neutral building blocks for API executors: an explicit `ExecutorRegistry`, opt-in allowlisted discovery, `executeWithRetry`, a bounded local tool loop that routes every call through the host's `executeTool`, SSE event streams, error normalization and redaction, remote capability authorization, and the provider conformance suite at `@brambodev/adapter-api/testing`.

| | |
|---|---|
| World | Session world |
| Topology tier | 5 |
| Node.js | `>=20` |
| Depends on | [`contracts`](./contracts), [`session`](./session) |

## Install

```bash
npm install @brambodev/adapter-api
```

## Example

```ts
import type { ExecutorSelection } from '@brambodev/contracts'
import { createExecutorRegistry } from '@brambodev/adapter-api'
import { createAnthropicProvider } from '@brambodev/adapter-anthropic'
import { createOpenAIProvider } from '@brambodev/adapter-openai'

const registry = createExecutorRegistry()
registry.register(createOpenAIProvider({ credential: () => process.env.OPENAI_API_KEY ?? '' }))
registry.register(createAnthropicProvider({ credential: () => process.env.ANTHROPIC_API_KEY ?? '' }))
console.log(registry.list().map((manifest) => manifest.id)) // ['openai', 'anthropic']

const selection: ExecutorSelection = { providerId: 'anthropic', model: process.env.ANTHROPIC_MODEL ?? '' }
const adapter = registry.create(selection, { selection, credential: undefined })
```

## Ports

- **Implements:** `ExecutorRegistry`; an API `DriverFactory` (`createApiDriverFactory`) for durable runs.
- **Consumes:** `ExecutorProvider` instances you register; `@brambodev/session` `executeTool` for local tools.

## Errors

`BRAMBO_EXECUTOR_PROVIDER_*` (manifest, selection, unknown, duplicate registration); tool-loop and remote-capability refusals are plain `Error`s.

## Limits

- A provider id selects a registered provider; it never imports a package.
- `executeWithRetry` retries only provably unaccepted `rate-limit`, `timeout` and `unavailable` failures; the official providers call it with `maxAttempts: 1`.
- The tool loop never retries a tool and has no implicit unlimited continuation.
- The options argument of `registry.create` is typed to include `selection`, so TypeScript callers pass it twice.

## See also

- [API executors](../guides/api-executors)
- [Write an ExecutorProvider](../guides/third-party-executor-providers)
