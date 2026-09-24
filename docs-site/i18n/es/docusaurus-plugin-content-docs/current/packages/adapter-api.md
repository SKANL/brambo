---
title: adapter-api
audience: SDK hosts and provider authors
prerequisites: Node.js >=20
outcome: Locate the transport-neutral provider registry and conformance APIs
scope: Published @brambodev/adapter-api package
compatibility: Published packages support Node.js >=20
translationStatus: pending
---
# @brambodev/adapter-api

> Traducción pendiente. La guía original en inglés se conserva para evitar instrucciones incompletas.

This package owns explicit provider registration, opt-in allowlisted discovery, local tool-loop limits, safe event streams, retry classification, remote capability grants, and resource ownership. It does not load packages from configuration or contain an OpenAI/Anthropic transport.

Import `createExecutorRegistry` from the root export. Provider authors import `defineExecutorProviderConformance` from `@brambodev/adapter-api/testing` in Vitest tests. See [API executors](../guides/api-executors) and [third-party providers](../guides/third-party-executor-providers).
