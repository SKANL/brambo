---
title: Write an ExecutorProvider
audience: Provider authors and SDK hosts
prerequisites: API executor guide
outcome: Write, register, package and verify an API executor provider without config-driven code loading
scope: ExecutorProvider manifest, adapter invariants, conformance and optional discovery in 0.5.x
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# Write an ExecutorProvider

An `ExecutorProvider` packages an API executor so a host can register it next to OpenAI and Anthropic. It is a manifest plus a `create(options)` factory that returns an `ExecutorAdapter`. The host installs your package, imports it, and calls `registry.register(provider)`; a `providerId` in a profile only ever resolves a provider that was registered this way. It is never an npm package name, path, URL or command.

## A complete minimal provider

This provider sends the prompt through a transport the host injects and returns the reply. It has no tools and no streaming, and it is the whole contract:

```ts
import { defineStandardSchema } from '@brambodev/contracts'
import type { ExecutorProvider, ExecutorProviderCreateOptions, ResultEnvelope, RunRequest } from '@brambodev/contracts'
import { normalizeProviderError } from '@brambodev/adapter-api'

/** What this provider needs from the network: one call per turn, injected by the host. */
export type EchoTransport = (body: { model: string; prompt: string }, signal?: AbortSignal) => Promise<{ text: string }>

interface EchoConfiguration { readonly uppercase?: boolean }

const configurationSchema = defineStandardSchema<EchoConfiguration>((value) => {
  if (value === undefined) return { value: {} }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { issues: [{ message: 'configuration must be an object' }] }
  const unknown = Object.keys(value).filter((key) => key !== 'uppercase')
  if (unknown.length > 0) return { issues: [{ message: `unknown configuration keys: ${unknown.join(', ')}` }] }
  const { uppercase } = value as { uppercase?: unknown }
  if (uppercase !== undefined && typeof uppercase !== 'boolean') return { issues: [{ message: 'uppercase must be a boolean' }] }
  return { value: { uppercase: uppercase as boolean | undefined } }
})

export function createEchoProvider(defaults: { transport?: EchoTransport } = {}): ExecutorProvider {
  return {
    manifest: {
      id: 'echo',
      displayName: 'Echo API',
      contractVersion: '1',
      packageName: '@acme/brambo-echo',
      capabilities: [],
      configurationSchema,
    },
    create(options: ExecutorProviderCreateOptions) {
      const transport = (options.transport as EchoTransport | undefined) ?? defaults.transport
      if (!transport) throw new Error('echo provider requires a host-supplied transport')
      const configuration = (options.selection.configuration ?? {}) as EchoConfiguration
      return {
        async run(request: RunRequest): Promise<ResultEnvelope> {
          if (request.signal?.aborted) return { status: 'cancelled', data: null, summary: 'cancelled', errors: [{ message: 'aborted before send' }] }
          try {
            const reply = await transport({ model: options.selection.model, prompt: request.prompt }, request.signal)
            const text = configuration.uppercase ? reply.text.toUpperCase() : reply.text
            return { status: 'ok', data: { text }, summary: text }
          } catch (error) {
            if (request.signal?.aborted) return { status: 'cancelled', data: null, summary: 'cancelled', errors: [{ message: 'aborted' }] }
            const normalized = normalizeProviderError({ providerId: 'echo', category: 'unavailable', message: error instanceof Error ? error.message : String(error) })
            return { status: 'failed', data: { providerError: normalized }, summary: 'echo request failed', errors: [{ message: normalized.message }] }
          }
        },
      }
    },
  }
}
```

## Register and run it

```ts
import type { ExecutorSelection } from '@brambodev/contracts'
import { createExecutorRegistry } from '@brambodev/adapter-api'
import { createEchoProvider } from '@acme/brambo-echo'

const registry = createExecutorRegistry()
registry.register(createEchoProvider({ transport: async ({ prompt }) => ({ text: `echo: ${prompt}` }) }))

const selection: ExecutorSelection = { providerId: 'echo', model: 'echo-1', configuration: { uppercase: true } }
const adapter = registry.create(selection, { credential: undefined })
console.log(await adapter.run({ prompt: 'hello', workspace: { id: 'w', rootPath: process.cwd(), capabilities: ['read'] } }))
// { status: 'ok', data: { text: 'ECHO: HELLO' }, summary: 'ECHO: HELLO' }
```

The registry validates the selection against your schema before `create` runs. `configuration: { colour: 'red' }` is refused with `BRAMBO_EXECUTOR_PROVIDER_SELECTION_INVALID`; a second provider with the same id is `BRAMBO_EXECUTOR_PROVIDER_DUPLICATE_REGISTRATION`; an unknown id is `BRAMBO_EXECUTOR_PROVIDER_UNKNOWN`; and a slash-containing id such as `@acme/brambo-echo` is rejected as an invalid provider id rather than imported.

