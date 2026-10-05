import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { validateCommand, validateRunSnapshot } from '@brambodev/contracts'
import type { ArtifactManifest, ArtifactProvider, CommandReceipt, Lease, RunEvent, RunSnapshot, RunStore, RuntimeOutcome, WorkspaceRef } from '@brambodev/contracts'

interface FixtureState {
  snapshot?: RunSnapshot
  receipts: CommandReceipt[]
  events: RunEvent[]
  leases: Lease[]
  epochs: Record<string, number>
}
/** Single-process file authority fixture, not a production/multi-process backend. */
function fileStore(path: string): RunStore {
  let closed = false
  function read(): FixtureState {
    if (closed) throw new Error('Fixture store closed')
    return JSON.parse(readFileSync(path, 'utf8')) as FixtureState
  }
  function write(state: FixtureState): void {
    writeFileSync(path + '.tmp', JSON.stringify(state))
    renameSync(path + '.tmp', path)
  }
  function valid(state: FixtureState, lease: Lease): boolean {
    return state.leases.some((current) => current.token === lease.token && current.expiresAt === lease.expiresAt &&
      current.namespace === lease.namespace && current.ownerId === lease.ownerId &&
      JSON.stringify(current.epochs) === JSON.stringify(lease.epochs) && current.expiresAt > Date.now())
  }
  const store: RunStore = {
    async create(snapshot, command, actor) {
      const state = read()
      if (state.snapshot) return { status: 'conflict' }
      validateRunSnapshot(snapshot); validateCommand(command)
      const receipt: CommandReceipt = { id: randomUUID(), command, actor, phase: 'accepted' }
      state.snapshot = snapshot; state.receipts.push(receipt); write(state)
      return { status: 'accepted', receipt: structuredClone(receipt) }
    },
    async admit(command, actor) {
      validateCommand(command)
      const state = read()
      const existing = state.receipts.find((receipt) => receipt.command.clientId === command.clientId && receipt.command.idempotencyKey === command.idempotencyKey)
      if (existing) return JSON.stringify(existing.command) === JSON.stringify(command) && JSON.stringify(existing.actor) === JSON.stringify(actor)
        ? { status: 'duplicate', receipt: existing } : { status: 'conflict' }
      const receipt: CommandReceipt = { id: randomUUID(), command, actor, phase: 'accepted' }
      state.receipts.push(receipt); write(state)
      return { status: 'accepted', receipt: structuredClone(receipt) }
    },
    async get() { return read().snapshot },
    async receipt(_namespace, id) { return read().receipts.find((receipt) => receipt.id === id) },
    async pending(_namespace, limit) { return read().receipts.filter((receipt) => ['accepted', 'running'].includes(receipt.phase)).slice(0, limit) },
    async commit(input) {
      validateRunSnapshot(input.snapshot)
      const state = read()
      if (state.snapshot?.revision !== input.expectedRevision) return { status: 'conflict' }
      if (!valid(state, input.lease) || !Object.hasOwn(input.lease.epochs, 'run:' + input.snapshot.key.runId) ||
          !Object.hasOwn(input.lease.epochs, 'workspace:' + input.snapshot.workspace.workspaceId)) return { status: 'stale-lease' }
      if (input.snapshot.revision !== input.expectedRevision + 1) throw new Error('Invalid CAS revision')
      state.snapshot = input.snapshot
      for (const event of input.events) state.events.push({ schemaVersion: 1, key: input.snapshot.key, cursor: state.events.length + 1,
        occurredAt: new Date().toISOString(), ...event })
      if (input.receipt) {
        const index = state.receipts.findIndex((receipt) => receipt.id === input.receipt?.id)
        if (index < 0) throw new Error('Unknown receipt')
        state.receipts[index] = input.receipt
      }
      write(state)
      return { status: 'committed', snapshot: structuredClone(input.snapshot) }
    },
    async events(_key, after, limit) {
      const state = read(), events = state.events.filter((event) => event.cursor > after).slice(0, limit)
      return { status: events.length ? 'ok' : 'empty', events, latestCursor: state.events.length, nextCursor: events.at(-1)?.cursor ?? after }
    },
    async claim(namespace, resources, ownerId, ttlMs) {
      const state = read()
      if (state.leases.some((lease) => lease.expiresAt > Date.now() && resources.some((resource) => Object.hasOwn(lease.epochs, resource)))) return { status: 'contended' }
      const epochs = Object.fromEntries(resources.map((resource) => [resource, (state.epochs[resource] ?? 0) + 1]))
      const lease: Lease = { namespace, ownerId, token: randomUUID(), expiresAt: Date.now() + ttlMs, epochs }
      Object.assign(state.epochs, epochs); state.leases.push(lease); write(state)
      return { status: 'acquired', lease: structuredClone(lease) }
    },
    async renew(lease, ttlMs) {
      const state = read()
      if (!valid(state, lease)) return { status: 'contended' }
      const renewed = { ...lease, expiresAt: Date.now() + ttlMs }
      state.leases = state.leases.map((item) => item.token === lease.token ? renewed : item); write(state)
      return { status: 'acquired', lease: renewed }
    },
    async release(lease) {
      const state = read()
      state.leases = state.leases.filter((item) => item.token !== lease.token || item.expiresAt !== lease.expiresAt); write(state)
    },
    async valid(lease) { return valid(read(), lease) },
    async close() { closed = true },
  }
  return store
}

