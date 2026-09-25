# API-adapters live smoke

A deliberately tiny, non-secret project that proves Brambo's public adapters against enabled provider accounts.

Run only with explicit disposable credentials injected into the process environment:

```powershell
$env:BRAMBO_RUN_LIVE_API_TESTS = '1'
$env:BRAMBO_LIVE_API_MAX_REQUESTS = '4'
$env:BRAMBO_LIVE_API_TIMEOUT_MS = '60000'
$env:OPENAI_MODEL = 'gpt-5.6-luna'
$env:ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
$env:OPENCODE_MODEL = 'opencode-go/deepseek-v4.1-flash'
node --conditions=brambo-source examples/api-adapters-e2e-smoke/run.mjs
```

The OpenAI and Anthropic paths use their official Brambo providers and one approval-gated local tool turn. The OpenCode path uses Brambo's public CLI vendor adapter, a one-shot OpenCode invocation, and a config which reads its credential from `OPENCODE_API_KEY`; the credential is never persisted.