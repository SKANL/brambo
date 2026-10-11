import * as fs from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { fixture, namespaceDirectory } from './helpers.ts'

// Exercise POSIX nonblocking availability on Windows without passing invented
// native flags to its real filesystem. Existing suites retain native constants.
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, constants: { ...actual.constants, O_NONBLOCK: actual.constants.O_NONBLOCK ?? 0o4000 } }
})
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, open: vi.fn(actual.open) }
})
const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
const nativeConstants = (await vi.importActual<typeof import('node:fs')>('node:fs')).constants
afterEach(() => { vi.restoreAllMocks(); vi.mocked(fs.open).mockImplementation(actual.open) })

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
      vi.spyOn(handle, 'stat').mockImplementation(async () => {
        const opened = await stat()
        return Object.assign(opened, { mode: (opened.mode & ~0o777) | 0o700 })
      })
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
    vi.spyOn(handle, 'stat').mockImplementation(async () => {
      if (kind === 'stat-error') throw new Error('synthetic source stat failure')
      return Object.assign(await stat(), kind.endsWith('nonregular') ? { isFile: () => false } : {})
    })
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
