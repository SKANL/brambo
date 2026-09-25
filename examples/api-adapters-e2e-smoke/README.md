# API-adapters live smoke

A deliberately tiny, non-secret project that proves Brambo's public adapters against enabled provider accounts.

Run only with explicit disposable credentials injected into a temporary local process environment. For the simpler two-provider API-only proof, follow the [manual local operator procedure](../../docs-site/docs/explanation/api-adapter-security.md) instead. This broader mini-project also exercises OpenCode and needs `OPENCODE_API_KEY` supplied through the temporary environment; never save any key to a file or shell profile.

```powershell
$env:BRAMBO_RUN_LIVE_API_TESTS = '1'
$env:BRAMBO_LIVE_API_MAX_REQUESTS = '4'
$env:BRAMBO_LIVE_API_TIMEOUT_MS = '60000'
$env:OPENAI_MODEL = 'gpt-5.6-luna'
$env:ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
$env:OPENCODE_MODEL = 'opencode-go/deepseek-v4.1-flash'
node --conditions=brambo-source examples/api-adapters-e2e-smoke/run.mjs
```

Remove all temporary key, model, limit, and opt-in variables from the shell immediately after the run. Do not copy provider output containing secrets into a report.

The OpenAI and Anthropic paths use their official Brambo providers and one approval-gated local tool turn. The OpenCode path uses Brambo's public CLI vendor adapter, a one-shot OpenCode invocation, and a config which reads its credential from `OPENCODE_API_KEY`; the credential is never persisted.
