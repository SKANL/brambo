import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { planLiveApiRun, redactLiveOutput } from './live-api-guard.mjs'

const plan = planLiveApiRun(process.env)
if (!plan.run) {
  console.log(plan.reason)
  process.exit(process.env.BRAMBO_RUN_LIVE_API_TESTS === '1' ? 2 : 0)
}

const root = fileURLToPath(new URL('../', import.meta.url))
for (const provider of ['openai', 'anthropic']) {
  const other = provider === 'openai' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'
  const env = { ...process.env }
  delete env[other]
  const packageRoot = resolve(root, 'packages', `adapter-${provider}`)
  const result = spawnSync(process.execPath, [
    resolve(packageRoot, 'node_modules/vitest/vitest.mjs'), 'run', `test/${provider}-live.test.ts`, '--reporter=basic',
  ], { cwd: packageRoot, env, encoding: 'utf8', timeout: plan.timeoutMs + 5000, maxBuffer: 1024 * 1024 })
  const output = redactLiveOutput(`${result.stdout ?? ''}\n${result.stderr ?? ''}`, process.env)
  if (result.error || result.status !== 0) {
    // Do not echo provider bodies or arbitrary test failures into CI logs.
    console.error(`${provider}: live suite failed (exit ${result.status ?? 'timeout'}); inspect protected job logs locally.`)
    process.exitCode = 1
    break
  }
  // Tests print only bounded count/status/cleanup evidence; sanitize defensively.
  console.log(`${provider}: ${output.trim()}`)
}
