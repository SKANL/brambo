---
title: adapter-anthropic
audience: Developers integrating @brambodev/adapter-anthropic
prerequisites: Node.js >=20
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/adapter-anthropic 0.5.x'
compatibility: Node.js >=20
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/adapter-anthropic

<Badge status="experimental">Experimental</Badge>

*Experimental: tested and usable, but its surface may still change, and it has less platform evidence or fewer in-repo consumers than the stable packages.*

The official Anthropic Messages API `ExecutorProvider`. Raw `fetch` with an injectable transport, SSE streaming, a host-controlled local tool loop, and opt-in hosted capabilities. Manifest capabilities: streaming, local tools, prompt caching, extended thinking, provider files, remote MCP and hosted web search (no conversation state).

| | |
|---|---|
| World | Session world |
| Topology tier | 6 |
| Node.js | `>=20` |
| Depends on | [`adapter-api`](./adapter-api), [`contracts`](./contracts), [`kernel`](./kernel), [`session`](./session) |

## Install

```bash
npm install @brambodev/adapter-anthropic
```

## Example

```ts
import type { ExecutorSelection } from '@brambodev/contracts'
import { createExecutorRegistry } from '@brambodev/adapter-api'
import { createAnthropicProvider } from '@brambodev/adapter-anthropic'

const registry = createExecutorRegistry()
registry.register(createAnthropicProvider({ credential: () => process.env.ANTHROPIC_API_KEY ?? '' }))
const selection: ExecutorSelection = { providerId: 'anthropic', model: process.env.ANTHROPIC_MODEL ?? '', capabilities: ['streaming'], configuration: { stream: true, maxTokens: 256 } }
const adapter = registry.create(selection, { credential: undefined })
```

## Ports

- **Implements:** `ExecutorProvider` (id `anthropic`).
- **Consumes:** A credential and optional `transport` from the host; `adapter-api` primitives.

## Errors

Run failures are `failed` envelopes with a normalized `providerError` (category, phase, status); construction problems (non-HTTPS endpoint, missing credential) throw plain `Error`s.

## Limits

- One request per turn: no retry (`maxAttempts: 1`) and no timeout.
- The host supplies a currently valid model id; there is no default.
- SSE frames larger than 1,048,576 characters are refused.
- Hosted capabilities run at the provider, outside any local sandbox.

## See also

- [Anthropic API adapter](../guides/anthropic-api-adapter)
- [API adapter security](../explanation/api-adapter-security)