export function barrier() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}

export async function workflowFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'brambo-workflow-'))
  const path = join(directory, 'run.json')
  writeFileSync(path, JSON.stringify({ receipts: [], events: [], leases: [], epochs: {} }))
  const store = fileStore(path)
  const key = { namespace: 'tenant', runId: 'run' }
  const principal = { namespace: 'tenant', subject: 'host' }
  const snapshot: RunSnapshot = {
    schemaVersion: 1, key, revision: 0, workflowId: 'workflow', workflowVersion: '1',
    sessionId: 'session', status: 'pending', workspace: { namespace: 'tenant', workspaceId: 'parent', revision: 'base' },
    tasks: [], context: null, cancelRequested: false,
  }
  await store.create(snapshot, { key, clientId: 'host', idempotencyKey: 'start', kind: 'start', payload: null }, principal)
  const claim = await store.claim('tenant', ['run:run', 'workspace:parent'], 'host', 60_000)
  if (claim.status !== 'acquired') throw new Error('fixture lease unavailable')
  const published = new Map<string, ArtifactManifest>()
  const artifacts: ArtifactProvider = {
    async stage() { return { revision: 'output', entries: [] } },
    async manifest(ref) {
      if (ref.workspaceId === 'parent') return { revision: 'base', entries: [] }
      const manifest = published.get(ref.workspaceId + ':' + ref.revision)
      if (!manifest) throw new Error('artifact not published')
      return manifest
    },
    async publish(ref, manifest, lease) {
      if (!await store.valid(lease) || !Object.hasOwn(lease.epochs, 'workspace:' + ref.workspaceId)) throw new Error('stale publication')
      published.set(ref.workspaceId + ':' + ref.revision, structuredClone(manifest))
    },
    async read() { return new Uint8Array() },
    async materialize() { throw new Error('host materialization not used') },
  }
  const controller = new AbortController()
  const definition = {
    id: 'workflow', version: '1', tasks: ['a', 'b'].map((id) => ({
      id, dependsOn: [] as string[], driverId: 'driver', configuration: null,
      prompt: id, required: [] as string[], optional: [] as string[], maxAttempts: 2,
    })),
  }
  const options = { key, principal, lease: claim.lease, store, artifacts, definition, signal: controller.signal, concurrency: 2,
    prepareTask: async ({ taskId, attempt }: { taskId: string; attempt: number }) => ({ namespace: 'tenant', workspaceId: taskId + '-' + attempt, revision: 'base' }),
  }
  function outcome(workspace: WorkspaceRef, lease: Lease, status: 'ok' | 'failed' | 'cancelled' = 'ok'): RuntimeOutcome {
    return { workspace: { ...workspace, revision: 'output' }, publicationLease: lease,
      staged: { revision: 'output', entries: [] }, outcome: { result: {
        status, data: { value: workspace.workspaceId }, summary: status,
        ...(status === 'ok' ? {} : { errors: [{ message: status }] }),
      } } }
  }
  return { ...options, options, controller, snapshot, definition, path, published, outcome,
    async reopen() { return fileStore(path) },
    async close() { await store.close(); await rm(directory, { recursive: true, force: true }) },
  }
}
