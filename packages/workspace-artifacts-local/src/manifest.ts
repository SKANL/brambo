import { createHash } from 'node:crypto'
import { validateArtifactManifest } from '@brambodev/contracts'
import type { ArtifactManifest } from '@brambodev/contracts'

export interface ArtifactLimits {
  readonly maxFiles: number
  readonly maxFileBytes: number
  readonly maxTotalBytes: number
}

export function identifier(value: string): void {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) throw new Error('unsafe scoped identifier')
}

export function digestHex(value: string): string {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) throw new Error('invalid sha256 digest/revision identifier')
  return value.slice(7)
}

export function artifactPath(path: string): void {
  validateArtifactManifest({ revision: 'path-check', entries: [{ path, digest: 'path-check', size: 0, executable: false }] })
}

export function canonicalEntries(entries: ArtifactManifest['entries']): ArtifactManifest['entries'] {
  return entries.map(({ path, digest, size, executable }) => ({ path, digest, size, executable }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
}

export function revisionOf(entries: ArtifactManifest['entries']): string {
  return 'sha256:' + createHash('sha256').update(JSON.stringify({ entries: canonicalEntries(entries) }), 'utf8').digest('hex')
}

export function checkedManifest(value: unknown, limits: ArtifactLimits): ArtifactManifest {
  const manifest = validateArtifactManifest(value)
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
  if (revisionOf(entries) !== manifest.revision) throw new Error('artifact revision integrity mismatch')
  return { revision: manifest.revision, entries }
}
