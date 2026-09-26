---
title: adapter-anthropic
audience: SDK hosts
prerequisites: Node.js >=20 and an Anthropic API credential
outcome: Locate the official Messages API provider surface
scope: Published @brambodev/adapter-anthropic package
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# @brambodev/adapter-anthropic

`createAnthropicProvider` and `ANTHROPIC_EXECUTOR_MANIFEST` are the main exports. The provider accepts injected credentials and transport, supports stream/non-stream Messages execution, bounded host-mediated local tools, and explicit optional hosted capabilities. It is not a CLI wrapper. See the [Anthropic setup guide](../guides/anthropic-api-adapter) for policy and cleanup requirements.
