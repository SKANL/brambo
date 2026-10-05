import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
import type { ArtifactProvider, ArtifactManifest, Command, JsonValue, RunSnapshot, RunStore } from '@brambodev/contracts'
// Shared private conformance authority; never a production backend export.
// eslint-disable-next-line no-restricted-imports
import { nonSqliteHarness } from '../../contracts/test/helpers/non-sqlite-run-store.ts'
import * as api from '../src/index.ts'
import { createRemoteArtifactProvider, createRemoteRunStore } from '@brambodev/workflow-remote'
import { createWorkflowCoordinator } from '@brambodev/workflow-coordinator'

const digest = (bytes: Uint8Array) => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
function artifacts(store: RunStore) {
  const bytes = Buffer.from('immutable result'), revision = digest(bytes)
  const manifest: ArtifactManifest = { revision, entries: [{ path: 'result.txt', digest: revision, size: bytes.length, executable: false }] }
  const manifests = new Map([[revision, manifest]]), contents = new Map([[revision, bytes]])
  const provider: ArtifactProvider = {
    manifest: vi.fn(async ref => { const value = manifests.get(ref.revision); if (!value) throw new Error('missing'); return value }),
    read: vi.fn(async (ref, path) => { if (path !== 'result.txt') throw new Error('path'); return contents.get(ref.revision)! }),
    materialize: vi.fn(),
    stage: vi.fn(async (_namespace, directory) => {
      expect(await readdir(directory)).toEqual(['result.txt'])
      const content = await readFile(join(directory, 'result.txt')), rev = digest(content)
      const staged = { revision: rev, entries: [{ path: 'result.txt', digest: rev, size: content.length, executable: false }] }
      manifests.set(rev, staged); contents.set(rev, content); return staged
    }),
    publish: vi.fn(async (ref, staged, lease) => {
      if (!await store.valid(lease) || !Object.hasOwn(lease.epochs, 'workspace:' + ref.workspaceId) || ref.revision !== staged.revision) throw new Error('stale-lease')
    }),
  }
  return { provider, revision, manifest }
}
async function fixture(extra: Partial<RunSnapshot> = {}) {
  const sourceHarness = nonSqliteHarness(), targetHarness = nonSqliteHarness()
  const source = await sourceHarness.open(), target = await targetHarness.open()
  const principal = { namespace: 'tenant', subject: 'bob' }, sourceArtifacts = artifacts(source), targetArtifacts = artifacts(target)
  const sourceKey = { namespace: 'tenant', runId: 'local' }, targetKey = { namespace: 'tenant', runId: 'remote' }
  let snapshot: RunSnapshot = { schemaVersion: 1, key: sourceKey, revision: 0, workflowId: 'flow', workflowVersion: '1', sessionId: 'durable-session', status: 'succeeded',
    workspace: { namespace: 'tenant', workspaceId: 'parent', revision: sourceArtifacts.revision },
    tasks: [{ taskId: 'task', phase: 'succeeded', attempt: 1, result: 'done' }], context: { prompt: 'neutral' }, cancelRequested: false,
    binding: { driverId: 'custom', driverVersion: '1', providerId: 'provider', accountRef: 'private-account', nativeSessionId: 'native-id', compatibility: {} }, ...extra }
  const initial: Command = { key: sourceKey, clientId: 'alice', idempotencyKey: 'start', kind: 'start', payload: null }
  await source.create(snapshot, initial, { namespace: 'tenant', subject: 'alice' })
  const lease = await source.claim('tenant', ['run:local', 'workspace:parent'], 'alice', 60000)
  if (lease.status !== 'acquired') throw new Error('fixture')
  const committed = await source.commit({ snapshot: { ...snapshot, revision: 1 }, expectedRevision: 0, lease: lease.lease,
    events: [{ type: 'task.effect.started', payload: { taskId: 'task', attempt: 1, call: { id: 'call', toolId: 'tool', arguments: {} }, effect: 'non-idempotent' } },
      { type: 'task.effect.completed', payload: { taskId: 'task', attempt: 1, callId: 'call', result: 'done' } }] })
  if (committed.status !== 'committed') throw new Error('fixture')
  snapshot = committed.snapshot; await source.release(lease.lease)
  const definitions = api.createWorkflowRegistry()
  definitions.register({ id: 'flow', version: '1', tasks: [{ id: 'task', dependsOn: [], driverId: 'custom', configuration: null, prompt: 'task', required: [], optional: [], maxAttempts: 2 }] })
  const command: Command = { key: targetKey, clientId: 'importer', idempotencyKey: 'copy', kind: 'start', payload: { intent: 'import' } }
  const authorizeImport = vi.fn(async () => true)
  return { source, target, sourceHarness, targetHarness, snapshot, sourceArtifacts, targetArtifacts,
    options: { source, target, sourceArtifacts: sourceArtifacts.provider, targetArtifacts: targetArtifacts.provider, sourceKey, targetKey, principal, authorizeImport, command, definitions } }
}

