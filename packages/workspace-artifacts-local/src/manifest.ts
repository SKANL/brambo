import { createHash } from 'node:crypto'
import { validateArtifactManifest } from '@brambodev/contracts'
import type { ArtifactManifest } from '@brambodev/contracts'

export interface ArtifactLimits {
  readonly maxFiles: number
  readonly maxFileBytes: number
  readonly maxTotalBytes: number
  readonly maxTraversalEntries: number
  readonly maxDepth: number
  readonly maxPathBytes: number
  readonly maxMetadataBytes: number
}

export const MAX_METADATA_BYTES = 64 * 1024 * 1024
const PLACEHOLDER_REVISION = 'sha256:' + '0'.repeat(64)
export const EMPTY_MANIFEST_BYTES = ('{"revision":"' + PLACEHOLDER_REVISION + '","entries":[]}').length

function field(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') throw new Error('invalid artifact metadata record')
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) throw new Error('invalid artifact metadata data field')
  return descriptor.value
}

function plainRecord(value: unknown): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('invalid artifact metadata record')
}

export function boundedPath(path: unknown, limits: ArtifactLimits): asserts path is string {
  if (typeof path !== 'string') throw new Error('invalid artifact path')
  if (path.length > Math.min(limits.maxPathBytes, limits.maxMetadataBytes) || Buffer.byteLength(path, 'utf8') > limits.maxPathBytes) throw new Error('artifact path-byte budget exceeded')
  if (path.split('/').length > limits.maxDepth) throw new Error('artifact depth budget exceeded')
}

// Exact well-formed JSON UTF-8 string size without allocating an escaped string.
function jsonStringBytes(value: string, maximum: number): number {
  let bytes = 2
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code === 34 || code === 92 || code === 8 || code === 9 || code === 10 || code === 12 || code === 13) bytes += 2
    else if (code < 32) bytes += 6
    else if (code < 128) bytes++
    else if (code < 2048) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff && value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++ }
    else if (code >= 0xd800 && code <= 0xdfff) bytes += 6
    else bytes += 3
    if (bytes > maximum) throw new Error('artifact metadata budget exceeded')
  }
  return bytes
}

function projectedEntry(value: unknown, limits: ArtifactLimits): ArtifactManifest['entries'][number] {
  plainRecord(value)
  const path = field(value, 'path')
  boundedPath(path, limits)
  const digest = field(value, 'digest')
  if (typeof digest !== 'string') throw new Error('invalid artifact digest')
  digestHex(digest)
  const size = field(value, 'size')
  const executable = field(value, 'executable')
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0 || Object.is(size, -0) || typeof executable !== 'boolean') throw new Error('invalid artifact metadata fields')
  return { path, digest, size, executable }
}

function projectedEntryBytes({ path, digest, size, executable }: ArtifactManifest['entries'][number], limits: ArtifactLimits): number {
  return '{"path":,"digest":,"size":,"executable":}'.length + jsonStringBytes(path, limits.maxMetadataBytes) + digest.length + 2 + String(size).length + (executable ? 4 : 5)
}

export function entryMetadataBytes(value: unknown, limits: ArtifactLimits): number {
  return projectedEntryBytes(projectedEntry(value, limits), limits)
}