Both snippets above were typechecked and run against the 0.5.x sources while writing this page. The options argument of `registry.create` is `Omit<ExecutorProviderCreateOptions, 'selection'>`: the selection travels only as the first argument, and the registry passes its validated copy to the provider.

## The manifest

| Field | Rule |
|---|---|
| `id` | Stable lowercase provider id; what a profile's `providerId` resolves. |
| `displayName` | Human-readable name. |
| `contractVersion` | Must be `'1'`. Anything else is rejected. |
| `packageName` | Your npm package name; checked against `package.json` by discovery. |
| `capabilities` | Subset of `streaming`, `local-tools`, `conversation-state`, `prompt-caching`, `extended-thinking`, `provider-files`, `remote-mcp`, `hosted-web-search`. Advertise only what you implement. |
| `configurationSchema` | A Standard Schema v1 validator that must validate **synchronously**. Reject unknown keys. |
| `configurationControls` | Optional typed model controls for durable execution configuration. |

## Adapter invariants

| Rule | Why |
|---|---|
| Never throw from `run` for a provider failure; return `failed` with a non-empty `errors` array. | Hosts treat a thrown error as an environment failure. |
| On `signal` abort, stop work and return `cancelled` with a non-empty `errors` array. | The session's cancellation contract. |
| Normalize errors with `normalizeProviderError` and pass every secret in its `secrets` list. | Envelopes and observations must never contain credentials. |
| Take credentials only from `options.credential` and the transport from `options.transport`. | Credentials stay host-owned and per run. |
| Reject unknown capabilities and configuration before any network call. | Fail closed, spend nothing. |
| Route local tool calls through the host's `executeTool` boundary (`runLocalToolLoop`). | Model output is never authority. |
| Bound retries (`executeWithRetry`) and track remote resources you create (`createRemoteResourceLedger`), cleaning them in `dispose()`. | The host must be able to reason about side effects and cleanup. |

## Prove it with the conformance suite

`defineExecutorProviderConformance` from `@brambodev/adapter-api/testing` registers a Vitest `describe` block that creates a **fresh adapter from your provider for every scenario** and checks the results. You supply deterministic fixtures, each with `createOptions`, a `runRequest`, and an `observations()` function reporting what your injected fake transport and host boundary saw:

| Fixture | The suite asserts |
|---|---|
| `success` | Valid manifest; valid `ok` envelope; exactly one send. |
| `failure` | `failed` envelope with errors; normalized provider errors; the `secret` never appears. |
| `cancellation` | Aborting the request's signal yields `cancelled` and no further send. |
| `deniedTool` | A denied tool passes through the host boundary once, with correlation ids and an error outcome. |
| `malformedTool` | Malformed arguments are rejected before host execution. |
| `duplicateTool` | A replayed provider call id is rejected before a second execution. |
| `boundedTool` | The tool loop stops at its step limit without another execution. |
| `orderedTools` | Multiple calls run in order. |
| `cleanup` | Adapter-owned remote resources are removed; host-owned ones are not. |

```ts
import { defineExecutorProviderConformance } from '@brambodev/adapter-api/testing'
import type { ExecutorProviderConformanceFixtures } from '@brambodev/adapter-api/testing'
import { createAcmeProvider } from '../src/index.ts'

declare const fixtures: ExecutorProviderConformanceFixtures // built from your fake transport

defineExecutorProviderConformance({ name: 'acme provider', provider: createAcmeProvider(), fixtures })
```

The suite includes tool-loop scenarios, so a provider must implement local tools through `runLocalToolLoop` to pass it; the minimal echo provider above would fail the tool fixtures by design. A complete, working fixture set that uses only published package roots lives in the repository at `packages/adapter-api/test/consumer-conformance.fixture.ts`; the official OpenAI and Anthropic providers run the same suite in `packages/adapter-openai/test/openai-conformance.test.ts` and `packages/adapter-anthropic/test/anthropic-conformance.test.ts`. Type compatibility alone is not evidence of behavior.

## Package metadata

Declare the provider in your `package.json` so optional discovery can verify it before loading:

```json
{
  "name": "@acme/brambo-echo",
  "brambo": {
    "executor": { "id": "echo", "contractVersion": "1", "packageName": "@acme/brambo-echo", "capabilities": [] }
  }
}
```

## Optional installed-package discovery

`discoverExecutorProviders()` is opt-in. The **host** supplies both installed candidate package names and an exact allowlist, plus a loader returning `{packageJson, provider}`. brambo checks the allowlist **before** calling the loader, validates package metadata and manifest agreement, then registers accepted providers. A rejected candidate returns a reason (`not-allowlisted`, `load-failed`, `invalid-module`, `invalid-manifest`, `package-mismatch`, `duplicate-provider-id`, `registration-failed`); it does not silently become available.

Keep the loader in trusted host code; never derive candidates, import paths, URLs, credentials or permission grants from project or user profile text. Discovery does not install packages and is not part of the kernel lifecycle. See [API adapter security](../explanation/api-adapter-security) before loading third-party code: an allowlist controls which package executes, not whether that package is trustworthy.