test('public import preserves frozen source, exact lineage and verified artifacts without native bindings', async () => {
  const f = await fixture(), before = await f.source.get(f.snapshot.key)
  const imported = await api.importWorkflowRun(f.options)
  expect(imported).toMatchObject({ key: f.options.targetKey, sessionId: f.snapshot.sessionId, status: 'succeeded', lineage: f.options.sourceKey, tasks: f.snapshot.tasks, context: f.snapshot.context })
  expect(imported).not.toHaveProperty('binding')
  expect(imported.workspace.revision).toBe(f.sourceArtifacts.revision)
  expect(await f.source.get(f.snapshot.key)).toEqual(before)
  expect(f.options.authorizeImport).toHaveBeenCalledWith(f.options.principal, before, f.options.targetKey)
  expect(f.targetArtifacts.provider.publish).toHaveBeenCalledOnce()
  expect(await f.target.pending('tenant', 256)).toEqual([])
})

test('denial occurs before claims, artifacts or target mutation and namespaces cannot be rewritten', async () => {
  const f = await fixture(), claim = vi.spyOn(f.source, 'claim'), create = vi.spyOn(f.target, 'create')
  f.options.authorizeImport.mockResolvedValue(false)
  await expect(api.importWorkflowRun(f.options)).rejects.toThrow(/denied/i)
  expect(claim).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled(); expect(f.sourceArtifacts.provider.manifest).not.toHaveBeenCalled()
  await expect(api.importWorkflowRun({ ...f.options, targetKey: { namespace: 'other', runId: 'remote' } })).rejects.toThrow()
  expect(create).not.toHaveBeenCalled()
})

test.each([{ workflowVersion: '2' }, { tasks: [] }, { schemaVersion: 2 }])('rejects incompatible persisted state before target mutation: %j', async (patch) => {
  const f = await fixture(), create = vi.spyOn(f.target, 'create')
  vi.spyOn(f.source, 'get').mockResolvedValue({ ...f.snapshot, ...patch } as RunSnapshot)
  await expect(api.importWorkflowRun(f.options)).rejects.toThrow()
  expect(create).not.toHaveBeenCalled()
})

test.each(['running', 'pending'] as const)('rejects active %s source without target admission', async status => {
  const f = await fixture({ status })
  await expect(api.importWorkflowRun(f.options)).rejects.toThrow(/quiescent/i)
  expect(await f.target.get(f.options.targetKey)).toBeUndefined()
})

test('source freeze denies a live child and re-reads changed state under its claim', async () => {
  const f = await fixture(), held = await f.source.claim('tenant', ['task:local:task'], 'alice', 60000)
  if (held.status !== 'acquired') throw new Error('fixture')
  await expect(api.importWorkflowRun(f.options)).rejects.toThrow(/contended/i)
  await f.source.release(held.lease)
  const get = vi.spyOn(f.source, 'get').mockResolvedValueOnce(f.snapshot).mockResolvedValue({ ...f.snapshot, status: 'running' })
  await expect(api.importWorkflowRun(f.options)).rejects.toThrow(/quiescent|changed/i)
  expect(get.mock.calls.length).toBeGreaterThanOrEqual(2)
  expect(await f.target.get(f.options.targetKey)).toBeUndefined()
})

