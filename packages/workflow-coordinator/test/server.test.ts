import { Readable } from 'node:stream'
import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http'
import http from 'node:http'
import net from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  ArtifactProvider,
  Command,
  CommandReceipt,
  JsonValue,
  Principal,
  ProtocolResponse,
  RunKey,
  RunSnapshot,
  RunStore,
} from '@brambodev/contracts'

const user: Principal = { namespace: 'tenant-a', subject: 'alice' }
const key: RunKey = { namespace: 'tenant-a', runId: 'run-1' }
const snapshot: RunSnapshot = {
  schemaVersion: 1,
  key,
  revision: 0,
  workflowId: 'workflow-1',
  workflowVersion: '1.0.0',
  sessionId: 'session-1',
  status: 'pending',
  workspace: { namespace: 'tenant-a', workspaceId: 'workspace-1', revision: 'sha256:workspace' },
  tasks: [],
  context: {},
  cancelRequested: false,
}
const command: Command = {
  key,
  clientId: 'client-1',
  idempotencyKey: 'command-1',
  kind: 'start',
  payload: {},
}

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
  authenticate?: (request: IncomingMessage) => Promise<Principal | undefined>
  authorize?: (principal: Principal, operation: string, resource: JsonValue) => Promise<boolean>
  workerAllowed?: (principal: Principal) => Promise<boolean>
  maxBodyBytes?: number
}

async function coordinator(hooks: Hooks = {}) {
  const { createWorkflowCoordinator } = await import('../src/server.ts')
  const store = makeStore()
  const artifacts = makeArtifacts()
  const instance = createWorkflowCoordinator({
    store,
    artifacts,
    authenticate: hooks.authenticate ?? (async () => user),
    authorize: hooks.authorize ?? (async () => true),
    workerAllowed: hooks.workerAllowed ?? (async () => false),
    ...(hooks.maxBodyBytes === undefined ? {} : { maxBodyBytes: hooks.maxBodyBytes }),
  })
  return { ...instance, store, artifacts }
}

