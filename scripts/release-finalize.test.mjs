import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { test } from 'node:test'

const workflowUrl = new URL('../.github/workflows/release-finalize.yml', import.meta.url)
const verifierUrl = new URL('./release-finalize.mjs', import.meta.url)
const workflow = existsSync(workflowUrl) ? readFileSync(workflowUrl, 'utf8').replaceAll('\r\n', '\n') : ''
const verifier = existsSync(verifierUrl) ? await import(verifierUrl) : {}

test('finalization workflow exists without any npm publication authority', () => {
  assert.match(workflow, /name: Release Finalization/)
  assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN|id-token|environment:|\bpublish\b|npm (?:unpublish|dist-tag)/)
  assert.match(workflow, /contents: write/)
  assert.match(workflow, /cancel-in-progress: false/)
})

test('finalization checks immutable existing tag before all unchanged functional gates', () => {
  assert.match(workflow, /git rev-parse "refs\/tags\/\$TAG\^\{\}"/)
  assert.match(workflow, /git merge-base --is-ancestor "\$TARGET" origin\/main/)
  assert.match(workflow, /git checkout --detach "\$TARGET"/)
  for (const gate of ['pnpm check', 'pnpm build', 'pack-publishable.mjs', 'consumer-smoke.mjs', 'pnpm proof:consumer-install']) assert.ok(workflow.includes(gate), gate)
  assert.ok(workflow.indexOf('release-finalize.mjs') < workflow.indexOf('gh release create'))
  assert.match(workflow, /--verify-tag/)
})

test('registry validator requires exact identity, latest and integrity', () => {
  assert.equal(typeof verifier.validateRegistryManifest, 'function')
  const expected = { name: '@brambodev/contracts', version: '0.5.0' }
  const valid = { name: expected.name, 'dist-tags': { latest: '0.5.0' }, versions: { '0.5.0': { ...expected, dist: { tarball: 'https://registry.npmjs.org/@brambodev/contracts/-/contracts-0.5.0.tgz', integrity: 'sha512-aGVsbG8=' } } } }
  assert.equal(verifier.validateRegistryManifest(valid, expected).version, '0.5.0')
  for (const bad of [{}, { ...valid, name: 'wrong' }, { ...valid, 'dist-tags': { latest: '0.4.0' } }, { ...valid, versions: {} }]) assert.throws(() => verifier.validateRegistryManifest(bad, expected))
  assert.throws(() => verifier.validateRegistryManifest({ ...valid, versions: { '0.5.0': { ...expected, dist: { tarball: 'https://example.invalid/a.tgz', integrity: 'sha512-aGVsbG8=' } } } }, expected))
})

test('registry visibility retries are bounded and never interpret empty or error metadata as success', async () => {
  assert.equal(typeof verifier.readRegistry, 'function')
  let calls = 0
  await assert.rejects(verifier.readRegistry('example', { attempts: 2, query: async () => { calls++; throw new Error('404') }, sleep: async () => {} }), /404/)
  assert.equal(calls, 2)
  calls = 0
  const result = await verifier.readRegistry('example', { attempts: 2, query: async () => { if (++calls === 1) throw new Error('404'); return { name: 'example' } }, sleep: async () => {} })
  assert.deepEqual(result, { name: 'example' })
})

test('actual finalization command stops before GitHub mutation when registry verification fails', async () => {
  const { spawnSync } = await import('node:child_process')
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash'
  const create = workflow.match(/- name: Create existing-tag[\s\S]*?run: \|\n([\s\S]*)$/)?.[1].split('\n').map(line => line.replace(/^ {10}/, '')).join('\n')
  assert.ok(create)
  const registryCommand = workflow.match(/run: (node "\$RUNNER_TEMP\/release-finalize\.mjs" "\$TAG")/)?.[1]
  assert.ok(registryCommand)
  const result = spawnSync(bash, ['-c', `set -euo pipefail\nnode() { echo 'registry rejected' >&2; return 1; }; gh() { echo 'UNEXPECTED_GITHUB_MUTATION' >&2; return 0; };\n${registryCommand}\n${create}`], {
    encoding: 'utf8', env: { ...process.env, TAG: 'v0.5.0', RUNNER_TEMP: '/tmp', GITHUB_REPOSITORY: 'fixture/repo' },
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /registry rejected/)
  assert.doesNotMatch(result.stderr, /UNEXPECTED_GITHUB_MUTATION/)
})

test('actual immutable-tag binding rejects invalid tag before any git operation', async () => {
  const { spawnSync } = await import('node:child_process')
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash'
  const binding = workflow.match(/- name: Bind verifier[\s\S]*?run: \|\n([\s\S]*?)(?= {6}- uses:)/)?.[1].split('\n').map(line => line.replace(/^ {10}/, '')).join('\n')
  assert.ok(binding)
  const result = spawnSync(bash, ['-c', `git() { echo UNEXPECTED_GIT >&2; return 0; };\n${binding}`], { encoding: 'utf8', env: { ...process.env, TAG: '--malicious', GITHUB_REF: 'refs/heads/main' } })
  assert.notEqual(result.status, 0)
  assert.doesNotMatch(result.stderr, /UNEXPECTED_GIT/)
})

test('actual GitHub creation refuses ambiguous lookup instead of treating it as absence', async () => {
  const { spawnSync } = await import('node:child_process')
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash'
  const create = workflow.match(/- name: Create existing-tag[\s\S]*?run: \|\n([\s\S]*)$/)?.[1].split('\n').map(line => line.replace(/^ {10}/, '')).join('\n')
  const result = spawnSync(bash, ['-c', `gh() { case "$*" in *create*|*upload*) echo UNEXPECTED_GITHUB_MUTATION >&2; return 0;; *) echo 'gh: Forbidden (HTTP 403)' >&2; return 1;; esac; };\n${create}`], {
    encoding: 'utf8', env: { ...process.env, TAG: 'v0.5.0', GITHUB_REPOSITORY: 'fixture/repo' },
  })
  assert.notEqual(result.status, 0)
  assert.doesNotMatch(result.stderr, /UNEXPECTED_GITHUB_MUTATION/)
})

test('workflow verifier is bound to the immutable dispatch SHA on main', () => {
  assert.match(workflow, /ref: \$\{\{ github.sha \}\}/)
  assert.match(workflow, /test "\$GITHUB_REF" = refs\/heads\/main/)
})