test('refuses target collision instead of overwriting or merging', async () => {
  const f = await fixture(), existing = { ...f.snapshot, key: f.options.targetKey, revision: 0 }
  await f.target.create(existing, { ...f.options.command, idempotencyKey: 'unrelated' }, f.options.principal)
  await expect(api.importWorkflowRun(f.options)).rejects.toThrow(/conflict|collision/i)
  expect(await f.target.get(f.options.targetKey)).toEqual(existing)
})

test('corrupt bytes never become published or completed progress', async () => {
  const f = await fixture()
  vi.mocked(f.sourceArtifacts.provider.read).mockResolvedValue(Buffer.from('corrupt'))
  await expect(api.importWorkflowRun(f.options)).rejects.toThrow(/digest/i)
  expect(f.targetArtifacts.provider.publish).not.toHaveBeenCalled()
  expect(await f.target.get(f.options.targetKey)).toBeUndefined()
})

test('interrupted import retries the same durable receipt; changed payload or frozen source conflicts', async () => {
  const f = await fixture()
  vi.mocked(f.targetArtifacts.provider.publish).mockRejectedValueOnce(new Error('interrupted'))
  await expect(api.importWorkflowRun(f.options)).rejects.toThrow('interrupted')
  const pending = await f.target.pending('tenant', 256)
  expect(pending).toHaveLength(1)
  const imported = await api.importWorkflowRun(f.options)
  expect((await f.target.receipt('tenant', pending[0]!.id))?.phase).toBe('completed')
  expect(await api.importWorkflowRun(f.options)).toEqual(imported)
  await expect(api.importWorkflowRun({ ...f.options, command: { ...f.options.command, payload: { intent: 'divergent' } } })).rejects.toThrow(/conflict/i)
  vi.spyOn(f.source, 'get').mockResolvedValue({ ...f.snapshot, revision: f.snapshot.revision + 1 })
  await expect(api.importWorkflowRun(f.options)).rejects.toThrow(/conflict/i)
})

test('refuses missing or uncertain effect evidence; preserves completed effect history on import', async () => {
  const f = await fixture(), events = vi.spyOn(f.source, 'events')
  events.mockResolvedValueOnce({ status: 'empty', events: [], latestCursor: 0, nextCursor: 0 })
  await expect(api.importWorkflowRun(f.options)).rejects.toThrow(/effect/i)
  events.mockRestore()
  const complete = await f.source.events(f.snapshot.key, 0, 256)
  const uncertain = vi.spyOn(f.source, 'events').mockResolvedValueOnce({ ...complete, events: complete.events.slice(0, 1), latestCursor: 1, nextCursor: 1 })
  await expect(api.importWorkflowRun(f.options)).rejects.toThrow(/effect/i)
  uncertain.mockRestore()
  await api.importWorkflowRun(f.options)
  expect((await f.target.events(f.options.targetKey, 0, 256)).events.filter(event => event.type.startsWith('task.effect.')).map(event => ({ type: event.type, payload: event.payload })))
    .toEqual(complete.events.map(event => ({ type: event.type, payload: event.payload })))
})

