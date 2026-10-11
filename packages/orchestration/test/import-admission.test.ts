import { expect, test, vi } from 'vitest'
import type { ArtifactProvider, RunSnapshot, RunStore } from '@brambodev/contracts'
import { runDurableWorkflow } from '../src/index.ts'

test.each([{ phase: 'pending' }, { phase: 'unknown' }, { phase: 'completed', version: 2 }])('direct engine refuses pending/invalid import before transitions %j', patch => {
  const snapshot = { schemaVersion: 1, key: { namespace: 'tenant', runId: 'target' }, revision: 0, workflowId: 'flow', workflowVersion: '1', sessionId: 'session', status: 'failed', workspace: { namespace: 'tenant', workspaceId: 'workspace', revision: 'r' }, tasks: [], context: null, cancelRequested: false, lineage: { namespace: 'tenant', runId: 'source' },
    importState: { version: 1, id: 'import-id', sourceKey: { namespace: 'tenant', runId: 'source' }, sourceRevision: 1, fingerprint: 'a'.repeat(64), ...patch } } as unknown as RunSnapshot
  const commit = vi.fn(), events = vi.fn(async () => ({ status: 'empty', events: [], latestCursor: 0, nextCursor: 0 })), executeTask = vi.fn()
  return expect(runDurableWorkflow({ key: snapshot.key, principal: { namespace: 'tenant', subject: 'worker' }, lease: { namespace: 'tenant', ownerId: 'worker', token: 'token', expiresAt: 60000, epochs: { 'run:target': 1, 'workspace:workspace': 1 } }, store: { get: async () => snapshot, commit, events, valid: async () => true } as unknown as RunStore,
    artifacts: {} as ArtifactProvider, definition: { id: 'flow', version: '1', tasks: [] }, prepareTask: vi.fn(), executeTask, signal: new AbortController().signal, concurrency: 1 }))
    .rejects.toThrow(/import|schema/i).then(() => { expect(commit).not.toHaveBeenCalled(); expect(events).not.toHaveBeenCalled(); expect(executeTask).not.toHaveBeenCalled() })
})
