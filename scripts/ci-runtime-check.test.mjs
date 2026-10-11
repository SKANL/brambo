import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

const runner = new URL('./ci-runtime-check.mjs', import.meta.url)

test('unsupported SQLite runtimes retain compatible suites and a real refusal contract', async () => {
  assert.ok(existsSync(runner), 'capability-aware CI runner must exist')
  const { sourceCheckPlan } = await import(runner.href)
  for (const version of ['22.18.0', '22.22.0', '24.14.1']) {
    const plan = sourceCheckPlan(version)
    assert.deepEqual(plan, [
      ['node', 'scripts/check-source-bytes.mjs'],
      ['pnpm', 'typecheck'],
      ['pnpm', '-r', '--filter', '!@brambodev/workflow-store-sqlite', '--filter', '!@brambodev/workflow-coordinator', 'test'],
      ['pnpm', '--filter', '@brambodev/workflow-coordinator', 'test',
        '--exclude', 'test/configuration-replay.test.ts',
        '--exclude', 'test/durable-cli-restart.test.ts',
        '--exclude', 'test/multi-device.test.ts'],
      ['node', '--conditions=brambo-source', 'scripts/sqlite-unavailable-contract.mjs'],
      ['node', '--test', 'scripts/live-api-guard.test.mjs', 'scripts/ci-runtime-check.test.mjs'],
      ['pnpm', 'lint'],
    ])
  }
})

test('supported runtimes execute the unchanged full source gate', async () => {
  assert.ok(existsSync(runner), 'capability-aware CI runner must exist')
  const { sourceCheckPlan } = await import(runner.href)
  for (const version of ['24.15.0', '24.19.0', '26.0.0']) {
    assert.deepEqual(sourceCheckPlan(version), [['pnpm', 'check']])
  }
})

