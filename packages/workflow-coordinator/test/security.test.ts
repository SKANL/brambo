import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import type { ArtifactProvider, JsonValue, Lease, Principal, ProtocolResponse, RunStore } from '@brambodev/contracts'

const principal: Principal = { namespace: 'tenant-a', subject: 'worker-7' }
const otherPrincipal: Principal = { namespace: 'tenant-a', subject: 'alice' }

function makeStore(): RunStore {
  return {
    create: vi.fn(),
    admit: vi.fn(),
    get: vi.fn(),
    receipt: vi.fn(),
    pending: vi.fn(),
    commit: vi.fn(),
    events: vi.fn(),
    claim: vi.fn(),
    renew: vi.fn(),
    release: vi.fn(),
    valid: vi.fn(),
    close: vi.fn(),
  } as unknown as RunStore
}

function makeArtifacts(): ArtifactProvider {
  return {
    stage: vi.fn(),
    manifest: vi.fn(),
    read: vi.fn(),
    materialize: vi.fn(),
    publish: vi.fn(),
  } as unknown as ArtifactProvider
}

type Hooks = {
  authenticate?: () => Promise<Principal | undefined>
  authorize?: (p: Principal, operation: string, resource: JsonValue) => Promise<boolean>
  workerAllowed?: () => Promise<boolean>
}

async function coordinator(hooks: Hooks = {}) {
  const { createWorkflowCoordinator } = await import('../src/server.ts')
  const store = makeStore()
  const artifacts = makeArtifacts()
  const instance = createWorkflowCoordinator({
    store,
    artifacts,
    authenticate: async () => await (hooks.authenticate?.() ?? Promise.resolve(principal)),
    authorize: hooks.authorize ?? (async () => true),
    workerAllowed: hooks.workerAllowed ?? (async () => true),
  })
  return { ...instance, store, artifacts }
}

async function send(handler: RequestListener, payload: Record<string, unknown>): Promise<{ response: ProtocolResponse; raw: string }> {
  const request = Readable.from([Buffer.from(JSON.stringify({ version: 1, ...payload }))]) as unknown as IncomingMessage
  Object.assign(request, { method: 'POST', url: '/v1/workflow', headers: { 'content-type': 'application/json' } })

  let raw = ''
  const response = {
    statusCode: 200,
    setHeader: vi.fn(),
    end: (chunk?: string | Uint8Array) => { raw = chunk === undefined ? '' : Buffer.from(chunk).toString('utf8') },
  } as unknown as ServerResponse

  await (handler as unknown as (req: IncomingMessage, res: ServerResponse) => Promise<void>)(request, response)
  return { response: JSON.parse(raw) as ProtocolResponse, raw }
}

