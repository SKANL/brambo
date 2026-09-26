import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
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

function runDirectSuite(provider, overrides) {
  const root = fileURLToPath(new URL(`../packages/adapter-${provider}/`, import.meta.url))
  const preload = pathToFileURL(fileURLToPath(new URL('./live-api-no-network.test-helper.mjs', import.meta.url))).href
  return spawnSync(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', `test/${provider}-live.test.ts`], {
    cwd: root,
    env: { ...process.env, ...ready, ...overrides, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${preload}`.trim() },
    encoding: 'utf8', timeout: 60000,
  })
}

test('direct live suites skip safely when opt-in is absent', () => {
  for (const provider of ['openai', 'anthropic']) {
    const child = runDirectSuite(provider, { BRAMBO_RUN_LIVE_API_TESTS: '0' })
    assert.equal(child.status, 0, child.stderr)
    assert.match(child.stdout, /1 skipped/)
    assert.doesNotMatch(`${child.stdout}${child.stderr}`, /NETWORK_CALL_FORBIDDEN/)
  }
})

test('direct live suites fail closed for every missing shared credential or model', () => {
  for (const provider of ['openai', 'anthropic']) {
    for (const missing of ['OPENAI_API_KEY', 'OPENAI_MODEL', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL']) {
      const child = runDirectSuite(provider, { [missing]: '' })
      const output = `${child.stdout}${child.stderr}`
      assert.notEqual(child.status, 0, `${provider} missing ${missing} unexpectedly passed`)
      assert.match(output, new RegExp(missing), `${provider} did not diagnose ${missing}`)
      assert.doesNotMatch(output, /NETWORK_CALL_FORBIDDEN/, `${provider} attempted provider I/O while ${missing} was missing`)
    }
  }
})

test('direct live suites fail closed when shared request or timeout bounds are invalid', () => {
  for (const provider of ['openai', 'anthropic']) {
    for (const overrides of [
      { BRAMBO_LIVE_API_MAX_REQUESTS: '0' },
      { BRAMBO_LIVE_API_TIMEOUT_MS: '999999' },
    ]) {
      const child = runDirectSuite(provider, overrides)
      const output = `${child.stdout}${child.stderr}`
      assert.notEqual(child.status, 0, `${provider} accepted invalid live bounds`)
      assert.match(output, /bounded request and timeout limits/)
      assert.doesNotMatch(output, /NETWORK_CALL_FORBIDDEN/)
    }
  }
})

test('direct live suites reject non-decimal bounds before transport', () => {
  for (const provider of ['openai', 'anthropic']) {
    for (const overrides of [
      { BRAMBO_LIVE_API_MAX_REQUESTS: '2e0' },
      { BRAMBO_LIVE_API_TIMEOUT_MS: '3e4' },
    ]) {
      const child = runDirectSuite(provider, overrides)
      const output = `${child.stdout}${child.stderr}`
      assert.notEqual(child.status, 0, `${provider} accepted a non-decimal live bound`)
      assert.match(output, /bounded request and timeout limits/)
      assert.doesNotMatch(output, /NETWORK_CALL_FORBIDDEN/)
    }
  }
})

test('complete fake setup reaches blocked transport, not fixture initialization failure', () => {
  for (const provider of ['openai', 'anthropic']) {
    const child = runDirectSuite(provider, {})
    const output = `${child.stdout}${child.stderr}`
    assert.notEqual(child.status, 0, `${provider} unexpectedly completed against blocked transport`)
    assert.match(output, /NETWORK_CALL_FORBIDDEN/, `${provider} did not reach the fetch boundary`)
    assert.doesNotMatch(output, /strict function objects require every property/)
  }
})
