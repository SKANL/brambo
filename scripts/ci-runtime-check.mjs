import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

/** SQLite-backed qualification runs in the full supported-runtime lanes, never as skipped tests. */
export function sourceCheckPlan(version) {
  const [major, minor] = version.split('.').map(Number)
  if (major > 24 || major === 24 && minor >= 15) return [['pnpm', 'check']]
  return [
    ['node', 'scripts/check-source-bytes.mjs'],
    ['pnpm', 'typecheck'],
    ['pnpm', '-r', '--filter', '!@brambodev/workflow-store-sqlite', '--filter', '!@brambodev/workflow-coordinator', 'test'],
    ['pnpm', '--filter', '@brambodev/workflow-coordinator', 'test',
      '--exclude', 'test/configuration-replay.test.ts',
      '--exclude', 'test/durable-cli-restart.test.ts',
      '--exclude', 'test/multi-device.test.ts'],
    ['node', '--conditions=brambo-source', 'scripts/sqlite-unavailable-contract.mjs'],
    ['node', '--test', 'scripts/live-api-guard.test.mjs', 'scripts/ci-runtime-check.test.mjs', 'scripts/release-version-guard.test.mjs'],
    ['pnpm', 'lint'],
  ]
}

export function runSourceChecks(version = process.versions.node) {
  for (const [command, ...args] of sourceCheckPlan(version)) {
    console.log(`Checking Node ${version}: ${command} ${args.join(' ')}`)
    const result = spawnSync(command === 'node' ? process.execPath : command, args, {
      stdio: 'inherit', shell: process.platform === 'win32' && command === 'pnpm',
    })
    if (result.error) throw result.error
    if (result.status !== 0) return result.status ?? 1
  }
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runSourceChecks()
}
