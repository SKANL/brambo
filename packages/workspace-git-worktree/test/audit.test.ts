import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditWorktrees, observeWorktree } from '../src/index.ts'
import { WorktreeLedger } from '../src/ledger.ts'

const run = promisify(execFile)
const HOUR = 60 * 60 * 1000

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const { stdout } = await run('git', [...args], { cwd, windowsHide: true })
  return stdout.trim()
}

let root: string
let repo: string
let stateDir: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), `brambo-audit-${process.pid}-${Date.now()}-`))
  const bare = join(root, 'remote.git')
  repo = join(root, 'repo')
  stateDir = join(root, 'state')

  await mkdir(bare, { recursive: true })
  await git(bare, ['init', '--bare', '--initial-branch=main'])
  await mkdir(repo, { recursive: true })
  await git(repo, ['init', '--initial-branch=main'])
  await git(repo, ['config', 'user.email', 'audit@example.test'])
  await git(repo, ['config', 'user.name', 'Audit Test'])
  await writeFile(join(repo, 'README.md'), 'baseline\n')
  await git(repo, ['add', '.'])
  await git(repo, ['commit', '-m', 'baseline'])
  await git(repo, ['remote', 'add', 'origin', bare])
  await git(repo, ['push', 'origin', 'main'])
  // The remote-tracking ref has to exist locally for `rev-list --remotes` and
  // `branch -r --contains` to see the commit as reachable.
  await git(repo, ['fetch', 'origin'])
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function addWorktree(id: string): Promise<string> {
  const path = join(root, 'trees', id)
  await mkdir(join(root, 'trees'), { recursive: true })
  await git(repo, ['worktree', 'add', '--detach', path])
  return path
}

async function record(id: string, path: string, lastSeenAt?: string): Promise<void> {
  const ledger = new WorktreeLedger(stateDir)
  await ledger.writeRecord({
    version: 1,
    id,
    ordinal: Number(id.replace(/\D/g, '')) || 1,
    path,
    repoPath: repo,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...(lastSeenAt === undefined ? {} : { lastSeenAt }),
  })
}

describe('observeWorktree', () => {
  it('reports a clean worktree whose commit a remote contains as reachable', async () => {
    const path = await addWorktree('w-1')
    const observed = await observeWorktree(path)
    expect(observed).toMatchObject({
      kind: 'observed',
      observation: { dirtyPaths: 0, unpushedCommits: 0, commitReachableFromRemote: true },
    })
  })

  it('counts a dirty path', async () => {
    const path = await addWorktree('w-1')
    await writeFile(join(path, 'untracked.txt'), 'work in progress\n')
    const observed = await observeWorktree(path)
    expect(observed.kind).toBe('observed')
    expect(observed.kind === 'observed' && observed.observation.dirtyPaths).toBeGreaterThan(0)
  })

  it('counts a commit no remote reaches', async () => {
    const path = await addWorktree('w-1')
    await writeFile(join(path, 'local.txt'), 'local only\n')
    await git(path, ['add', '.'])
    await git(path, ['commit', '-m', 'local only'])
    const observed = await observeWorktree(path)
    expect(observed.kind).toBe('observed')
    expect(observed.kind === 'observed' && observed.observation.unpushedCommits).toBe(1)
    expect(observed.kind === 'observed' && observed.observation.commitReachableFromRemote).toBe(false)
  })

  it('answers absence for a path that no longer exists', async () => {
    const observed = await observeWorktree(join(root, 'trees', 'gone'))
    expect(observed.kind).toBe('absent')
  })
})

describe('auditWorktrees', () => {
  it('never calls a held lease reclaimable even when the tree is clean', async () => {
    const path = await addWorktree('w-1')
    await record('w-1', path, new Date().toISOString())

    const audit = await auditWorktrees(stateDir, { ttlMs: HOUR, now: Date.now() })
    const entry = audit.entries.find((candidate) => candidate.record.id === 'w-1')
    expect(entry?.expiry).toBe('held')
    expect(entry?.classification).toBe('reclaimable')
    expect(audit.plan.reclaimable.map((candidate) => candidate.identity)).not.toContain(entry?.identity)
  })

  it('makes a lapsed lease on a clean reachable tree reclaimable, with a repository-scoped identity', async () => {
    const path = await addWorktree('w-1')
    await record('w-1', path, '2026-01-01T00:00:00.000Z')

    const audit = await auditWorktrees(stateDir, { ttlMs: HOUR, now: Date.parse('2026-02-01T00:00:00.000Z') })
    const entry = audit.entries.find((candidate) => candidate.record.id === 'w-1')
    expect(entry?.expiry).toBe('expired')
    expect(entry?.classification).toBe('reclaimable')
    expect(audit.plan.reclaimable.map((candidate) => candidate.identity)).toEqual([entry?.identity])
    expect(entry?.identity).toBe(`${repo}::w-1`)
  })

  it('keeps a lapsed but dirty worktree in needs-review', async () => {
    const path = await addWorktree('w-1')
    await writeFile(join(path, 'uncommitted.txt'), 'do not delete me\n')
    await record('w-1', path, '2026-01-01T00:00:00.000Z')

    const audit = await auditWorktrees(stateDir, { ttlMs: HOUR, now: Date.parse('2026-02-01T00:00:00.000Z') })
    const entry = audit.entries.find((candidate) => candidate.record.id === 'w-1')
    expect(entry?.classification).toBe('needs-review')
    expect(audit.plan.needsReview.map((candidate) => candidate.identity)).toEqual([entry?.identity])
  })

  it('reports a missing worktree as absent and never reclaimable', async () => {
    const path = await addWorktree('w-1')
    await record('w-1', path, '2026-01-01T00:00:00.000Z')
    await git(repo, ['worktree', 'remove', '--force', path])
    await rm(path, { recursive: true, force: true })

    const audit = await auditWorktrees(stateDir, { ttlMs: HOUR, now: Date.parse('2026-02-01T00:00:00.000Z') })
    const entry = audit.entries.find((candidate) => candidate.record.id === 'w-1')
    expect(entry?.measurement.kind).toBe('absent')
    expect(entry?.classification).toBe('needs-review')
  })

  it('returns one entry per owned record and a plan over all of them', async () => {
    const first = await addWorktree('w-1')
    const second = await addWorktree('w-2')
    await record('w-1', first, '2026-01-01T00:00:00.000Z')
    await record('w-2', second, new Date().toISOString())

    const audit = await auditWorktrees(stateDir, { ttlMs: HOUR, now: Date.parse('2026-02-01T00:00:00.000Z') })
    expect(audit.entries).toHaveLength(2)
    expect(audit.plan.totals.uniqueBytes).toBeGreaterThan(0)
    expect(new Set(audit.entries.map((entry) => entry.identity)).size).toBe(2)
  })
})
