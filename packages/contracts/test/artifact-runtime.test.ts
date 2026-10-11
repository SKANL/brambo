import { describe, expect, it } from 'vitest'
import { validateArtifactManifest, validateRuntimeOutcome, ARTIFACT_MANIFEST_SCHEMA } from '../src/artifact-runtime.ts'

const workspace = { namespace: 'team', workspaceId: 'child-1', revision: 'rev-1' }
const manifest = { revision: 'rev-1', entries: [{ path: 'src/main.ts', digest: 'sha256:abc', size: 10, executable: false }] }
const lease = { namespace: 'team', ownerId: 'child-owner', token: 'opaque-child', expiresAt: 1000, epochs: { 'task:run-1:task-1': 1, 'workspace:child-1': 1 } }
const outcome = { outcome: { result: { status: 'ok', summary: 'Done', data: null } }, staged: manifest, workspace, publicationLease: lease }

describe('fenced artifact/runtime ports', () => {
  it('accepts immutable manifests and transient child publication evidence', () => {
    expect(validateArtifactManifest(manifest)).toEqual(manifest)
    expect(ARTIFACT_MANIFEST_SCHEMA['~standard'].validate(manifest)).toEqual({ value: manifest })
    expect(validateRuntimeOutcome(outcome)).toEqual(outcome)
  })
  it.each(['../escape', '/absolute', 'C:/absolute', 'a\\b', 'a/../b', 'a//b', './a', 'a/', 'a\0b'])('rejects unsafe artifact path %s', (path) => {
    expect(() => validateArtifactManifest({ ...manifest, entries: [{ ...manifest.entries[0], path }] })).toThrow()
  })
  it('rejects duplicate paths and nonfinite/negative/fractional sizes', () => {
    expect(() => validateArtifactManifest({ ...manifest, entries: [manifest.entries[0], manifest.entries[0]] })).toThrow()
    for (const size of [-1, Infinity, NaN, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => validateArtifactManifest({ ...manifest, entries: [{ ...manifest.entries[0], size }] })).toThrow()
    }
  })
  it('rejects missing publication scope, wrong workspace scope and wrong namespace', () => {
    expect(() => validateRuntimeOutcome({ ...outcome, publicationLease: undefined })).toThrow()
    expect(() => validateRuntimeOutcome({ ...outcome, publicationLease: { ...lease, epochs: { 'run:run-1': 1, 'workspace:parent-1': 1 } } })).toThrow()
    expect(() => validateRuntimeOutcome({ ...outcome, publicationLease: { ...lease, namespace: 'other' } })).toThrow()
  })
  it('rejects mismatched immutable revision and malformed driver result', () => {
    expect(() => validateRuntimeOutcome({ ...outcome, staged: { ...manifest, revision: 'different' } })).toThrow()
    expect(() => validateRuntimeOutcome({ ...outcome, outcome: { result: { status: 'failed', summary: 'Failed', data: null } } })).toThrow()
  })
  it.each(['CON.txt', 'file.', 'a<b', 'file '])('rejects nonportable artifact path %s', (path) => {
    expect(() => validateArtifactManifest({ ...manifest, entries: [{ ...manifest.entries[0], path }] })).toThrow()
  })
})
