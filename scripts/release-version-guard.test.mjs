import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'

const guard = fileURLToPath(new URL('./release-version-guard.mjs', import.meta.url))
test('release dispatch has only the required job-scoped token permissions', () => {
  const workflow = readFileSync(new URL('../.github/workflows/changesets.yml', import.meta.url), 'utf8').replaceAll('\r\n', '\n')
  const root = workflow.match(/^permissions:\n((?: {2}[^\n]*\n)+)/m)?.[1]
  const job = workflow.match(/^ {4}permissions:\n((?: {6}[^\n]*\n)+)/m)?.[1]
  assert.equal(root, '  contents: read\n', 'no global write permission')
  const permissions = Object.fromEntries((job ?? '').trim().split('\n').map(line => line.trim().split(/:\s*/)))
  assert.deepEqual(permissions, { contents: 'write', 'pull-requests': 'write', actions: 'write' })
  assert.match(workflow, /gh workflow run release\.yml --ref "\$\{tag\}"/)
})

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'brambo-release-guard-'))
  t.after(() => {
    assert.ok(resolve(dir).startsWith(resolve(join(tmpdir(), 'brambo-release-guard-'))))
    rmSync(dir, { recursive: true, force: true })
  })
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-q')
  git('config', 'user.name', 'Release Fixture')
  git('config', 'user.email', 'release-fixture@example.invalid')
  git('config', 'core.hooksPath', '.git/no-hooks')
  git('config', 'commit.gpgsign', 'false')
  for (const path of ['scripts', '.changeset', 'packages/contracts/src', 'packages/cli']) mkdirSync(join(dir, path), { recursive: true })
  const write = (path, value) => writeFileSync(join(dir, path), typeof value === 'string' ? value : JSON.stringify(value))
  write('scripts/publishable-packages.json', ['contracts', 'cli'])
  write('.changeset/config.json', { fixed: [['@brambodev/contracts', '@brambodev/cli']] })
  const version = value => {
    for (const name of ['contracts', 'cli']) write(`packages/${name}/package.json`, { name: `@brambodev/${name}`, version: value })
    write('packages/contracts/src/index.ts', `export const BRAMBO_VERSION = '${value}'\n`)
  }
  const commit = () => { git('add', '.'); git('commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD') }
  const run = (sha, tag) => spawnSync(process.execPath, [guard, ...(sha ? [sha] : []), ...(tag ? [tag] : [])], {
    cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT },
  })
  version('0.4.0')
  const base = commit()
  return { git, write, version, commit, run, base, dir }
}

test('unchanged immutable main version ignores the generated Changesets working tree', t => {
  const f = fixture(t)
  f.write('README.md', 'Preparation only')
  const head = f.commit()
  f.version('0.5.0')
  const result = f.run(head)
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), { ready: false, reason: 'unchanged', version: '0.4.0', commit: head })
  assert.equal(JSON.parse(readFileSync(join(f.dir, 'packages/contracts/package.json'), 'utf8')).version, '0.5.0')
  assert.equal(f.git('tag', '--list'), '', 'read-only guard never creates tags')
})

test('a real committed version advance binds the release to that exact commit', t => {
  const f = fixture(t)
  f.version('0.5.0')
  const head = f.commit()
  f.version('9.9.9')
  const result = f.run(head)
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), { ready: true, reason: 'version-advanced', version: '0.5.0', commit: head })
})

for (const [label, mutate] of [
  ['package disagreement', f => f.write('packages/cli/package.json', { name: '@brambodev/cli', version: '0.4.0' })],
  ['literal disagreement', f => f.write('packages/contracts/src/index.ts', "export const BRAMBO_VERSION = '0.4.0'\n")],
  ['empty roster', f => f.write('scripts/publishable-packages.json', [])],
  ['fixed set disagreement', f => f.write('.changeset/config.json', { fixed: [['@brambodev/contracts']] })],
  ['private package', f => f.write('packages/cli/package.json', { name: '@brambodev/cli', version: '0.5.0', private: true })],
]) test(`fails closed on ${label}`, t => {
  const f = fixture(t)
  f.version('0.5.0')
  mutate(f)
  assert.notEqual(f.run(f.commit()).status, 0)
  assert.equal(f.git('tag', '--list'), '')
})

