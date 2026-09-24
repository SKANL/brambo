import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { planLiveApiRun, redactLiveOutput } from './live-api-guard.mjs'

const ready = {
  BRAMBO_RUN_LIVE_API_TESTS: '1',
  BRAMBO_LIVE_API_MAX_REQUESTS: '4',
  BRAMBO_LIVE_API_TIMEOUT_MS: '30000',
  OPENAI_API_KEY: 'openai-private',
  OPENAI_MODEL: 'explicit-openai-model',
  ANTHROPIC_API_KEY: 'anthropic-private',
  ANTHROPIC_MODEL: 'explicit-anthropic-model',
}

test('live runner refuses without opt-in even with credentials', () => {
  assert.match(planLiveApiRun({ ...ready, BRAMBO_RUN_LIVE_API_TESTS: '0' }).reason, /BRAMBO_RUN_LIVE_API_TESTS=1/)
})

test('live runner refuses missing provider credentials and models', () => {
  assert.match(planLiveApiRun({ ...ready, ANTHROPIC_API_KEY: '' }).reason, /ANTHROPIC_API_KEY/)
  assert.match(planLiveApiRun({ ...ready, OPENAI_MODEL: '' }).reason, /OPENAI_MODEL/)
})

test('live runner requires bounded positive request and deadline limits', () => {
  assert.match(planLiveApiRun({ ...ready, BRAMBO_LIVE_API_MAX_REQUESTS: '0' }).reason, /BRAMBO_LIVE_API_MAX_REQUESTS/)
  assert.match(planLiveApiRun({ ...ready, BRAMBO_LIVE_API_MAX_REQUESTS: '1' }).reason, /BRAMBO_LIVE_API_MAX_REQUESTS/)
  assert.match(planLiveApiRun({ ...ready, BRAMBO_LIVE_API_MAX_REQUESTS: '100' }).reason, /BRAMBO_LIVE_API_MAX_REQUESTS/)
  assert.match(planLiveApiRun({ ...ready, BRAMBO_LIVE_API_TIMEOUT_MS: '999999' }).reason, /BRAMBO_LIVE_API_TIMEOUT_MS/)
  assert.equal(planLiveApiRun(ready).run, true)
})

test('live output redacts both credentials', () => {
  assert.equal(redactLiveOutput('openai-private anthropic-private', ready), '[REDACTED] [REDACTED]')
})

test('entrypoint skips before provider imports when opt-in is absent', () => {
  const child = spawnSync(process.execPath, [fileURLToPath(new URL('./run-api-adapter-live-tests.mjs', import.meta.url))], {
    env: { ...process.env, ...ready, BRAMBO_RUN_LIVE_API_TESTS: '0' }, encoding: 'utf8', timeout: 5000,
  })
  assert.equal(child.status, 0)
  assert.match(child.stdout, /Skipped: set BRAMBO_RUN_LIVE_API_TESTS=1/)
  assert.doesNotMatch(child.stdout, /openai-private|anthropic-private/)
})

test('entrypoint fails closed for a missing credential after opt-in', () => {
  const child = spawnSync(process.execPath, [fileURLToPath(new URL('./run-api-adapter-live-tests.mjs', import.meta.url))], {
    env: { ...process.env, ...ready, ANTHROPIC_API_KEY: '' }, encoding: 'utf8', timeout: 5000,
  })
  assert.equal(child.status, 2)
  assert.match(child.stdout, /ANTHROPIC_API_KEY/)
  assert.doesNotMatch(child.stdout, /openai-private/)
})
