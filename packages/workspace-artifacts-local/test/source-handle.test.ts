import * as fs from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { fixture, namespaceDirectory } from './helpers.ts'

// Exercise no-follow fallback and POSIX nonblocking availability without passing
// invented flags to Windows. Existing suites retain native constants.
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, constants: { ...actual.constants, O_NOFOLLOW: 0, O_NONBLOCK: actual.constants.O_NONBLOCK ?? 0o4000 } }
})
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, open: vi.fn(actual.open), lstat: vi.fn(actual.lstat) }
})
const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
const nativeConstants = (await vi.importActual<typeof import('node:fs')>('node:fs')).constants
afterEach(() => { vi.restoreAllMocks(); vi.mocked(fs.open).mockImplementation(actual.open); vi.mocked(fs.lstat).mockImplementation(actual.lstat) })

// Replace exactly the source-open boundary; traversal, copying and storage stay real.
function sourceOpen(path: string, intercept: (handle: FileHandle) => Promise<void>, before?: (flags: string | number | undefined) => Promise<void>) {
  let consumed = false
  let descriptor: FileHandle | undefined
  let descriptorStat: FileHandle['stat'] | undefined
  vi.mocked(fs.open).mockImplementation(async (...args) => {
    if (args[0] !== path || consumed) return actual.open(...args)
    consumed = true
    await before?.(args[1])
    const flags = typeof args[1] === 'number' && nativeConstants.O_NONBLOCK === undefined
      ? args[1] & ~constants.O_NONBLOCK : args[1]
    descriptor = await actual.open(args[0], flags, args[2])
    descriptorStat = descriptor.stat.bind(descriptor)
    await intercept(descriptor)
    return descriptor
  })
  return async () => {
    expect(consumed).toBe(true)
    await expect(descriptorStat!()).rejects.toMatchObject({ code: 'EBADF' })
  }
}

it('source handle supplies mode and digest from the opened replacement, not the checked pathname', async () => {
  const f = await fixture()
  const path = join(f.source, 'a')
  await f.file('a', 'checked')
  await actual.chmod(path, 0o600)
  const replacement = Buffer.from('opened replacement')
  const closed = sourceOpen(path, async handle => {
    if (process.platform === 'win32') {
      const stat = handle.stat.bind(handle)
      vi.spyOn(handle, 'stat').mockImplementation((async options => {
        const opened = await stat(options)
        const mode = typeof opened.mode === 'bigint' ? (opened.mode & ~0o777n) | 0o700n : (opened.mode & ~0o777) | 0o700
        return Object.assign(opened, { mode })
      }) as FileHandle['stat'])
    }
  }, async () => {
    await actual.rename(path, join(f.root, 'checked-file'))
    await actual.writeFile(path, replacement, { mode: 0o700 })
  })
  const staged = await f.provider.stage('tenant', f.source)
  expect(staged.entries).toEqual([{ path: 'a', size: replacement.length,
    digest: 'sha256:' + createHash('sha256').update(replacement).digest('hex'), executable: true }])
  await f.provider.publish(f.ref(staged.revision), staged, f.lease)
  expect(await f.provider.read(f.ref(staged.revision), 'a')).toEqual(new Uint8Array(replacement))
  await closed()
})