describe('workflow coordinator security boundary', () => {
  it('denies cross-tenant reads before revealing or querying another tenant', async () => {
    const harness = await coordinator({ authenticate: async () => otherPrincipal })
    const result = await send(harness.handler, {
      operation: 'get',
      payload: { key: { namespace: 'tenant-b', runId: 'private-run' } },
    })

    expect(result.response).toMatchObject({ status: 'denied', code: 'denied' })
    expect(result.raw).not.toContain('private-run')
    expect(harness.store.get).not.toHaveBeenCalled()
  })

  it('does not allow an ordinary authenticated client to claim worker authority', async () => {
    const harness = await coordinator({ workerAllowed: async () => false })
    const result = await send(harness.handler, {
      operation: 'claim',
      payload: { resources: ['run:run-1'], ttlMs: 30_000 },
    })

    expect(result.response).toMatchObject({ status: 'denied', code: 'denied' })
    expect(harness.store.claim).not.toHaveBeenCalled()
  })

  it('derives claim namespace and owner from the authenticated principal, not request fields', async () => {
    const calls: string[] = []
    const harness = await coordinator({
      authenticate: async () => { calls.push('authenticate'); return principal },
      authorize: async () => { calls.push('authorize'); return true },
      workerAllowed: async () => { calls.push('workerAllowed'); return true },
    })
    const lease: Lease = {
      namespace: 'tenant-a',
      ownerId: 'worker-7',
      token: 'secret-lease-token',
      expiresAt: 60_000,
      epochs: { 'run:run-1': 1 },
    }
    vi.mocked(harness.store.claim).mockImplementation(async () => {
      calls.push('claim')
      return { status: 'acquired', lease }
    })

    const spoofed = await send(harness.handler, {
      operation: 'claim',
      payload: { namespace: 'tenant-a', ownerId: 'victim', resources: ['run:run-1'], ttlMs: 30_000 },
    })
    expect(spoofed.response.status).toBe('invalid')
    expect(harness.store.claim).not.toHaveBeenCalled()
    calls.length = 0

    const claimed = await send(harness.handler, {
      operation: 'claim',
      payload: { resources: ['run:run-1'], ttlMs: 30_000 },
    })
    expect(claimed.response.status).toBe('ok')
    expect(harness.store.claim).toHaveBeenCalledWith('tenant-a', ['run:run-1'], 'worker-7', 30_000)
    expect(claimed.response.payload).toEqual({ status: 'acquired', lease })
    expect(claimed.raw).toContain('secret-lease-token')
    expect(calls).toEqual(['authenticate', 'authorize', 'workerAllowed', 'claim'])
  })

  it('requires worker token ownership to match both authenticated namespace and subject', async () => {
    const harness = await coordinator()
    const lease: Lease = {
      namespace: 'tenant-a',
      ownerId: 'another-worker',
      token: 'secret-token',
      expiresAt: 60_000,
      epochs: { 'run:run-1': 1 },
    }
    const result = await send(harness.handler, { operation: 'valid', payload: { lease } })

    expect(result.response).toMatchObject({ status: 'denied', code: 'denied' })
    expect(result.raw).not.toContain('secret-token')
    expect(harness.store.valid).not.toHaveBeenCalled()
  })

  it('does not pass bearer lease tokens to the host authorization callback', async () => {
    const resources: JsonValue[] = []
    const harness = await coordinator({
      authorize: async (_principal, _operation, resource) => { resources.push(resource); return true },
    })
    const lease: Lease = {
      namespace: 'tenant-a',
      ownerId: 'worker-7',
      token: 'secret-authorize-token',
      expiresAt: 60_000,
      epochs: { 'run:run-1': 1 },
    }
    vi.mocked(harness.store.valid).mockResolvedValue(true)
    const result = await send(harness.handler, { operation: 'valid', payload: { lease } })

    expect(result.response).toMatchObject({ status: 'ok', payload: { valid: true } })
    expect(harness.store.valid).toHaveBeenCalledWith(lease)
    expect(JSON.stringify(resources)).not.toContain('secret-authorize-token')
  })

  it('denies a worker lease from another namespace before calling the store', async () => {
    const harness = await coordinator()
    const lease: Lease = {
      namespace: 'tenant-b',
      ownerId: 'worker-7',
      token: 'secret-cross-tenant-token',
      expiresAt: 60_000,
      epochs: { 'run:run-1': 1 },
    }
    const result = await send(harness.handler, { operation: 'valid', payload: { lease } })

    expect(result.response).toMatchObject({ status: 'denied', code: 'denied' })
    expect(result.raw).not.toContain('secret-cross-tenant-token')
    expect(harness.store.valid).not.toHaveBeenCalled()
  })

  it('denies an ordinary authenticated client worker-only commit before calling the store', async () => {
    const harness = await coordinator({ workerAllowed: async () => false })
    const next = {
      schemaVersion: 1 as const,
      key: { namespace: 'tenant-a', runId: 'run-1' },
      revision: 1,
      workflowId: 'workflow-1',
      workflowVersion: '1.0.0',
      sessionId: 'session-1',
      status: 'running' as const,
      workspace: { namespace: 'tenant-a', workspaceId: 'workspace-1', revision: 'sha256:workspace' },
      tasks: [],
      context: {},
      cancelRequested: false,
    }
    const authority: Lease = {
      namespace: 'tenant-a',
      ownerId: 'worker-7',
      token: 'secret-commit-token',
      expiresAt: 60_000,
      epochs: { 'run:run-1': 1, 'workspace:workspace-1': 1 },
    }
    const result = await send(harness.handler, {
      operation: 'commit',
      payload: { input: { snapshot: next, expectedRevision: 0, lease: authority, events: [] } },
    })

    expect(result.response).toMatchObject({ status: 'denied', code: 'denied' })
    expect(result.raw).not.toContain('secret-commit-token')
    expect(harness.store.commit).not.toHaveBeenCalled()
  })

  it('denies renew and release tokens from another subject before calling the store', async () => {
    const harness = await coordinator()
    const lease: Lease = {
      namespace: 'tenant-a',
      ownerId: 'another-worker',
      token: 'secret-cross-subject-token',
      expiresAt: 60_000,
      epochs: { 'run:run-1': 1 },
    }
    const renewal = await send(harness.handler, { operation: 'renew', payload: { lease, ttlMs: 30_000 } })
    const release = await send(harness.handler, { operation: 'release', payload: { lease } })

    expect(renewal.response).toMatchObject({ status: 'denied', code: 'denied' })
    expect(release.response).toMatchObject({ status: 'denied', code: 'denied' })
    expect(renewal.raw).not.toContain('secret-cross-subject-token')
    expect(release.raw).not.toContain('secret-cross-subject-token')
    expect(harness.store.renew).not.toHaveBeenCalled()
    expect(harness.store.release).not.toHaveBeenCalled()
  })

  it('applies current authorization before artifact reads and exposes no tool execution operation', async () => {
    const harness = await coordinator({ authorize: async () => false })
    const artifactResult = await send(harness.handler, {
      operation: 'artifact.read',
      payload: {
        ref: { namespace: 'tenant-a', workspaceId: 'workspace-1', revision: 'sha256:rev' },
        path: 'README.md',
      },
    })
    expect(artifactResult.response).toMatchObject({ status: 'denied', code: 'denied' })
    expect(harness.artifacts.read).not.toHaveBeenCalled()

    const execution = await send(harness.handler, { operation: 'tool.execute', payload: { command: 'unsafe' } })
    expect(execution.response.status).toBe('invalid')
    expect(harness.store.commit).not.toHaveBeenCalled()
    expect(harness.artifacts.stage).not.toHaveBeenCalled()
  })

  it('redacts internal port errors and does not close host-owned ports', async () => {
    const harness = await coordinator()
    vi.mocked(harness.store.get).mockRejectedValue(new Error('secret-token=private'))
    const failure = await send(harness.handler, {
      operation: 'get',
      payload: { key: { namespace: 'tenant-a', runId: 'run-1' } },
    })
    expect(failure.response).toMatchObject({ status: 'unavailable', code: 'unavailable' })
    expect(failure.raw).not.toContain('private')

    await harness.close()
    expect(harness.store.close).not.toHaveBeenCalled()
  })

  it('rejects client filesystem paths before an upload reaches the artifact provider', async () => {
    const harness = await coordinator()
    const result = await send(harness.handler, {
      operation: 'artifact.stage',
      payload: { files: [{ path: '../../outside.txt', contentBase64: 'aGVsbG8=', executable: false }] },
    })

    expect(result.response.status).toBe('invalid')
    expect(harness.artifacts.stage).not.toHaveBeenCalled()
  })

  it('stages bounded uploaded bytes under a generated private directory and removes it afterward', async () => {
    const harness = await coordinator()
    const expected = {
      revision: 'sha256:uploaded',
      entries: [{
        path: 'nested/hello.txt',
        digest: 'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
        size: 5,
        executable: false,
      }],
    }
    let temporaryDirectory: string | undefined
    vi.mocked(harness.artifacts.stage).mockImplementation(async (namespace, directory) => {
      temporaryDirectory = directory
      expect(namespace).toBe('tenant-a')
      expect(await readFile(join(directory, 'nested', 'hello.txt'), 'utf8')).toBe('hello')
      return expected
    })

    const result = await send(harness.handler, {
      operation: 'artifact.stage',
      payload: { files: [{ path: 'nested/hello.txt', contentBase64: 'aGVsbG8=', executable: false }] },
    })

    expect(result.response).toMatchObject({ status: 'ok', payload: expected })
    expect(harness.artifacts.stage).toHaveBeenCalledWith('tenant-a', expect.any(String))
    expect(temporaryDirectory).toBeDefined()
    expect(existsSync(temporaryDirectory!)).toBe(false)
  })
})
