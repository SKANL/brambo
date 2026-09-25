---
title: API adapter security boundaries
audience: SDK hosts and reviewers
prerequisites: API executor guide
outcome: Separate local tool authority from provider-hosted capabilities
scope: API adapter trust and resource ownership
compatibility: Published packages support Node.js >=20
translationStatus: pending
---
# API adapter security boundaries

> Traducción pendiente. La guía original en inglés se conserva para evitar instrucciones incompletas.

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

Live API evidence is a manual local operator procedure, not a GitHub Actions job. Ordinary CI and `pnpm test` use deterministic fixtures without provider credentials. Run the bounded live harness only with explicit authorization and disposable, low-budget provider keys.

## Live proof

From a trusted local checkout with dependencies installed, use a temporary PowerShell session. Replace the model placeholders with IDs enabled for the disposable keys. `Read-Host -MaskInput` avoids echoing keys; do not put them in command history, a `.env` file, shell profile, repository config, or logs.

```powershell
$env:OPENAI_API_KEY = Read-Host 'OpenAI API key' -MaskInput
$env:ANTHROPIC_API_KEY = Read-Host 'Anthropic API key' -MaskInput
try {
  $env:OPENAI_MODEL = 'your-enabled-openai-model'
  $env:ANTHROPIC_MODEL = 'your-enabled-anthropic-model'
  $env:BRAMBO_LIVE_API_MAX_REQUESTS = '4'
  $env:BRAMBO_LIVE_API_TIMEOUT_MS = '30000'
  $env:BRAMBO_RUN_LIVE_API_TESTS = '1'
  pnpm test:api-live
} finally {
  'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_MODEL', 'ANTHROPIC_MODEL',
    'BRAMBO_LIVE_API_MAX_REQUESTS', 'BRAMBO_LIVE_API_TIMEOUT_MS',
    'BRAMBO_RUN_LIVE_API_TESTS' | ForEach-Object { Remove-Item "Env:$_" -ErrorAction SilentlyContinue }
}
```

The runner requires both credentials and explicit models, request cap 2–4, deadline 1000–60000 ms, and opt-in. It runs providers serially with bounded requests and local tool turns. Without opt-in it skips; with opt-in but incomplete setup it fails closed. Share only redacted status, count, and cleanup evidence; never persist credentials or raw provider output.
