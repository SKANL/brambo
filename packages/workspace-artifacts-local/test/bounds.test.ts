import * as fs from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { fixture } from './helpers.ts'
import { namespaceDirectory } from './helpers.ts'
import { checkedManifest } from '../src/manifest.ts'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, opendir: vi.fn(actual.opendir) }
})

afterEach(() => { vi.restoreAllMocks(); vi.mocked(fs.opendir).mockImplementation(actualFs.opendir) })
const actualFs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')

// Count entries delivered by real bounded directory iterators, not mock results.
function enumerationProbe(maximum: number) {
  const realOpen = actualFs.opendir
  let consumed = 0
  vi.spyOn(fs, 'opendir').mockImplementation(async (...args) => {
    const directory = await realOpen(...args)
    const iterate = directory[Symbol.asyncIterator].bind(directory)
    directory[Symbol.asyncIterator] = async function* (): AsyncGenerator<Dirent, undefined> {
      for await (const entry of iterate()) {
        if (++consumed > maximum) throw new Error('enumeration passed bounded failure point')
        yield entry
      }
      return undefined
    }
    return directory
  })
  return () => consumed
}

it('bounds empty-directory traversal independently of the regular-file budget', async () => {
  const f = await fixture({ maxFiles: 0, maxTraversalEntries: 3 })
  for (let i = 0; i < 10; i++) await fs.mkdir(join(f.source, 'empty-' + i))
  const consumed = enumerationProbe(4)
  await expect(f.provider.stage('tenant', f.source)).rejects.toThrow(/traversal.*budget/)
  expect(consumed()).toBe(4)
})

it('refuses a deep empty tree before opening descendants beyond the depth bound', async () => {
  const f = await fixture({ maxDepth: 2 })
  let directory = f.source
  for (let i = 0; i < 5; i++) { directory = join(directory, 'd'); await fs.mkdir(directory) }
  const consumed = enumerationProbe(3)
  await expect(f.provider.stage('tenant', f.source)).rejects.toThrow(/depth.*budget/)
  expect(consumed()).toBe(3)
})

it('stops an oversized single directory after the first over-budget entry', async () => {
  const f = await fixture({ maxFiles: 20, maxTraversalEntries: 3 })
  for (let i = 0; i < 10; i++) await f.file('file-' + i, '')
  const consumed = enumerationProbe(4)
  await expect(f.provider.stage('tenant', f.source)).rejects.toThrow(/traversal.*budget/)
  expect(consumed()).toBe(4)
})

const digest = 'sha256:' + '0'.repeat(64)
const manifestLimits = {
  maxFiles: 10, maxFileBytes: 100, maxTotalBytes: 100,
  maxTraversalEntries: 100, maxDepth: 128, maxPathBytes: 4096, maxMetadataBytes: 512,
}
const entry = (path: string) => ({ path, digest, size: 0, executable: false })

it('rejects an oversized entry count before deep descriptor validation', () => {
  const entries = new Array(2)
  Object.defineProperty(entries, '0', { enumerable: true, get: () => { throw new Error('visited entry before count preflight') } })
  expect(() => checkedManifest({ revision: digest, entries }, { ...manifestLimits, maxFiles: 1 })).toThrow(/file-count.*budget/)
})

it('rejects oversized paths before content/schema/revision validation', () => {
  expect(() => checkedManifest({ revision: digest, entries: [entry('a'.repeat(17))] }, { ...manifestLimits, maxPathBytes: 16 })).toThrow(/path.*budget/)
})

it('preflights total escaped JSON metadata before canonical copying and whole serialization', () => {
  const value = { revision: digest, entries: [entry('a'.repeat(200)), entry('b'.repeat(200))] }
  const stringify = JSON.stringify
  vi.spyOn(JSON, 'stringify').mockImplementation((value, ...args) => {
    if (value && typeof value === 'object' && 'entries' in value) throw new Error('serialized whole manifest before budget preflight')
    return stringify(value, ...args)
  })
  expect(() => checkedManifest(value, manifestLimits)).toThrow(/metadata.*budget/)
})

it('stops staging metadata before creating an oversized canonical manifest', async () => {
  const f = await fixture({ maxMetadataBytes: 200 })
  await f.file('a', '')
  await expect(f.provider.stage('tenant', f.source)).rejects.toThrow(/metadata.*budget/)
  await expect(fs.readdir(join(namespaceDirectory(f.root), 'revisions'))).rejects.toThrow()
})

it('bounds persisted metadata bytes before JSON parsing using the configured local cap', async () => {
  const f = await fixture({ maxMetadataBytes: 512 })
  await f.file('a', '')
  const staged = await f.provider.stage('tenant', f.source)
  await f.provider.publish(f.ref(staged.revision), staged, f.lease)
  const metadata = join(namespaceDirectory(f.root), 'revisions', staged.revision.slice(7), 'data')
  const padded = Buffer.alloc(513, 0x20)
  Buffer.from(JSON.stringify(staged)).copy(padded)
  await fs.writeFile(metadata, padded)
  const parse = JSON.parse
  vi.spyOn(JSON, 'parse').mockImplementation((value, ...args) => {
    if (value.length > 512 && value.includes(staged.revision)) throw new Error('parsed metadata before byte preflight')
    return parse(value, ...args)
  })
  await expect(f.provider.manifest(f.ref(staged.revision))).rejects.toThrow(/metadata.*budget/)
})

it('rejects unexpected metadata fields without deep traversal of their values', () => {
  const value = { revision: digest, entries: [entry('a')], extra: {} as { loop?: unknown } }
  value.extra.loop = value.extra
  expect(() => checkedManifest(value, manifestLimits)).toThrow(/unexpected artifact metadata field/)
})

it('accepts the exact UTF-8 metadata bound and refuses one byte less', async () => {
  const path = 'caf\u00e9-\ud83d\ude00.txt'
  const expectedEntry = { path, digest: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', size: 0, executable: false }
  const bytes = Buffer.byteLength(JSON.stringify({ revision: digest, entries: [expectedEntry] }), 'utf8')
  const exact = await fixture({ maxMetadataBytes: bytes })
  await exact.file(path, '')
  expect((await exact.provider.stage('tenant', exact.source)).entries).toEqual([expectedEntry])
  const smaller = await fixture({ maxMetadataBytes: bytes - 1 })
  await smaller.file(path, '')
  await expect(smaller.provider.stage('tenant', smaller.source)).rejects.toThrow(/metadata.*budget/)
})
