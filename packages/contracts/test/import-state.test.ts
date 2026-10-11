import { expect, test } from 'vitest'
import { validateRunSnapshot } from '../src/index.ts'
import type { RunSnapshot } from '../src/index.ts'

const snapshot = { schemaVersion: 1, key: { namespace: 'tenant', runId: 'target' }, revision: 0, workflowId: 'flow', workflowVersion: '1', sessionId: 'session', status: 'pending', workspace: { namespace: 'tenant', workspaceId: 'workspace', revision: 'r' }, tasks: [], context: null, cancelRequested: false, lineage: { namespace: 'tenant', runId: 'source' } }
const state = { version: 1, id: 'import-id', sourceKey: snapshot.lineage, sourceRevision: 2, fingerprint: 'a'.repeat(64), phase: 'pending' }
test('typed import admission is valid and legacy snapshots remain valid', () => {
  expect(validateRunSnapshot({ ...snapshot, importState: state })).toEqual({ ...snapshot, importState: state })
  expect(validateRunSnapshot(snapshot)).toEqual(snapshot)
})
test.each([{ phase: 'unknown' }, { version: 2 }, { fingerprint: 'invalid' }, { sourceRevision: -1 }, { sourceKey: { namespace: 'other', runId: 'source' } }, { extra: true }])('import marker rejects malformed or unsupported metadata %j', patch => {
  expect(() => validateRunSnapshot({ ...snapshot, importState: { ...state, ...patch } } as unknown as RunSnapshot)).toThrow()
})
