---
title: adapter-openai
audience: SDK hosts
prerequisites: Node.js >=20 and an OpenAI API credential
outcome: Locate the official Responses API provider surface
scope: Published @brambodev/adapter-openai package
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# @brambodev/adapter-openai

`createOpenAIProvider` and `OPENAI_EXECUTOR_MANIFEST` are the main exports. The provider accepts injected credentials and transport, supports stream/non-stream Responses execution, bounded host-mediated local tools, and explicit optional hosted capabilities. It is not a CLI wrapper. See the [OpenAI setup guide](../guides/openai-api-adapter) for policy and cleanup requirements.
