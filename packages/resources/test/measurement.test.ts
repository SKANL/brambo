import { describe, expect, it } from 'vitest'
import { classifyWorktree, reclaimIdentity, uniqueBytes } from '../src/index.ts'

describe('uniqueBytes', () => {
  it('counts a single-link file in full', () => {
    expect(uniqueBytes([{ size: 100, linkCount: 1 }])).toBe(100)
  })

  it('charges each link an equal share of one inode', () => {
    expect(uniqueBytes([{ size: 100, linkCount: 4 }])).toBe(25)
  })

  it('never counts one inode twice when several of its names are measured', () => {
    const sameName = { size: 100, linkCount: 4 }
    expect(uniqueBytes([sameName, sameName, sameName, sameName])).toBe(100)
  })

  it('sums across files with different link counts', () => {
    expect(
      uniqueBytes([
        { size: 100, linkCount: 1 },
        { size: 300, linkCount: 3 },
        { size: 0, linkCount: 1 },
      ]),
    ).toBe(200)
  })

  it('treats an impossible zero link count as one link rather than dropping bytes', () => {
    expect(uniqueBytes([{ size: 40, linkCount: 0 }])).toBe(40)
  })

  it('floors a fractional link count', () => {
    expect(uniqueBytes([{ size: 100, linkCount: 2.9 }])).toBe(50)
  })

  it('returns zero for an empty measurement', () => {
    expect(uniqueBytes([])).toBe(0)
  })

  it('rejects a negative size instead of under-reporting', () => {
    expect(() => uniqueBytes([{ size: -1, linkCount: 1 }])).toThrow(RangeError)
  })
})

describe('classifyWorktree', () => {
  it('classifies a clean worktree whose commit is on a remote as reclaimable', () => {
    expect(
      classifyWorktree({ dirtyPaths: 0, unpushedCommits: 0, commitReachableFromRemote: true }),
    ).toBe('reclaimable')
  })

  it('never reclaims a worktree with any dirty path', () => {
    expect(
      classifyWorktree({ dirtyPaths: 1, unpushedCommits: 0, commitReachableFromRemote: true }),
    ).toBe('needs-review')
  })

  it('never reclaims a worktree with any unpushed commit', () => {
    expect(
      classifyWorktree({ dirtyPaths: 0, unpushedCommits: 1, commitReachableFromRemote: true }),
    ).toBe('needs-review')
  })

  it('never reclaims a commit that no remote can reach', () => {
    expect(
      classifyWorktree({ dirtyPaths: 0, unpushedCommits: 0, commitReachableFromRemote: false }),
    ).toBe('needs-review')
  })

  it('rejects a negative count instead of guessing', () => {
    expect(() =>
      classifyWorktree({ dirtyPaths: -1, unpushedCommits: 0, commitReachableFromRemote: true }),
    ).toThrow(RangeError)
  })
})

describe('reclaimIdentity', () => {
  it('composes repository and worktree id', () => {
    expect(reclaimIdentity({ repositoryPath: '/srv/repo', worktreeId: 'w-1' })).toBe('/srv/repo::w-1')
  })

  it('ignores trailing separators in either direction', () => {
    expect(reclaimIdentity({ repositoryPath: '/srv/repo/', worktreeId: 'w-1' })).toBe('/srv/repo::w-1')
    expect(reclaimIdentity({ repositoryPath: 'C:\\work\\repo\\', worktreeId: 'w-1' })).toBe(
      'C:\\work\\repo::w-1',
    )
  })

  it('separates worktrees that share a directory name in different repositories', () => {
    const first = reclaimIdentity({ repositoryPath: '/a/repo', worktreeId: 'v040-integraciones' })
    const second = reclaimIdentity({ repositoryPath: '/b/repo', worktreeId: 'v040-integraciones' })
    expect(first).not.toBe(second)
  })

  it('is stable for the same repository and id', () => {
    expect(reclaimIdentity({ repositoryPath: '/srv/repo', worktreeId: 'w-1' })).toBe(
      reclaimIdentity({ repositoryPath: '/srv/repo/', worktreeId: 'w-1' }),
    )
  })

  it('rejects an empty repository or id', () => {
    expect(() => reclaimIdentity({ repositoryPath: '', worktreeId: 'w-1' })).toThrow(TypeError)
    expect(() => reclaimIdentity({ repositoryPath: '/srv/repo', worktreeId: '' })).toThrow(TypeError)
  })

  it('rejects a repository path made only of separators', () => {
    expect(() => reclaimIdentity({ repositoryPath: '///', worktreeId: 'w-1' })).toThrow(TypeError)
  })
})
