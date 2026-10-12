import { describe, expect, it } from 'vitest'
import {
  createStdioJsonRpcClient,
  type PermissionDecision,
  type StdioProcess,
} from '../src/index.ts'

function fakeProcess() {
  const dataListeners: ((chunk: string | Uint8Array) => void)[] = []
  const lifecycle = new Map<string, ((error?: unknown) => void)[]>()
  const writes: string[] = []
  const process: StdioProcess = {
    stdin: { write: (value) => { writes.push(value); return true } },
    stdout: { on: (_event, listener) => { dataListeners.push(listener) }, removeListener: () => {} },
    on: (event, listener) => { lifecycle.set(event, [...(lifecycle.get(event) ?? []), listener]) },
  }
  return {
    process,
    writes,
    feed(value: string | Uint8Array) { for (const listener of dataListeners) listener(value) },
    close() { for (const listener of lifecycle.get('close') ?? []) listener() },
    error(error: Error) { for (const listener of lifecycle.get('error') ?? []) listener(error) },
  }
}

async function response(fake: ReturnType<typeof fakeProcess>, result: unknown) {
  const request = JSON.parse(fake.writes.at(-1)!) as { id: number }
  fake.feed(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result })}\n`)
}

describe('ACP stdio JSON-RPC client', () => {
  it('sends initialize and session lifecycle requests with typed ids', async () => {
    const fake = fakeProcess()
    const client = createStdioJsonRpcClient(fake.process)
    const initialize = client.initialize({ clientName: 'test' })
    expect(JSON.parse(fake.writes[0]!)).toMatchObject({ jsonrpc: '2.0', method: 'initialize', id: 1 })
    fake.feed('{"jsonrpc":"2.0","id":1,"result":{"capabilities":{}}}\n')
    await expect(initialize).resolves.toEqual({ capabilities: {} })
    const session = client.sessionNew({ cwd: '/tmp' })
    expect(JSON.parse(fake.writes[1]!)).toMatchObject({ method: 'session/new', id: 2 })
    await response(fake, { sessionId: 's-1' })
    await expect(session).resolves.toEqual({ sessionId: 's-1' })
  })

  it('delivers updates and answers permission notifications explicitly', async () => {
    const fake = fakeProcess()
    const updates: unknown[] = []
    const decisions: PermissionDecision[] = []
    const client = createStdioJsonRpcClient(fake.process, {
      onUpdate: (update) => updates.push(update),
      onPermission: async () => { const decision = { kind: 'approved' as const }; decisions.push(decision); return decision },
    })
    fake.feed(`${JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { text: 'hi' } })}\n`)
    fake.feed(JSON.stringify({ jsonrpc: '2.0', id: 44, method: 'session/request_permission', params: { action: 'write' } }) + '\n')
    await Promise.resolve()
    expect(updates).toEqual([{ method: 'session/update', params: { text: 'hi' } }])
    expect(decisions).toEqual([{ kind: 'approved' }])
    expect(JSON.parse(fake.writes[0]!)).toMatchObject({ jsonrpc: '2.0', id: 44, result: { kind: 'approved' } })
    client.close()
  })

  it('rejects pending requests on malformed frames, oversized frames, and process close', async () => {
    const fake = fakeProcess()
    const client = createStdioJsonRpcClient(fake.process, { maxFrameBytes: 20 })
    const pending = client.sessionLoad({ sessionId: 's-1' })
    fake.feed('{not-json}\n')
    await expect(pending).rejects.toMatchObject({ code: 'malformed-frame' })
    const fake2 = fakeProcess()
    const client2 = createStdioJsonRpcClient(fake2.process)
    const closed = client2.sessionLoad({ sessionId: 's-1' })
    fake2.close()
    await expect(closed).rejects.toMatchObject({ code: 'process-closed' })
    const fake3 = fakeProcess()
    const client3 = createStdioJsonRpcClient(fake3.process, { maxFrameBytes: 4 })
    const oversized = client3.sessionLoad({ sessionId: 's-1' })
    fake3.feed('abcdef')
    await expect(oversized).rejects.toMatchObject({ code: 'frame-too-large' })
    const fake4 = fakeProcess()
    const client4 = createStdioJsonRpcClient(fake4.process)
    const errored = client4.sessionLoad({ sessionId: 's-1' })
    fake4.error(new Error('broken pipe'))
    await expect(errored).rejects.toMatchObject({ code: 'process-error' })
    client.close()
  })

  it('supports prompt and cancel methods and deterministic cleanup', async () => {
    const fake = fakeProcess()
    const client = createStdioJsonRpcClient(fake.process)
    const prompt = client.sessionPrompt({ sessionId: 's-1', prompt: 'hello' })
    expect(JSON.parse(fake.writes[0]!)).toMatchObject({ method: 'session/prompt' })
    await response(fake, { accepted: true })
    await expect(prompt).resolves.toEqual({ accepted: true })
    await expect(client.sessionCancel({ sessionId: 's-1' })).resolves.toBeUndefined()
    client.close()
    expect(() => client.close()).not.toThrow()
  })

  it('sends session/cancel as a notification without an id', async () => {
    const fake = fakeProcess()
    const client = createStdioJsonRpcClient(fake.process)
    await client.sessionCancel({ sessionId: 's-1' })
    const sent = JSON.parse(fake.writes[0]!) as Record<string, unknown>
    expect(sent).toEqual({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId: 's-1' } })
    expect('id' in sent).toBe(false)
    client.close()
  })

  it('answers unhandled server-initiated requests with an integer method-not-found error', async () => {
    const fake = fakeProcess()
    const updates: unknown[] = []
    const client = createStdioJsonRpcClient(fake.process, { onUpdate: (update) => updates.push(update) })
    fake.feed(JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'fs/read_text_file', params: { path: 'a' } }) + '\n')
    const reply = JSON.parse(fake.writes[0]!) as { id: number; error: { code: unknown } }
    expect(reply).toMatchObject({ jsonrpc: '2.0', id: 7, error: { code: -32601 } })
    expect(Number.isInteger(reply.error.code)).toBe(true)
    expect(updates).toEqual([])
    client.close()
  })

  it('reports a failing permission handler with an integer JSON-RPC error code', async () => {
    const fake = fakeProcess()
    const client = createStdioJsonRpcClient(fake.process, { onPermission: async () => { throw new Error('boom') } })
    fake.feed(JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'session/request_permission', params: {} }) + '\n')
    await new Promise((resolve) => setTimeout(resolve, 0))
    const reply = JSON.parse(fake.writes[0]!) as { error: { code: unknown } }
    expect(Number.isInteger(reply.error.code)).toBe(true)
    client.close()
  })

  it('checks frame size in linear time when a frame arrives in many small chunks', async () => {
    const fake = fakeProcess()
    const client = createStdioJsonRpcClient(fake.process, { maxFrameBytes: 8 * 1024 * 1024 })
    const pending = client.sessionLoad({ sessionId: 's-1' })
    const chunk = 'x'.repeat(100)
    const started = performance.now()
    for (let index = 0; index < 20_000; index += 1) fake.feed(chunk)
    expect(performance.now() - started).toBeLessThan(1000)
    client.close()
    await expect(pending).rejects.toMatchObject({ code: 'client-closed' })
  }, 60_000)

  it('decodes multi-byte characters split across byte chunks', () => {
    const fake = fakeProcess()
    const updates: unknown[] = []
    const client = createStdioJsonRpcClient(fake.process, { onUpdate: (update) => updates.push(update) })
    const bytes = new TextEncoder().encode(JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { text: 'café' } }) + '\n')
    const split = bytes.indexOf(0xc3) + 1
    fake.feed(bytes.slice(0, split))
    fake.feed(bytes.slice(split))
    expect(updates).toEqual([{ method: 'session/update', params: { text: 'café' } }])
    client.close()
  })
})
