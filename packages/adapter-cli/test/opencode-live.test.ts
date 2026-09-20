import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { WorkspaceHandle } from '@brambodev/contracts'
import { createNodeChildSpawner, createOpenCodeAdapter } from '../src/index.ts'

// This is the only opt-in live executor harness for the integrated brambo plan.
// It never probes or falls back to another vendor. The model identifier must be
// fixed explicitly so a configured OpenCode default cannot silently change the
// evidence. Never replace this with a provider alias or another vendor model.
const REQUIRED_MODEL = 'opencode-go/deepseek-v4.1-flash'
const TIMEOUT_MS = 120_000

describe('live OpenCode DeepSeek V4.1 Flash harness', () => {
  it('runs only when explicitly enabled and the exact required model is available', async (ctx) => {
    if (process.env['BRAMBO_LIVE_OPENCODE'] !== '1') {
      ctx.skip('set BRAMBO_LIVE_OPENCODE=1 to opt into the OpenCode live check')
    }
    if (process.env['BRAMBO_OPENCODE_MODEL'] !== undefined && process.env['BRAMBO_OPENCODE_MODEL'] !== REQUIRED_MODEL) {
      ctx.skip(`BRAMBO_OPENCODE_MODEL must be ${REQUIRED_MODEL}; no model alias or fallback is inferred`)
    }

    const probe = createNodeChildSpawner().spawn('opencode', ['--version'], { cwd: tmpdir() })
    probe.endStdin()
    const version = await Promise.race([
      probe.done,
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 15_000)),
    ])
    if (version === undefined) {
      probe.killTree()
      ctx.skip('opencode --version did not become available within 15 seconds')
      return
    }
    if (version.spawnErrorMessage !== undefined || version.exitCode !== 0) {
      ctx.skip(`external blocker: OpenCode unavailable: ${version.spawnErrorMessage ?? `exit ${version.exitCode}`}`)
      return
    }

    const modelsProbe = createNodeChildSpawner().spawn('opencode', ['models'], { cwd: tmpdir() })
    modelsProbe.endStdin()
    const models = await Promise.race([
      modelsProbe.done,
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 15_000)),
    ])
    if (models === undefined) {
      modelsProbe.killTree()
      ctx.skip('external blocker: `opencode models` did not become available within 15 seconds')
      return
    }
    if (models.spawnErrorMessage !== undefined || models.exitCode !== 0) {
      ctx.skip(`external blocker: cannot enumerate OpenCode models: ${models.spawnErrorMessage ?? `exit ${models.exitCode}`}`)
      return
    }
    if (!models.stdout.split(/\r?\n/).some((model) => model.trim() === REQUIRED_MODEL)) {
      ctx.skip(`external blocker: OpenCode does not list the required model ${REQUIRED_MODEL}`)
      return
    }

    const root = await mkdtemp(join(tmpdir(), 'brambo-opencode-live-'))
    try {
      const workspace: WorkspaceHandle = { id: 'opencode-live', rootPath: root, capabilities: ['read', 'write'] }
      const envelope = await createOpenCodeAdapter({
        extraArgs: ['--model', REQUIRED_MODEL],
      }).run({
        prompt: 'Reply with exactly the word ok and nothing else. Do not create or modify any file.',
        workspace,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      expect(envelope.status).toBe('ok')
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {})
    }
  }, TIMEOUT_MS + 20_000)
})
