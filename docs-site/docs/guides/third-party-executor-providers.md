---
title: Third-party API executor providers
audience: Provider authors and SDK hosts
prerequisites: API executor guide
outcome: Package, register, and verify a provider without config-driven code loading
scope: Public provider manifest, conformance, and optional discovery
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# Third-party API executor providers

Publish a normal npm package that exports an `ExecutorProvider`. The trusted host installs/imports it and calls `registry.register(provider)`. A profile's `providerId` only resolves that registered ID; it is **not** an npm package name, file path, URL, or executable command.

## Author and register

A provider exposes an `ExecutorManifest` with stable `id`, `displayName`, `contractVersion`, `packageName`, declared capabilities, and a synchronous Standard Schema `configurationSchema`. Its `create(options)` returns an `ExecutorAdapter`. Keep credentials in host-supplied create options, not manifest/configuration metadata.

```ts
import {createExecutorRegistry} from '@brambodev/adapter-api'
import {createAcmeProvider} from '@acme/brambo-adapter'

const registry = createExecutorRegistry()
registry.register(createAcmeProvider({credential: () => process.env.ACME_API_KEY ?? ''}))
const adapter = registry.create({providerId: 'acme', model: 'acme-model'}, {credential: undefined})
```

`registry.create({providerId: '@acme/brambo-adapter', model: 'acme-model'}, ...)` does **not** import that package; the slash-containing package name is rejected as an invalid provider ID. Reject unknown capabilities and configuration fields before network activity. The provider must preserve cancellation and result-envelope invariants, normalize errors, redact secrets, bound retries, and route local tools through the host's `executeTool()` path.

Run `defineExecutorProviderConformance` from `@brambodev/adapter-api/testing` against your provider with deterministic fixtures. Include cancellation, malformed response, tool denial, and owned-resource cleanup. Type compatibility alone is not evidence of behavior.

## Optional installed-package discovery

`discoverExecutorProviders()` is opt-in. The **host** supplies both installed candidate package names and an exact allowlist, plus a loader returning `{packageJson, provider}`. Brambo checks the allowlist **before** calling the loader, validates package metadata/manifest agreement, then registers accepted providers. A rejected candidate returns a reason such as `not-allowlisted`, `package-mismatch`, or `duplicate-provider-id`; it does not silently become available.

The package metadata must include `brambo.executor` with matching `id`, `contractVersion`, `packageName`, and `capabilities`. Keep the loader in trusted host code; never derive candidates, import paths, URLs, credentials, or permission grants from project/user profile text. Discovery does not install packages and is not part of the kernel lifecycle.

See [API adapter security](../explanation/api-adapter-security) before loading third-party code. An allowlist controls which package executes, not whether that package is trustworthy.
