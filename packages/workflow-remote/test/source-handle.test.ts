import * as fs from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { createRemoteArtifactProvider } from '../src/artifacts.ts'
import { ok, options } from './fixtures.ts'

// Simulate no-follow fallback and supported nonblocking; native calls stay valid.
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
const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks(); vi.mocked(fs.open).mockImplementation(actual.open); vi.mocked(fs.lstat).mockImplementation(actual.lstat)
  for (const root of roots.splice(0)) await actual.rm(root, { recursive: true, force: true })
})
async function source() {
  const root = await actual.mkdtemp(join(tmpdir(), 'brambo-remote-source-'))
  roots.push(root)
  const directory = join(root, 'source')
  await actual.mkdir(directory)
  const path = join(directory, 'a')
  await actual.writeFile(path, 'checked', { mode: 0o600 })
  return { root, directory, path }
}
function sourceOpen(path: string, intercept: (handle: FileHandle) => Promise<void>, before?: (flags: string | number | undefined) => Promise<void>) {
  let consumed = false
  let descriptorStat: FileHandle['stat'] | undefined
  vi.mocked(fs.open).mockImplementation(async (...args) => {
    if (args[0] !== path || consumed) return actual.open(...args)
    consumed = true
    await before?.(args[1])
    const flags = typeof args[1] === 'number' && nativeConstants.O_NONBLOCK === undefined
      ? args[1] & ~constants.O_NONBLOCK : args[1]
    const handle = await actual.open(args[0], flags, args[2])
    descriptorStat = handle.stat.bind(handle)
    await intercept(handle)
    return handle
  })
  return async () => {
    expect(consumed).toBe(true)
    await expect(descriptorStat!()).rejects.toMatchObject({ code: 'EBADF' })
  }
}

it('source handle uploads replacement bytes with the opened descriptor mode', async () => {
  const f = await source()
  const replacement = Buffer.from('opened replacement')
  const expected = { path: 'a', size: replacement.length,
    digest: 'sha256:' + createHash('sha256').update(replacement).digest('hex'), executable: true }
  const closed = sourceOpen(f.path, async handle => {
    if (process.platform === 'win32') {
      const stat = handle.stat.bind(handle)
      vi.spyOn(handle, 'stat').mockImplementation((async options => {
        const opened = await stat(options)
        const mode = typeof opened.mode === 'bigint' ? (opened.mode & ~0o777n) | 0o700n : (opened.mode & ~0o777) | 0o700
        return Object.assign(opened, { mode })
      }) as FileHandle['stat'])
    }
  }, async () => {
    await actual.rename(f.path, join(f.root, 'checked-file'))
    await actual.writeFile(f.path, replacement, { mode: 0o700 })
  })
  const wire = vi.fn(async (_url, init) => {
    const { operation, payload } = JSON.parse(init!.body as string)
    expect(operation).toBe('artifact.stage')
    expect(payload.files).toEqual([{ path: 'a', contentBase64: replacement.toString('base64'), executable: true }])
    return ok({ revision: 'replacement', entries: [expected] })
  })
  const staged = await createRemoteArtifactProvider(options(wire as typeof fetch)).stage('tenant', f.directory)
  expect(staged.entries).toEqual([expected])
  expect(wire).toHaveBeenCalledOnce()
  await closed()
})

it.each(['nonregular', 'nonblocking-nonregular', 'oversized', 'stat-error'] as const)('source handle refuses %s before streaming or upload', async kind => {
  const f = await source()
  let streamed = 0
  const closed = sourceOpen(f.path, async handle => {
    const stat = handle.stat.bind(handle)
    vi.spyOn(handle, 'stat').mockImplementation((async options => {
      if (kind === 'stat-error') throw new Error('synthetic source stat failure')
      return Object.assign(await stat(options), kind.endsWith('nonregular') ? { isFile: () => false } : {})
    }) as FileHandle['stat'])
    const stream = handle.createReadStream.bind(handle)
    vi.spyOn(handle, 'createReadStream').mockImplementation(options => { streamed++; return stream(options) })
  }, async flags => {
    if (kind === 'oversized') await actual.writeFile(f.path, Buffer.alloc(768 * 1024 + 1))
    if (kind === 'nonblocking-nonregular' && constants.O_NONBLOCK &&
        (typeof flags !== 'number' || !(flags & constants.O_NONBLOCK))) throw new Error('synthetic blocking source open')
  })
  const wire = vi.fn(async () => { throw new Error('invalid source reached upload') })
  await expect(createRemoteArtifactProvider(options(wire as typeof fetch)).stage('tenant', f.directory)).rejects.toThrow(
    kind === 'stat-error' ? 'synthetic source stat failure' : 'Invalid remote artifact')
  expect(streamed).toBe(0)
  expect(wire).not.toHaveBeenCalled()
  await closed()
})

it.each(['after-open-swap', 'adjacent-inode', 'different-device', 'post-link-without-nofollow', 'post-nonregular', 'post-stat-error', 'post-missing'] as const)('source identity refuses %s before streaming or upload', async kind => {
  const f = await source()
  let acquired = false
  let streamed = 0
  const large = 9_007_199_254_740_992n
  const closed = sourceOpen(f.path, async handle => {
    acquired = true
    const stat = handle.stat.bind(handle)
    if (kind === 'adjacent-inode' || kind === 'different-device') {
      vi.spyOn(handle, 'stat').mockImplementation((async options => {
        const opened = await stat(options)
        return Object.assign(opened, kind === 'adjacent-inode' ? { ino: large } : { dev: large })
      }) as FileHandle['stat'])
    }
    const stream = handle.createReadStream.bind(handle)
    vi.spyOn(handle, 'createReadStream').mockImplementation(options => { streamed++; return stream(options) })
    if (kind === 'after-open-swap') {
      await actual.rename(f.path, join(f.root, 'opened-file'))
      await actual.writeFile(f.path, 'different identity')
    }
  })
  vi.mocked(fs.lstat).mockImplementation((async (...args) => {
    if (args[0] !== f.path || !acquired) return actual.lstat(...args)
    if (kind === 'post-stat-error') throw new Error('synthetic leaf stat failure')
    if (kind === 'post-missing') throw Object.assign(new Error('synthetic missing leaf'), { code: 'ENOENT' })
    const leaf = await actual.lstat(...args)
    return Object.assign(leaf,
      kind === 'adjacent-inode' ? { ino: large + 1n } :
      kind === 'different-device' ? { dev: large + 1n } :
      kind === 'post-link-without-nofollow' ? { isSymbolicLink: () => true } :
      kind === 'post-nonregular' ? { isFile: () => false } : {})
  }) as typeof fs.lstat)
  const wire = vi.fn(async (_url, init) => {
    const { payload } = JSON.parse(init!.body as string)
    return ok({ revision: 'original', entries: payload.files.map((file: { path: string; contentBase64: string; executable: boolean }) => {
      const bytes = Buffer.from(file.contentBase64, 'base64')
      return { path: file.path, digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex'), size: bytes.length, executable: file.executable }
    }) })
  })
  await expect(createRemoteArtifactProvider(options(wire as typeof fetch)).stage('tenant', f.directory)).rejects.toThrow(
    kind === 'post-stat-error' ? 'synthetic leaf stat failure' :
      kind === 'post-missing' ? 'synthetic missing leaf' : 'Invalid remote artifact')
  expect(streamed).toBe(0)
  expect(wire).not.toHaveBeenCalled()
  await closed()
})