test.each(['attempt', 'missing-result', 'future-attempt', 'changed-call'] as const)('rejects contradictory effect evidence: %s', async kind => {
  const f = await fixture(), page = await f.source.events(f.snapshot.key, 0, 256), events = [...structuredClone(page.events)]
  const completed = events[1]!.payload as Record<string, unknown>
  if (kind === 'attempt') completed['attempt'] = 2
  if (kind === 'missing-result') delete completed['result']
  if (kind === 'future-attempt') (events[0]!.payload as Record<string, unknown>)['attempt'] = 2
  if (kind === 'changed-call') events.push({ ...events[0]!, cursor: 3, payload: { taskId: 'task', attempt: 1, call: { id: 'call', toolId: 'other', arguments: {} }, effect: 'non-idempotent' } }, { ...events[1]!, cursor: 4 })
  vi.spyOn(f.source, 'events').mockResolvedValue({ ...page, events, latestCursor: events.length, nextCursor: events.length })
  await expect(api.importWorkflowRun(f.options)).rejects.toThrow(/effect/i)
  expect(await f.target.get(f.options.targetKey)).toBeUndefined()
})

test.each(['source', 'target'] as const)('%s lease loss denies publication/commit instead of reviving stale import authority', async side => {
  const f = await fixture()
  vi.mocked(f.targetArtifacts.provider.stage).mockImplementation(async () => { (side === 'source' ? f.sourceHarness : f.targetHarness).advance(60001); return f.sourceArtifacts.manifest })
  await expect(api.importWorkflowRun(f.options)).rejects.toThrow(/stale-lease/i)
  expect(f.targetArtifacts.provider.publish).not.toHaveBeenCalled()
  expect((await f.target.get(f.options.targetKey))?.importState?.phase).toBe('pending')
})

test('imports through public remote target ports over synthetic authenticated ephemeral loopback', async () => {
  const f = await fixture(), principal = f.options.principal
  const coordinator = createWorkflowCoordinator({ store: f.target, artifacts: f.targetArtifacts.provider,
    authenticate: async request => request.headers.authorization === 'synthetic-import-bob' ? principal : undefined,
    authorize: async () => true, workerAllowed: async () => true })
  const server = createServer(coordinator.handler)
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('fixture')
  const options = { endpoint: `http://127.0.0.1:${address.port}/v1/workflow`, fetch, authorizeRequest: async () => ({ authorization: 'synthetic-import-bob' }) }
  const target = createRemoteRunStore(options), targetArtifacts = createRemoteArtifactProvider(options)
  try {
    const imported = await api.importWorkflowRun({ ...f.options, target, targetArtifacts })
    expect(imported.lineage).toEqual(f.options.sourceKey)
    expect(imported.importState?.phase).toBe('completed')
    expect(await target.get(f.options.targetKey)).toEqual(imported)
    expect(Buffer.from(await targetArtifacts.read(imported.workspace, 'result.txt')).toString()).toBe('immutable result')
    expect(await target.pending('tenant', 256)).toEqual([])
  } finally {
    await target.close(); server.close(); await once(server, 'close'); await coordinator.close()
  }
})

test('create-response loss leaves an atomic admission barrier and retry keeps one receipt; final settlement is atomic', async () => {
  const f = await fixture(), rawCreate = f.target.create.bind(f.target), rawCommit = f.target.commit.bind(f.target)
  const created = vi.spyOn(f.target, 'create').mockImplementationOnce(async (...args) => { await rawCreate(...args); throw new Error('response lost') })
  await expect(api.importWorkflowRun(f.options)).rejects.toThrow('response lost')
  expect(created.mock.calls[0]![0].importState?.phase).toBe('pending')
  const receipt = (await f.target.pending('tenant', 256))[0]!
  expect((await f.target.get(f.options.targetKey))?.importState?.phase).toBe('pending')
  const commits = vi.spyOn(f.target, 'commit').mockImplementation(async input => {
    if (input.snapshot.importState?.phase === 'completed') expect(input.receipt).toMatchObject({ id: receipt.id, phase: 'completed' })
    return rawCommit(input)
  })
  await api.importWorkflowRun(f.options)
  expect(commits.mock.calls.filter(([input]) => input.snapshot.importState?.phase === 'completed')).toHaveLength(1)
  expect((await f.target.receipt('tenant', receipt.id))?.phase).toBe('completed')
})

