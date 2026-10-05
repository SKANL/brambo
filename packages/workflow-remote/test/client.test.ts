import { describe, expect, it, vi } from 'vitest'
import { runWorkflowStoreContractSuite } from '@brambodev/contracts'
import type { ArtifactProvider, RunStore, WorkflowStoreHarness } from '@brambodev/contracts'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createWorkflowCoordinator } from '@brambodev/workflow-coordinator'
// Reuse the same private test-only alternative backend; never publish a second backend.
// eslint-disable-next-line no-restricted-imports
import { nonSqliteHarness } from '../../contracts/test/helpers/non-sqlite-run-store.ts'
import { createRemoteRunStore } from '../src/store.ts'
import { actor, command, ok, options, snapshot } from './fixtures.ts'

describe('remote authority client', () => {
  it('queries cancellation beyond a full pending page with namespace-bound filter', async () => {
    const authority = await nonSqliteHarness().open()
    await authority.create(snapshot, command, actor)
    for (let i = 0; i < 256; i++) await authority.admit({ ...command, kind: 'continue', idempotencyKey: 'before-' + i }, actor)
    const cancel = await authority.admit({ ...command, kind: 'cancel', idempotencyKey: 'cancel' }, actor)
    if (cancel.status === 'conflict') throw new Error('fixture')
    const authorize = vi.fn(async () => true)
    const coordinator = createWorkflowCoordinator({ store: authority, artifacts: {} as ArtifactProvider,
      authenticate: async () => actor, authorize, workerAllowed: async () => true })
    const wire: typeof fetch = async (_url, init) => {
      const request = Readable.from([Buffer.from(init!.body as string)]) as unknown as IncomingMessage
      Object.assign(request, { method: 'POST', url: '/v1/workflow', headers: { 'content-type': 'application/json' } })
      let raw = ''
      const response = { statusCode: 200, setHeader() {}, end(value: string) { raw = value } } as unknown as ServerResponse
      await (coordinator.handler as unknown as (a: IncomingMessage, b: ServerResponse) => Promise<void>)(request, response)
      return new Response(raw, { status: response.statusCode })
    }
    const client = createRemoteRunStore(options(wire))
    const filter = { key: snapshot.key, kind: 'cancel' as const }
    expect(await client.pending('tenant', 256, filter)).toEqual([cancel.receipt])
    expect(authorize).toHaveBeenCalledWith(actor, 'pending', { namespace: 'tenant', limit: 256, filter })
    await expect(client.pending('tenant', 1, { key: { namespace: 'other', runId: 'run' } })).rejects.toThrow()
    await expect(client.pending('other', 1, { key: { namespace: 'other', runId: 'run' } })).rejects.toThrow()
    await client.close(); await authority.close()
  })

  it('fails closed when an older peer ignores the pending filter, even for an empty page', async () => {
    const store = createRemoteRunStore(options((async () => ok([])) as typeof fetch))
    await expect(store.pending('tenant', 256, { key: snapshot.key, kind: 'cancel' })).rejects.toThrow()
  })

  it('runs every public clause through two independent transport connections', async () => {
    const base = nonSqliteHarness()
    let authority: RunStore
    const connect = (): RunStore => {
      let context = { namespace: 'contract', subject: 'trusted-host-user' }
      const remote = createRemoteRunStore(options((async (_url, init) => {
      const { operation, payload } = JSON.parse(init!.body as string)
      const args: Record<string, unknown[]> = { create: [payload.snapshot, payload.command, context],
        admit: [payload.command, context], get: [payload.key], receipt: [payload.namespace, payload.id],
        pending: [payload.namespace, payload.limit], events: [payload.key, payload.after, payload.limit],
        commit: [payload.input], claim: [context.namespace, payload.resources, context.subject, payload.ttlMs],
        renew: [payload.lease, payload.ttlMs], release: [payload.lease], valid: [payload.lease] }
      const fn = authority[operation as keyof RunStore] as (...args: unknown[]) => Promise<unknown>
      const result = await fn(...args[operation]!)
      return ok(operation === 'valid' ? { valid: result } : operation === 'release' ? { released: true } : result ?? null)
      }) as typeof fetch))
      // Host-side test credentials explicitly select the principal for each clause.
      return new Proxy(remote, { get(target, property: keyof RunStore) {
        const fn = target[property] as (...args: unknown[]) => Promise<unknown>
        if (typeof fn !== 'function') return fn
        return (...args: unknown[]) => {
          if (property === 'create' || property === 'admit') context = args[property === 'create' ? 2 : 1] as typeof context
          if (property === 'claim') context = { namespace: args[0] as string, subject: args[2] as string }
          return fn(...args)
        }
      } })
    }
    const harness: WorkflowStoreHarness = { open: async () => { authority = await base.open(); return connect() },
      reopen: async () => connect(), advance: base.advance }
    const report = await runWorkflowStoreContractSuite(harness)
    expect(report.violations).toEqual([])
    expect(report.passed).toBe(true)
    expect(report.outcomes).toHaveLength(5)
  })
  it('does not retry dropped mutations; unchanged command retry returns the original receipt', async () => {
    const authority = await nonSqliteHarness().open()
    let first = true
    const wire = vi.fn(async (_url, init) => {
      const { payload } = JSON.parse(init!.body as string)
      const admission = await authority.create(payload.snapshot, payload.command, actor)
      if (first) { first = false; throw new Error('secret https://user:password@host.invalid') }
      return ok(admission)
    }) as unknown as typeof fetch
    const store = createRemoteRunStore(options(wire))
    await expect(store.create(snapshot, command, actor)).rejects.toThrow('Remote workflow unavailable')
    expect(wire).toHaveBeenCalledTimes(1)
    const duplicate = await store.create(snapshot, command, actor)
    expect(duplicate.status).toBe('duplicate')
    if (duplicate.status !== 'conflict') expect(duplicate.receipt.id).toBe((await authority.pending('tenant', 1))[0]!.id)
  })
  it.each([ { version: 2, status: 'ok', payload: snapshot }, { version: 1, status: 'surprise' },
    { version: 1, status: 'ok', payload: { ...snapshot, schemaVersion: 2 } } ])('refuses malformed wire %j', async (wire) => {
    await expect(createRemoteRunStore(options((async () => new Response(JSON.stringify(wire))) as typeof fetch)).get(snapshot.key)).rejects.toThrow()
  })
  it('bounds streaming response before EOF and cancels oversized bodies', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(33)) }, cancel })
    await expect(createRemoteRunStore(options((async () => new Response(stream)) as typeof fetch, { maxResponseBytes: 32 })).get(snapshot.key)).rejects.toThrow()
    expect(cancel).toHaveBeenCalledOnce()
  })
  it('redacts authorization, transport and body diagnostics and refuses URL credentials', async () => {
    expect(() => createRemoteRunStore(options(fetch, { endpoint: 'https://user:password@host.invalid/v1/workflow' }))).toThrow('Invalid remote endpoint')
    const store = createRemoteRunStore(options((async () => { throw new Error('secret') }) as typeof fetch))
    await expect(store.claim('tenant', ['run:run'], 'alice', 1000)).rejects.toThrow('Remote workflow unavailable')
  })
  it('aborts stalled authorization without dispatch and closes only local client resources', async () => {
    const signal = AbortSignal.timeout(20)
    const wire = vi.fn()
    const store = createRemoteRunStore(options(wire as typeof fetch, { signal, authorizeRequest: () => new Promise(() => {}) }))
    await expect(store.get(snapshot.key)).rejects.toThrow('Remote workflow aborted')
    expect(wire).not.toHaveBeenCalled()
    await store.close()
    await expect(store.get(snapshot.key)).rejects.toThrow('closed')
  })
  it('interoperates with Task 11 without actor/owner credentials in the body', async () => {
    const authority = await nonSqliteHarness().open()
    const coordinator = createWorkflowCoordinator({ store: authority, artifacts: {} as ArtifactProvider,
      authenticate: async () => actor, authorize: async () => true, workerAllowed: async () => true })
    const wire: typeof fetch = async (_url, init) => {
      const payload = JSON.parse(init!.body as string)
      expect(payload.payload.actor).toBeUndefined()
      expect(payload.payload.ownerId).toBeUndefined()
      const request = Readable.from([Buffer.from(init!.body as string)]) as unknown as IncomingMessage
      Object.assign(request, { method: 'POST', url: '/v1/workflow', headers: { 'content-type': 'application/json' } })
      let raw = ''
      const response = { statusCode: 200, setHeader() {}, end(value: string) { raw = value } } as unknown as ServerResponse
      await (coordinator.handler as unknown as (a: IncomingMessage, b: ServerResponse) => Promise<void>)(request, response)
      return new Response(raw, { status: response.statusCode })
    }
    const client = createRemoteRunStore(options(wire))
    expect((await client.create(snapshot, command, actor)).status).toBe('accepted')
    expect(await client.get(snapshot.key)).toEqual(snapshot)
    expect(await client.get({ namespace: 'other', runId: 'run' })).toBeUndefined()
    const claim = await client.claim('tenant', ['run:run', 'workspace:workspace'], 'alice', 1000)
    expect(claim.status).toBe('acquired')
    if (claim.status === 'acquired') {
      expect(await client.valid(claim.lease)).toBe(true)
      expect((await client.renew(claim.lease, 1000)).status).toBe('acquired')
      expect((await client.commit({ snapshot: { ...snapshot, revision: 1 }, expectedRevision: 0, lease: claim.lease, events: [] })).status).toBe('committed')
      await client.release(claim.lease)
    }
    await client.close()
    expect(await authority.get(snapshot.key)).toBeDefined()
  })
  it.each(['fetch', 'body'])('aborts stalled %s without replaying mutation', async (stage) => {
    const wire = vi.fn(async () => stage === 'fetch' ? new Promise<Response>(() => {}) : new Response(new ReadableStream()))
    const store = createRemoteRunStore(options(wire as typeof fetch, { signal: AbortSignal.timeout(20) }))
    await expect(store.claim('tenant', ['run:run'], 'alice', 1000)).rejects.toThrow('Remote workflow aborted')
    expect(wire).toHaveBeenCalledOnce()
  })
  it('never echoes raw response or host authorization secrets', async () => {
    const store = createRemoteRunStore(options((async () => new Response('secret password')) as typeof fetch))
    await expect(store.get(snapshot.key)).rejects.toThrow('Invalid remote workflow response')
    const failing = createRemoteRunStore(options(fetch, { authorizeRequest: async () => { throw new Error('secret') } }))
    await expect(failing.get(snapshot.key)).rejects.toThrow('Remote workflow unavailable')
  })
  it('freezes caller identity across host authorization and refuses mismatched admission payload', async () => {
    let resolve!: (value: Record<string, string>) => void
    const ready = new Promise<Record<string, string>>((r) => { resolve = r })
    const mutable = structuredClone(command)
    const wire = vi.fn(async (_url, init) => {
      const { payload } = JSON.parse(init!.body as string)
      return ok({ status: 'accepted', receipt: { id: 'receipt', command: payload.command, actor, phase: 'accepted' } })
    })
    const client = createRemoteRunStore(options(wire as typeof fetch, { authorizeRequest: () => ready }))
    const pending = client.admit(mutable, actor)
    Object.assign(mutable, { idempotencyKey: 'changed' })
    resolve({})
    expect((await pending).status).toBe('accepted')
    const bad = createRemoteRunStore(options((async () => ok({ status: 'duplicate', receipt: {
      id: 'receipt', command: { ...command, payload: 'different' }, actor, phase: 'accepted' } })) as typeof fetch))
    await expect(bad.admit(command, actor)).rejects.toThrow()
  })
  it.each(['status', 'context', 'tasks'])('rejects committed snapshots with changed %s', async (field) => {
    const submitted = { ...snapshot, revision: 1 }
    const changes = { status: 'succeeded', context: { changed: true }, tasks: [{ taskId: 'task', phase: 'succeeded', attempt: 1 }] }
    const remote = createRemoteRunStore(options((async () => ok({ status: 'committed',
      snapshot: { ...submitted, [field]: changes[field as keyof typeof changes] } })) as typeof fetch))
    await expect(remote.commit({ snapshot: submitted, expectedRevision: 0, events: [],
      lease: { namespace: 'tenant', ownerId: 'alice', token: 'token', expiresAt: 1000, epochs: { 'run:run': 1, 'workspace:workspace': 1 } } })).rejects.toThrow('Invalid remote workflow response')
  })
})
