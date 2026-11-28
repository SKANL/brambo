import { link, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scanTree } from '../src/index.ts'

let root: string

beforeEach(async () => {
  root = join(tmpdir(), `brambo-scan-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await mkdir(root, { recursive: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('scanTree', () => {
  it('reports an absent root as absence instead of failing', async () => {
    const outcome = await scanTree(join(root, 'does-not-exist'))
    expect(outcome.kind).toBe('absent')
  })

  it('measures one regular file', async () => {
    await writeFile(join(root, 'a.txt'), Buffer.alloc(1024))
    const outcome = await scanTree(root)
    expect(outcome).toMatchObject({ kind: 'measured', files: 1, logicalBytes: 1024, uniqueBytes: 1024 })
  })

  it('charges two hardlinked names one inode once', async () => {
    await writeFile(join(root, 'a.txt'), Buffer.alloc(1024))
    await link(join(root, 'a.txt'), join(root, 'b.txt'))
    const outcome = await scanTree(root)
    expect(outcome).toMatchObject({ kind: 'measured', files: 2, logicalBytes: 2048, uniqueBytes: 1024 })
  })

  it('sums nested directories', async () => {
    await mkdir(join(root, 'nested', 'deeper'), { recursive: true })
    await writeFile(join(root, 'top.txt'), Buffer.alloc(10))
    await writeFile(join(root, 'nested', 'mid.txt'), Buffer.alloc(20))
    await writeFile(join(root, 'nested', 'deeper', 'low.txt'), Buffer.alloc(30))
    const outcome = await scanTree(root)
    expect(outcome).toMatchObject({ kind: 'measured', files: 3, logicalBytes: 60, uniqueBytes: 60 })
  })

  it('reports an empty directory as zero', async () => {
    const outcome = await scanTree(root)
    expect(outcome).toMatchObject({ kind: 'measured', files: 0, logicalBytes: 0, uniqueBytes: 0 })
  })

  it('does not follow a directory junction, and counts it as skipped', async () => {
    await mkdir(join(root, 'real'), { recursive: true })
    await writeFile(join(root, 'real', 'inside.txt'), Buffer.alloc(64))
    await symlink(join(root, 'real'), join(root, 'alias'), 'junction')

    const outcome = await scanTree(root)
    // The file is counted once, through its real path. The junction is skipped,
    // never traversed, so its bytes are not counted a second time.
    expect(outcome).toMatchObject({ kind: 'measured', files: 1, logicalBytes: 64, uniqueBytes: 64 })
    expect(outcome.kind === 'measured' && outcome.skippedReparse).toBe(1)
  })

  it('terminates when a junction points back at an ancestor', async () => {
    await mkdir(join(root, 'child'), { recursive: true })
    await writeFile(join(root, 'child', 'file.txt'), Buffer.alloc(8))
    // The classic pathological shape: a link to the root inside the tree. A
    // follower recurses forever; a reparse-skipping walk sees one entry and stops.
    await symlink(root, join(root, 'child', 'loop'), 'junction')

    const outcome = await scanTree(root)
    expect(outcome).toMatchObject({ kind: 'measured', files: 1, logicalBytes: 8, uniqueBytes: 8 })
    expect(outcome.kind === 'measured' && outcome.skippedReparse).toBe(1)
  })
})