it.each(['nonregular', 'nonblocking-nonregular', 'oversized', 'stat-error'] as const)('source handle refuses %s before reading or copying', async kind => {
  const f = await fixture({ maxFileBytes: 4 })
  const path = join(f.source, 'a')
  await f.file('a', 'old')
  let reads = () => 0
  let copies = 0
  const realOpen = actual.open
  const closed = sourceOpen(path, async handle => {
    const stat = handle.stat.bind(handle)
    vi.spyOn(handle, 'stat').mockImplementation((async options => {
      if (kind === 'stat-error') throw new Error('synthetic source stat failure')
      return Object.assign(await stat(options), kind.endsWith('nonregular') ? { isFile: () => false } : {})
    }) as FileHandle['stat'])
    const read = vi.spyOn(handle, 'read')
    reads = () => read.mock.calls.length
  }, async flags => {
    if (kind === 'oversized') await actual.writeFile(path, 'oversized')
    // A FIFO substituted at this seam must not trap a blocking source open.
    if (kind === 'nonblocking-nonregular' && constants.O_NONBLOCK &&
        (typeof flags !== 'number' || !(flags & constants.O_NONBLOCK))) throw new Error('synthetic blocking source open')
  })
  const intercept = vi.mocked(fs.open).getMockImplementation()!
  vi.mocked(fs.open).mockImplementation(async (...args) => {
    if (args[1] === 'wx' && String(args[0]).includes('.tmp-')) copies++
    return intercept(...args)
  })
  await expect(f.provider.stage('tenant', f.source)).rejects.toThrow(
    kind === 'stat-error' ? 'synthetic source stat failure' : kind.endsWith('nonregular') ? /file type/ : /byte budget/)
  expect(reads()).toBe(0)
  expect(copies).toBe(0)
  await expect(actual.readdir(join(namespaceDirectory(f.root), 'revisions'))).rejects.toMatchObject({ code: 'ENOENT' })
  await closed()
  // Restore the actual dependency even when a source admission is rejected.
  vi.mocked(fs.open).mockImplementation(realOpen)
})

it.each(['after-open-swap', 'adjacent-inode', 'different-device', 'post-link-without-nofollow', 'post-nonregular', 'post-stat-error', 'post-missing'] as const)('source identity refuses %s before copying', async kind => {
  const f = await fixture()
  const path = join(f.source, 'a')
  await f.file('a', 'original')
  let acquired = false
  let reads = () => 0
  let copies = 0
  const large = 9_007_199_254_740_992n
  const closed = sourceOpen(path, async handle => {
    acquired = true
    const stat = handle.stat.bind(handle)
    if (kind === 'adjacent-inode' || kind === 'different-device') {
      vi.spyOn(handle, 'stat').mockImplementation((async options => {
        const opened = await stat(options)
        return Object.assign(opened, kind === 'adjacent-inode' ? { ino: large } : { dev: large })
      }) as FileHandle['stat'])
    }
    reads = () => read.mock.calls.length
    const read = vi.spyOn(handle, 'read')
    if (kind === 'after-open-swap') {
      await actual.rename(path, join(f.root, 'opened-file'))
      await actual.writeFile(path, 'different identity')
    }
  })
  vi.mocked(fs.lstat).mockImplementation((async (...args) => {
    if (args[0] !== path || !acquired) return actual.lstat(...args)
    if (kind === 'post-stat-error') throw new Error('synthetic leaf stat failure')
    if (kind === 'post-missing') throw Object.assign(new Error('synthetic missing leaf'), { code: 'ENOENT' })
    const leaf = await actual.lstat(...args)
    return Object.assign(leaf,
      kind === 'adjacent-inode' ? { ino: large + 1n } :
      kind === 'different-device' ? { dev: large + 1n } :
      kind === 'post-link-without-nofollow' ? { isSymbolicLink: () => true } :
      kind === 'post-nonregular' ? { isFile: () => false } : {})
  }) as typeof fs.lstat)
  const intercept = vi.mocked(fs.open).getMockImplementation()!
  vi.mocked(fs.open).mockImplementation(async (...args) => {
    if (args[1] === 'wx' && String(args[0]).includes('.tmp-')) copies++
    return intercept(...args)
  })
  await expect(f.provider.stage('tenant', f.source)).rejects.toThrow(
    kind === 'post-stat-error' ? 'synthetic leaf stat failure' :
      kind === 'post-missing' ? 'synthetic missing leaf' : /source/)
  expect(reads()).toBe(0)
  expect(copies).toBe(0)
  await expect(actual.readdir(join(namespaceDirectory(f.root), 'revisions'))).rejects.toMatchObject({ code: 'ENOENT' })
  await closed()
})
