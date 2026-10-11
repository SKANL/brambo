import type { Command, RunSnapshot } from '@brambodev/contracts'
import type { RemoteClientOptions } from '../src/client.ts'
export const snapshot: RunSnapshot = { schemaVersion: 1, key: { namespace: 'tenant', runId: 'run' }, revision: 0,
  workflowId: 'flow', workflowVersion: '1', sessionId: 'session', status: 'pending',
  workspace: { namespace: 'tenant', workspaceId: 'workspace', revision: '1' }, tasks: [], context: null, cancelRequested: false }
export const actor = { namespace: 'tenant', subject: 'alice' }
export const command: Command = { key: snapshot.key, clientId: 'client', idempotencyKey: 'start', kind: 'start', payload: null }
export const ok = (payload: unknown) => new Response(JSON.stringify({ version: 1, status: 'ok', payload }))
export const options = (fetcher: typeof fetch, extra: Partial<RemoteClientOptions> = {}): RemoteClientOptions => ({
  endpoint: 'https://host.invalid/v1/workflow', fetch: fetcher, authorizeRequest: async () => ({ authorization: 'secret' }), ...extra,
})
