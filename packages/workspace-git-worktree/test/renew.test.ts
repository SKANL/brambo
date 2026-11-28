import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GitWorktreeWorkspaceProvider } from '../src/git-worktree-provider.ts'
import { WorktreeLedger } from '../src/ledger.ts'

let stateDir: string

beforeEach(async () => {
  stateDir = await mkdtemp(join(tmpdir(), 'brambo-renew-'))
})

afterEach(async () => {
  await rm(stateDir, { recursive: true, force: true })
})

describe('GitWorktreeWorkspaceProvider.renew', () => {
  it('stamps lastSeenAt on an owned workspace without touching the checkout', async () => {
    const provider = new GitWorktreeWorkspaceProvider({ repoPath: join(stateDir, 'repo'), stateDir })
    const ledger = new WorktreeLedger(stateDir)
    await ledger.writeRecord({
      version: 1,
      id: 'w-1',
      ordinal: 1,
      path: join(stateDir, 'trees', 'w-1'),
      repoPath: join(stateDir, 'repo'),
      createdAt: '2026-01-01T00:00:00.000Z',
    })

    const before = Date.now()
    await provider.renew('w-1')
    const record = await ledger.readRecord('w-1')
    expect(record?.lastSeenAt).toBeDefined()
    expect(Date.parse(record?.lastSeenAt ?? '')).toBeGreaterThanOrEqual(before - 1000)
    await provider.dispose()
  })

  it('refuses an id it does not own', async () => {
    const provider = new GitWorktreeWorkspaceProvider({ repoPath: join(stateDir, 'repo'), stateDir })
    await expect(provider.renew('w-404')).rejects.toThrow()
    await provider.dispose()
  })

  it('refuses a non-string id through the same coded door as acquire', async () => {
    const provider = new GitWorktreeWorkspaceProvider({ repoPath: join(stateDir, 'repo'), stateDir })
    await expect(provider.renew(null as unknown as string)).rejects.toThrow()
    await provider.dispose()
  })
})
