import * as fs from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { fixture } from './helpers.ts'
import { namespaceDirectory } from './helpers.ts'
import { checkedManifest, entryMetadataBytes, revisionOf } from '../src/manifest.ts'

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

it.each(['manifest', 'entries', 'record'] as const)('projects %s without enumerating caller-owned keys', async (location) => {
  const f = await fixture()
  await f.file('a', '')
  const staged = await f.provider.stage('tenant', f.source)
  const record = { ...staged.entries[0]! }
  const entries = [record]
  const value = { revision: staged.revision, entries }
  const target = location === 'manifest' ? value : location === 'entries' ? entries : record
  Object.defineProperty(target, 'hidden', { get() { throw new Error('visited unsupported hidden value') } })
  Object.defineProperty(target, Symbol('extra'), { value: target })
  const projected = new Proxy(target, { ownKeys() { throw new Error('enumerated unbounded caller keys') } })
  const input = location === 'manifest' ? projected : value
  if (location === 'entries') value.entries = projected as typeof entries
  if (location === 'record') entries[0] = projected as typeof record
  expect(checkedManifest(input, manifestLimits)).toEqual(staged)
})

it('discards unsupported metadata fields without visiting enumerable or hidden values', async () => {
  const f = await fixture()
  await f.file('a', '')
  const staged = await f.provider.stage('tenant', f.source)
  const record = { ...staged.entries[0]! }
  const entries = [record]
  const value = { revision: staged.revision, entries }
  for (const target of [value, entries, record]) {
    for (let index = 0; index < 100; index++) Object.defineProperty(target, 'hidden-' + index, { value: target })
    Object.defineProperty(target, 'extra', { enumerable: true, get() { throw new Error('visited unsupported enumerable value') } })
    Object.defineProperty(target, Symbol('extra'), { value: target })
  }
  expect(checkedManifest(value, manifestLimits)).toEqual(staged)
})

it('bounds revision hashing and entry byte accounting without enumerating input keys', async () => {
  const f = await fixture()
  await f.file('a', '')
  const staged = await f.provider.stage('tenant', f.source)
  const record = new Proxy(staged.entries[0]!, { ownKeys() { throw new Error('enumerated record during accounting') } })
  const entries = new Proxy([record], { ownKeys() { throw new Error('enumerated array during hashing') } })
  expect(entryMetadataBytes(record, manifestLimits)).toBe(Buffer.byteLength(JSON.stringify(staged.entries[0])))
  expect(revisionOf(entries, manifestLimits)).toBe(staged.revision)
})

it.each(['entries', 'record'] as const)('rejects accessors in required %s fields without invoking them', async (location) => {
  const f = await fixture()
  await f.file('a', '')
  const staged = await f.provider.stage('tenant', f.source)
  const record = { ...staged.entries[0]! }
  const entries = [record]
  Object.defineProperty(location === 'entries' ? entries : record, location === 'entries' ? '0' : 'path', {
    enumerable: true, get() { throw new Error('invoked caller accessor') },
  })
  expect(() => checkedManifest({ revision: staged.revision, entries }, manifestLimits)).toThrow(/metadata data field/)
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
