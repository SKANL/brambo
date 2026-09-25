import test from 'node:test'
import assert from 'node:assert/strict'
import { createSmokePlan } from './run.mjs'

test('requires explicit bounded live configuration without retaining credentials', () => {
  assert.throws(() => createSmokePlan({}), /BRAMBO_RUN_LIVE_API_TESTS/)
  const plan = createSmokePlan({
    BRAMBO_RUN_LIVE_API_TESTS: '1',
    OPENAI_MODEL: 'gpt-5.6-luna',
    ANTHROPIC_MODEL: 'claude-haiku-4-5-20251001',
    OPENCODE_MODEL: 'opencode-go/deepseek-v4.1-flash',
    BRAMBO_LIVE_API_MAX_REQUESTS: '4',
    BRAMBO_LIVE_API_TIMEOUT_MS: '60000',
  })
  assert.deepEqual(plan, { maxRequests: 4, timeoutMs: 60000 })
})