test('interrupted final commit resumes complete journal prefix without duplicating completed work', async () => {
  const f = await fixture(), raw = f.target.commit.bind(f.target)
  const commits = vi.spyOn(f.target, 'commit').mockImplementation(async input => input.snapshot.importState?.phase === 'completed' ? { status: 'conflict' } : raw(input))
  await expect(api.importWorkflowRun(f.options)).rejects.toThrow(/conflict/)
  expect((await f.target.events(f.options.targetKey, 0, 256)).events).toHaveLength(2)
  commits.mockRestore()
  const imported = await api.importWorkflowRun(f.options)
  expect(imported.importState?.phase).toBe('completed')
  expect((await f.target.events(f.options.targetKey, 0, 256)).events.filter(event => event.type === 'task.effect.completed')).toHaveLength(1)
})

test('malicious manifest aliases and target staging substitutions cannot publish', async () => {
  for (const kind of ['alias', 'prefix', 'substitution']) {
    const f = await fixture(), entry = f.sourceArtifacts.manifest.entries[0]!
    if (kind !== 'substitution') vi.mocked(f.sourceArtifacts.provider.manifest).mockResolvedValue({ ...f.sourceArtifacts.manifest,
      entries: kind === 'alias' ? [entry, { ...entry, path: 'RESULT.TXT' }] : [entry, { ...entry, path: 'result.txt/child' }] })
    else vi.mocked(f.targetArtifacts.provider.stage).mockResolvedValue({ ...f.sourceArtifacts.manifest, entries: [{ ...entry, digest: 'sha256:' + 'a'.repeat(64) }] })
    await expect(api.importWorkflowRun(f.options)).rejects.toThrow(/artifact|path/i)
    expect(f.targetArtifacts.provider.publish).not.toHaveBeenCalled()
  }
})

test('pending import fingerprint binds verified manifest bytes, not just an opaque revision label', async () => {
  const f = await fixture()
  vi.mocked(f.targetArtifacts.provider.publish).mockRejectedValueOnce(new Error('interrupted'))
  await expect(api.importWorkflowRun(f.options)).rejects.toThrow('interrupted')
  const changed = Buffer.from('different immutable bytes')
  vi.mocked(f.sourceArtifacts.provider.manifest).mockResolvedValue({ revision: f.sourceArtifacts.revision, entries: [{ path: 'result.txt', digest: digest(changed), size: changed.length, executable: false }] })
  vi.mocked(f.sourceArtifacts.provider.read).mockResolvedValue(changed)
  await expect(api.importWorkflowRun(f.options)).rejects.toThrow(/conflict/i)
})

test('imported failed run reconstructs with its completed effect journal rather than repeating the effect', async () => {
  const f = await fixture({ status: 'failed', tasks: [{ taskId: 'task', phase: 'failed', attempt: 1 }] })
  const imported = await api.importWorkflowRun(f.options), definition = f.options.definitions.resolve('flow', '1')
  const parent = await f.target.claim('tenant', ['run:remote', 'workspace:' + imported.workspace.workspaceId], 'bob', 60000)
  if (parent.status !== 'acquired') throw new Error('fixture')
  const effect = vi.fn()
  try {
    const result = await api.runDurableWorkflow({ key: imported.key, principal: f.options.principal, lease: parent.lease, store: f.target, artifacts: f.targetArtifacts.provider, definition, signal: new AbortController().signal, concurrency: 1,
      prepareTask: async () => ({ namespace: 'tenant', workspaceId: 'reconstructed-task', revision: f.sourceArtifacts.revision }),
      executeTask: async context => {
        const admission = await context.journal.begin({ id: 'call', toolId: 'tool', arguments: {} }, 'non-idempotent')
        if (admission === 'new') effect()
        expect(admission).toBe('completed'); expect(await context.journal.result('call')).toBe('done')
        return { outcome: { result: { status: 'ok', data: 'done', summary: 'reconstructed' } }, workspace: { ...context.workspace, revision: f.sourceArtifacts.revision }, staged: f.sourceArtifacts.manifest, publicationLease: context.lease }
      } })
    expect(result.status).toBe('succeeded'); expect(effect).not.toHaveBeenCalled()
    expect((await f.target.events(imported.key, 0, 256)).events.filter(event => event.type === 'task.effect.completed')).toHaveLength(1)
    expect(await f.source.get(f.snapshot.key)).toEqual(f.snapshot)
  } finally { await f.target.release(parent.lease) }
})