for (const value of ['0.3.0', '0.4.0+metadata', '01.5.0', 'not-semver']) test(`refuses non-advancing or invalid version ${value}`, t => {
  const f = fixture(t)
  f.version(value)
  assert.notEqual(f.run(f.commit()).status, 0)
})

test('prerelease advancement and stable promotion follow semver precedence', t => {
  const f = fixture(t)
  for (const value of ['0.5.0-rc.1', '0.5.0-rc.2', '0.5.0']) {
    f.version(value)
    const result = f.run(f.commit())
    assert.equal(result.status, 0, result.stderr)
    assert.equal(JSON.parse(result.stdout).ready, true)
  }
})

test('an existing annotated tag must bind exactly the immutable release commit', t => {
  const f = fixture(t)
  f.version('0.5.0')
  const head = f.commit()
  f.git('tag', '-a', 'v0.5.0', '-m', 'fixture', head)
  const correct = f.run(head, f.git('rev-parse', 'v0.5.0'))
  assert.equal(correct.status, 0, correct.stderr)
  assert.deepEqual(JSON.parse(correct.stdout), { ready: false, reason: 'already-tagged', version: '0.5.0', commit: head })
  f.git('tag', '-a', 'wrong', '-m', 'fixture', f.base)
  const wrong = f.run(head, f.git('rev-parse', 'wrong'))
  assert.notEqual(wrong.status, 0)
  assert.match(wrong.stderr, /existing release tag does not match/)
  assert.equal(f.git('rev-parse', 'wrong^{}'), f.base, 'guard never retags')
})

test('missing, unknown, abbreviated and root revisions fail closed', t => {
  const f = fixture(t)
  for (const sha of [undefined, 'f'.repeat(40), f.base.slice(0, 8), f.base]) assert.notEqual(f.run(sha).status, 0)
})

function runWorkflow(f, head, remotePolicy) {
  const workflow = readFileSync(new URL('../.github/workflows/changesets.yml', import.meta.url), 'utf8').replaceAll('\r\n', '\n')
  const block = workflow.match(/ {6}- name: Create release tag[^\n]*\n[\s\S]*? {8}run: \|\n([\s\S]*?)\n {8}env:/)?.[1]
  assert.ok(block, 'release automation must expose its executable tag step')
  const step = block.split('\n').map(line => line.replace(/^ {10}/, '')).join('\n')
  return spawnSync(process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash', ['-c', remotePolicy + step], {
    cwd: f.dir, encoding: 'utf8', env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, GITHUB_SHA: head },
  })
}

test('actual preparation workflow exits before tag or dispatch despite generated working-tree versions', t => {
  const f = fixture(t)
  f.write('README.md', 'Preparation only')
  const head = f.commit()
  f.version('0.5.0')
  f.write('scripts/release-version-guard.mjs', readFileSync(guard, 'utf8'))
  // No real remote command can run, even if the guard regresses.
  const blockedRemote = 'git() { case "$1" in ls-remote|fetch|push) echo "unexpected remote operation" >&2; return 1;; *) command git "$@";; esac; }; gh() { echo "unexpected release dispatch" >&2; return 1; };\n'
  const result = runWorkflow(f, head, blockedRemote)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(f.git('tag', '--list'), '', 'preparation never creates a release tag')
  assert.doesNotMatch(result.stderr, /unexpected remote operation|unexpected release dispatch/)
})

