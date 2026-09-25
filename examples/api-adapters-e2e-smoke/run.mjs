import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const required = ['OPENAI_MODEL', 'ANTHROPIC_MODEL', 'OPENCODE_MODEL']
const boundedInteger = (value, minimum, maximum) => /^\d+$/.test(value ?? '') && Number(value) >= minimum && Number(value) <= maximum

export function createSmokePlan(env) {
  if (env.BRAMBO_RUN_LIVE_API_TESTS !== '1') throw new Error('BRAMBO_RUN_LIVE_API_TESTS=1 is required')
  for (const name of required) if (!env[name]?.trim()) throw new Error(`${name} is required`)
  if (!boundedInteger(env.BRAMBO_LIVE_API_MAX_REQUESTS, 2, 4)) throw new Error('BRAMBO_LIVE_API_MAX_REQUESTS must be an integer from 2 to 4')
  if (!boundedInteger(env.BRAMBO_LIVE_API_TIMEOUT_MS, 1000, 60000)) throw new Error('BRAMBO_LIVE_API_TIMEOUT_MS must be an integer from 1000 to 60000')
  return { maxRequests: Number(env.BRAMBO_LIVE_API_MAX_REQUESTS), timeoutMs: Number(env.BRAMBO_LIVE_API_TIMEOUT_MS) }
}

function assertNonEmptyResult(provider, result) {
  if (result.status !== 'ok') throw new Error(`${provider} returned status=${result.status}`)
  const answer = typeof result.data === 'object' && result.data !== null ? result.data.result : undefined
  if (typeof answer !== 'string' || answer.trim().length === 0) throw new Error(`${provider} returned no meaningful answer`)
}

export async function runOpenCode(plan) {
  if (!process.env.OPENCODE_API_KEY?.trim()) throw new Error('OPENCODE_API_KEY is required')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), plan.timeoutMs)
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const config = resolve(fileURLToPath(new URL('.', import.meta.url)), 'opencode.json')
  try {
    const { createOpenCodeAdapter } = await import(pathToFileURL(resolve(root, 'packages/adapter-cli/dist/index.js')).href)
    const adapter = createOpenCodeAdapter({
      extraArgs: ['--model', process.env.OPENCODE_MODEL],
      env: { OPENCODE_API_KEY: process.env.OPENCODE_API_KEY, OPENCODE_CONFIG: config },
    })
    const result = await adapter.run({
      prompt: 'Reply with exactly: BRAMBO_OPENCODE_OK',
      workspace: { id: 'api-adapters-e2e-smoke', rootPath: root, capabilities: ['read'] },
      signal: controller.signal,
    })
    assertNonEmptyResult('opencode', result)
    const data = result.data
    const usage = typeof data === 'object' && data !== null && typeof data.usage === 'number' ? data.usage : 'not-reported'
    console.log(`LIVE_EVIDENCE opencode status=ok model=${process.env.OPENCODE_MODEL} usage=${usage}`)
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  const plan = createSmokePlan(process.env)
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const api = spawnSync('pnpm', ['test:api-live'], { cwd: root, env: process.env, encoding: 'utf8', timeout: plan.timeoutMs * 2 + 15000, maxBuffer: 1024 * 1024, shell: process.platform === 'win32' })
  if (api.error || api.status !== 0) throw new Error(`official API smoke failed (exit ${api.status ?? 'timeout'})`)
  for (const line of `${api.stdout}\n${api.stderr}`.split(/\r?\n/)) if (line.startsWith('LIVE_')) console.log(line)
  await runOpenCode(plan)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(`LIVE_SMOKE_FAILED ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})