test('retry refuses divergent pending target checkpoint/context rather than merging it away', async () => {
  const f = await fixture()
  vi.mocked(f.targetArtifacts.provider.publish).mockRejectedValueOnce(new Error('interrupted'))
  await expect(api.importWorkflowRun(f.options)).rejects.toThrow('interrupted')
  const pending = (await f.target.get(f.options.targetKey))!
  const claim = await f.target.claim('tenant', ['run:remote', 'workspace:' + pending.workspace.workspaceId], 'bob', 60000)
  if (claim.status !== 'acquired') throw new Error('fixture')
  await f.target.commit({ snapshot: { ...pending, revision: pending.revision + 1, context: { divergent: true } }, expectedRevision: pending.revision, lease: claim.lease, events: [] })
  await f.target.release(claim.lease)
  await expect(api.importWorkflowRun(f.options)).rejects.toThrow(/conflict/i)
  expect((await f.target.get(f.options.targetKey))?.context).toEqual({ divergent: true })
})

test('unknown effect record versions do not silently become portable proof', async () => {
  const f = await fixture(), page = await f.source.events(f.snapshot.key, 0, 256)
  const events = [...page.events, { ...page.events[0]!, cursor: 3, type: 'task.effect.unknown', payload: { taskId: 'task', attempt: 1 } }]
  vi.spyOn(f.source, 'events').mockResolvedValue({ ...page, events, latestCursor: 3, nextCursor: 3 })
  await expect(api.importWorkflowRun(f.options)).rejects.toThrow(/effect/i)
})

test('bounded history transfer resumes a durable prefix across multiple pages', async () => {
  const f = await fixture(), source = await f.source.get(f.snapshot.key)
  const claim = await f.source.claim('tenant', ['run:local', 'workspace:parent'], 'alice', 60000)
  if (!source || claim.status !== 'acquired') throw new Error('fixture')
  const events = Array.from({ length: 150 }, (_, index): { type: string; payload: JsonValue }[] => [
    { type: 'task.effect.started', payload: { taskId: 'task', attempt: 1, call: { id: 'extra-' + index, toolId: 'tool', arguments: {} }, effect: 'read-only' } },
    { type: 'task.effect.completed', payload: { taskId: 'task', attempt: 1, callId: 'extra-' + index, result: null } },
  ]).flat()
  let snapshot = source
  for (let offset = 0; offset < events.length; offset += 256) {
    const result = await f.source.commit({ snapshot: { ...snapshot, revision: snapshot.revision + 1 }, expectedRevision: snapshot.revision, lease: claim.lease, events: events.slice(offset, offset + 256) })
    if (result.status !== 'committed') throw new Error('fixture'); snapshot = result.snapshot
  }
  await f.source.release(claim.lease)
  const raw = f.target.commit.bind(f.target), commits = vi.spyOn(f.target, 'commit')
  commits.mockImplementationOnce(raw).mockRejectedValueOnce(new Error('interrupted history'))
  await expect(api.importWorkflowRun(f.options)).rejects.toThrow('interrupted history')
  expect((await f.target.events(f.options.targetKey, 0, 256)).latestCursor).toBe(256)
  commits.mockRestore()
  await api.importWorkflowRun(f.options)
  expect((await f.target.events(f.options.targetKey, 256, 256)).latestCursor).toBe(303)
  expect((await f.target.pending('tenant', 256))).toEqual([])
})