for (const correct of [false, true]) test('actual workflow validates an existing tag target: ' + correct, t => {
  const f = fixture(t)
  f.version('0.5.0')
  const head = f.commit()
  f.write('scripts/release-version-guard.mjs', readFileSync(guard, 'utf8'))
  f.git('tag', '-a', 'v0.5.0', '-m', 'fixture', correct ? head : f.base)
  const object = f.git('rev-parse', 'v0.5.0')
  const remotePolicy = 'git() { case "$1" in ls-remote) return 0;; fetch) printf "' + object + '\\t\\tfixture\\n" > .git/FETCH_HEAD;; push) echo "unexpected remote operation" >&2; return 1;; *) command git "$@";; esac; }; gh() { echo "unexpected release dispatch" >&2; return 1; };\n'
  const result = runWorkflow(f, head, remotePolicy)
  if (correct) assert.equal(result.status, 0, result.stderr)
  else { assert.notEqual(result.status, 0); assert.match(result.stderr, /existing release tag does not match/) }
  assert.equal(f.git('rev-parse', 'v0.5.0^{}'), correct ? head : f.base)
  assert.doesNotMatch(result.stderr, /unexpected remote operation|unexpected release dispatch/)
})

test('undeclared publishable manifests cannot escape the fixed release validation', t => {
  const f = fixture(t)
  f.version('0.5.0')
  mkdirSync(join(f.dir, 'packages/extra'))
  f.write('packages/extra/package.json', { name: '@brambodev/extra', version: '0.4.0' })
  const result = f.run(f.commit())
  assert.notEqual(result.status, 0)
  assert.equal(f.git('tag', '--list'), '')
})

test('actual workflow binds an advanced release tag and dispatch to immutable main, not generated HEAD', t => {
  const f = fixture(t)
  f.version('0.5.0')
  const head = f.commit()
  f.git('checkout', '-qb', 'generated-release')
  f.version('9.9.9')
  f.commit()
  f.write('scripts/release-version-guard.mjs', readFileSync(guard, 'utf8'))
  const remotePolicy = 'git() { case "$1" in ls-remote) return 2;; fetch) return 1;; push) printf "%s\\n" "$*" > push-proof; return 0;; *) command git "$@";; esac; }; gh() { printf "%s\\n" "$*" > dispatch-proof; };\n'
  const result = runWorkflow(f, head, remotePolicy)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(f.git('rev-parse', 'v0.5.0^{}'), head)
  assert.equal(f.git('tag', '--list'), 'v0.5.0')
  assert.equal(readFileSync(join(f.dir, 'push-proof'), 'utf8').trim(), 'push origin v0.5.0')
  assert.equal(readFileSync(join(f.dir, 'dispatch-proof'), 'utf8').trim(), 'workflow run release.yml --ref v0.5.0')
})

test('actual workflow stops before tag creation when remote lookup is unavailable', t => {
  const f = fixture(t)
  f.version('0.5.0')
  const head = f.commit()
  f.write('scripts/release-version-guard.mjs', readFileSync(guard, 'utf8'))
  const remotePolicy = 'git() { case "$1" in ls-remote) return 128;; fetch|push) echo "unexpected remote operation" >&2; return 1;; *) command git "$@";; esac; }; gh() { echo "unexpected release dispatch" >&2; return 1; };\n'
  const result = runWorkflow(f, head, remotePolicy)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Cannot verify existing release tag/)
  assert.equal(f.git('tag', '--list'), '')
  assert.doesNotMatch(result.stderr, /unexpected remote operation|unexpected release dispatch/)
})

test('the actual Changesets checkout supplies immutable first-parent history to the guard', t => {
  const f = fixture(t)
  f.write('README.md', 'Preparation only')
  const head = f.commit()
  const workflow = readFileSync(new URL('../.github/workflows/changesets.yml', import.meta.url), 'utf8').replaceAll('\r\n', '\n')
  const checkout = workflow.match(/- uses: actions\/checkout@[^\n]*\n([\s\S]*?)(?= {6}-)/)?.[1] ?? ''
  const depth = Number(checkout.match(/fetch-depth:\s*(\d+)/)?.[1] ?? '1')
  const destination = join(f.dir, 'checkout-fixture')
  execFileSync('git', ['clone', '-q', ...(depth === 0 ? [] : ['--depth', String(depth)]), pathToFileURL(f.dir).href, destination], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  })
  const result = spawnSync(process.execPath, [guard, head], { cwd: destination, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).reason, 'unchanged')
})