function preflight(value: unknown, limits: ArtifactLimits): ArtifactManifest {
  plainRecord(value)
  const originalEntries = field(value, 'entries')
  if (!Array.isArray(originalEntries) || Object.getPrototypeOf(originalEntries) !== Array.prototype) throw new Error('invalid artifact entries')
  const lengthDescriptor = Object.getOwnPropertyDescriptor(originalEntries, 'length')
  if (!lengthDescriptor || !('value' in lengthDescriptor)) throw new Error('invalid artifact entries')
  const length: unknown = lengthDescriptor.value
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) throw new Error('invalid artifact entries')
  // Count before touching even the first descriptor or calling the deep schema.
  if (length > limits.maxFiles) throw new Error('artifact file-count budget exceeded')
  const revision = field(value, 'revision')
  if (typeof revision !== 'string') throw new Error('invalid artifact revision')
  digestHex(revision)
  // Never enumerate untrusted keys: even hidden fields can make ownKeys allocate
  // without bound. Only known own data fields enter this new bounded snapshot.
  // Unsupported fields (including array decorations and symbols) are discarded.
  const entries: ArtifactManifest['entries'][number][] = []
  let bytes = EMPTY_MANIFEST_BYTES
  if (bytes > limits.maxMetadataBytes) throw new Error('artifact metadata budget exceeded')
  for (let index = 0; index < length; index++) {
    const entry = projectedEntry(field(originalEntries, String(index)), limits)
    bytes += projectedEntryBytes(entry, limits) + (index === 0 ? 0 : 1)
    if (!Number.isSafeInteger(bytes) || bytes > limits.maxMetadataBytes) throw new Error('artifact metadata budget exceeded')
    entries.push(entry)
  }
  return { revision, entries }
}

export function identifier(value: string): void {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) throw new Error('unsafe scoped identifier')
}

export function digestHex(value: string): string {
  if (typeof value !== 'string' || value.length !== 71 || !/^sha256:[0-9a-f]{64}$/.test(value)) throw new Error('invalid sha256 digest/revision identifier')
  return value.slice(7)
}

export function artifactPath(path: string, limits: ArtifactLimits): void {
  boundedPath(path, limits)
  validateArtifactManifest({ revision: 'path-check', entries: [{ path, digest: 'path-check', size: 0, executable: false }] })
}

export function canonicalEntries(entries: ArtifactManifest['entries']): ArtifactManifest['entries'] {
  return entries.map(({ path, digest, size, executable }) => ({ path, digest, size, executable }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
}

export function revisionOf(entries: ArtifactManifest['entries'], limits: ArtifactLimits): string {
  const snapshot = preflight({ revision: PLACEHOLDER_REVISION, entries }, limits)
  return 'sha256:' + createHash('sha256').update(JSON.stringify({ entries: canonicalEntries(snapshot.entries) }), 'utf8').digest('hex')
}

export function checkedManifest(value: unknown, limits: ArtifactLimits): ArtifactManifest {
  const snapshot = preflight(value, limits)
  const manifest = validateArtifactManifest(snapshot)
  digestHex(manifest.revision)
  if (manifest.entries.length > limits.maxFiles) throw new Error('artifact file-count budget exceeded')
  const paths = new Set<string>()
  const components = new Map<string, string>()
  let total = 0
  for (const entry of manifest.entries) {
    digestHex(entry.digest)
    const key = entry.path.normalize('NFC').toLowerCase()
    if (paths.has(key)) throw new Error('artifact path collision')
    paths.add(key)
    const parts = entry.path.split('/')
    for (let index = 1; index <= parts.length; index++) {
      const spelling = parts.slice(0, index).join('/')
      const normalized = spelling.normalize('NFC').toLowerCase()
      const existing = components.get(normalized)
      if (existing !== undefined && existing !== spelling) throw new Error('artifact directory/path normalization collision')
      components.set(normalized, spelling)
    }
    total += entry.size
    if (entry.size > limits.maxFileBytes || !Number.isSafeInteger(total) || total > limits.maxTotalBytes) throw new Error('artifact byte budget exceeded')
  }
  for (const path of paths) {
    const parts = path.split('/')
    parts.pop()
    while (parts.length > 0) {
      if (paths.has(parts.join('/'))) throw new Error('artifact file/directory path collision')
      parts.pop()
    }
  }
  const entries = canonicalEntries(manifest.entries)
  if (revisionOf(entries, limits) !== manifest.revision) throw new Error('artifact revision integrity mismatch')
  return { revision: manifest.revision, entries }
}