async function send(
  handler: RequestListener,
  body: string | Uint8Array,
): Promise<{ statusCode: number; raw: string; response: ProtocolResponse }> {
  const request = Readable.from([Buffer.from(body)]) as unknown as IncomingMessage
  Object.assign(request, {
    method: 'POST',
    url: '/v1/workflow',
    headers: { 'content-type': 'application/json' },
  })

  let raw = ''
  const response = {
    statusCode: 200,
    setHeader: vi.fn(),
    end: (chunk?: string | Uint8Array) => {
      raw = chunk === undefined ? '' : Buffer.from(chunk).toString('utf8')
    },
  } as unknown as ServerResponse

  await (handler as unknown as (req: IncomingMessage, res: ServerResponse) => Promise<void>)(request, response)
  return { statusCode: response.statusCode, raw, response: JSON.parse(raw) as ProtocolResponse }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('workflow coordinator listener', () => {
  it('requires host authentication and authorization callbacks', async () => {
    const { createWorkflowCoordinator } = await import('../src/server.ts')

    expect(() => createWorkflowCoordinator({ store: makeStore(), artifacts: makeArtifacts() } as never)).toThrow()
  })

  it('imports without creating or listening on a server', async () => {
    const createServer = vi.spyOn(http, 'createServer')
    const listen = vi.spyOn(net.Server.prototype, 'listen')

    await import('../src/server.ts')

    expect(createServer).not.toHaveBeenCalled()
    expect(listen).not.toHaveBeenCalled()
  })

  it('passes the authenticated principal to create instead of accepting an actor from the body', async () => {
    const harness = await coordinator()
    const receipt: CommandReceipt = { id: 'receipt-1', command, actor: user, phase: 'accepted' }
    vi.mocked(harness.store.create).mockResolvedValue({ status: 'accepted', receipt })

    const result = await send(harness.handler, JSON.stringify({
      version: 1,
      operation: 'create',
      payload: { snapshot, command },
    }))

    expect(result.response.status).toBe('ok')
    expect(harness.store.create).toHaveBeenCalledWith(snapshot, command, user)
  })

  it('denies unauthenticated reads, replay and commands without calling a port', async () => {
    const harness = await coordinator({ authenticate: async () => undefined })
    const requests = [
      { operation: 'get', payload: { key } },
      { operation: 'events', payload: { key, after: 0, limit: 10 } },
      { operation: 'create', payload: { snapshot, command } },
    ] as const

    for (const request of requests) {
      const result = await send(harness.handler, JSON.stringify({ version: 1, ...request }))
      expect(result.response).toMatchObject({ version: 1, status: 'denied', code: 'denied' })
    }

    expect(harness.store.get).not.toHaveBeenCalled()
    expect(harness.store.events).not.toHaveBeenCalled()
    expect(harness.store.create).not.toHaveBeenCalled()
  })

  it('returns bounded invalid responses for malformed JSON and unsupported protocol requests', async () => {
    const harness = await coordinator()
    for (const body of [
      '{',
      JSON.stringify({ version: 2, operation: 'get', payload: { key } }),
      JSON.stringify({ version: 1, operation: 'execute', payload: {} }),
    ]) {
      const result = await send(harness.handler, body)
      expect(result.statusCode).toBe(400)
      expect(result.response).toMatchObject({ version: 1, status: 'invalid', code: 'invalid_request' })
    }
  })

  it('drains oversized request chunks before delivering 413 without buffering the remainder', async () => {
    const harness = await coordinator({ maxBodyBytes: 8 })
    const chunks = [Buffer.alloc(4), Buffer.alloc(5), ...Array.from({ length: 8 }, () => new Uint8Array(64 * 1024))]
    const state = { index: 0, yielded: 0, finished: false, returned: false }
    const request = {
      method: 'POST',
      url: '/v1/workflow',
      headers: { 'content-type': 'application/json' },
      [Symbol.asyncIterator]() {
        return {
          next: async () => {
            if (state.index === chunks.length) {
              state.finished = true
              return { done: true, value: undefined }
            }
            state.yielded += 1
            return { done: false, value: chunks[state.index++] }
          },
          return: async () => {
            state.returned = true
            return { done: true, value: undefined }
          },
        }
      },
    } as unknown as IncomingMessage

    let raw = ''
    let delivered = false
    const response = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: (chunk?: string | Uint8Array) => {
        if (state.finished) {
          delivered = true
          raw = chunk === undefined ? '' : typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)
        }
      },
    } as unknown as ServerResponse
    const from = vi.spyOn(Buffer, 'from')
    const concat = vi.spyOn(Buffer, 'concat')

    await (harness.handler as unknown as (req: IncomingMessage, res: ServerResponse) => Promise<void>)(request, response)

    expect(delivered).toBe(true)
    expect(response.statusCode).toBe(413)
    expect(JSON.parse(raw)).toMatchObject({ status: 'invalid', code: 'body_too_large' })
    expect(state.yielded).toBe(chunks.length)
    expect(state.finished).toBe(true)
    expect(state.returned).toBe(false)
    expect(from).not.toHaveBeenCalled()
    expect(concat).not.toHaveBeenCalled()
  })

  it('rejects a body over one MiB while streaming before authentication or port calls', async () => {
    const authenticate = vi.fn(async () => user)
    const harness = await coordinator({ authenticate })
    const result = await send(harness.handler, new Uint8Array(1024 * 1024 + 1))

    expect(result.statusCode).toBe(413)
    expect(result.response).toMatchObject({ version: 1, status: 'invalid', code: 'body_too_large' })
    expect(authenticate).not.toHaveBeenCalled()
    expect(harness.store.get).not.toHaveBeenCalled()
    expect(harness.artifacts.stage).not.toHaveBeenCalled()
  })
})
