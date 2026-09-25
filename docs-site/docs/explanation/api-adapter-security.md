---
title: API adapter security boundaries
audience: SDK hosts and reviewers
prerequisites: API executor guide
outcome: Separate local tool authority from provider-hosted capabilities
scope: API adapter trust and resource ownership
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# API adapter security boundaries

API adapters send prompts and selected inputs to a remote model. They do not turn model output into local authority. The host must explicitly select providers, inject credentials, authorize local tools, and grant each hosted capability.

| Boundary | Required host decision |
| --- | --- |
| Package loading | Import/register trusted installed packages explicitly; optional discovery checks a host allowlist before loading. Configuration cannot choose code to import. |
| Secrets | Inject credentials at runtime. Never store API keys, MCP tokens, or arbitrary endpoints in Brambo config or profiles; scrub diagnostics. |
| Local tools | Declare definitions and limits; build `createExecution` with a sandbox policy, authorizer, and approval. Every call uses `executeTool()`; model arguments are untrusted. |
| Hosted web/MCP | Select and grant capability plus egress policy. Hosted activity occurs at the provider and is **outside** Brambo's local sandbox. Review provider retention and billing. |
| Provider files/state | Grant retention/deletion, track ownership, call `dispose()` for adapter-owned resources. Host-owned IDs are not silently deleted. |
| Cost and time | Set host budgets, abort deadlines, request caps, tool-step caps, and provider-side search limits. Retries cannot safely replay side effects. |

The official providers emit normalized usage, rate-limit, error, request-ID, and streaming observations. These are diagnostics, not a license to log prompts, responses, tool inputs, or secret values. On abort, deadline, malformed provider output, or denied tool execution, inspect the coded final envelope and stop the turn; do not fall back to unbounded direct provider requests.

The [live workflow](https://github.com/SKANL/brambo/blob/main/.github/workflows/api-adapters-live.yml) supports confirmed manual dispatch and a weekly Tuesday 06:17 UTC schedule, both restricted to `main`. It has no push or pull-request trigger. Configure the `api-adapters-live` environment with trusted reviewers, a `main` branch restriction, and isolated, low-budget keys before enabling live evidence. Ordinary CI and `pnpm test` use deterministic fixtures without provider credentials.

## Live proof

Maintain `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` **only as secrets of the protected environment**. A manual run supplies both model IDs and a `RUN` confirmation; scheduled runs use environment configuration variables `OPENAI_LIVE_MODEL` and `ANTHROPIC_LIVE_MODEL`. Missing credentials or model IDs fail closed. The runner also requires `BRAMBO_RUN_LIVE_API_TESTS=1`, `BRAMBO_LIVE_API_MAX_REQUESTS` from 2 to 4, and `BRAMBO_LIVE_API_TIMEOUT_MS` from 1000 to 60000. It runs providers serially, caps each request and local tool turn, aborts on deadline, and prints only bounded status/count/cleanup evidence. Without opt-in it skips; with opt-in but incomplete setup it fails closed. Do not paste keys into workflow inputs or logs.
