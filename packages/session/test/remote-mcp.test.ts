import { describe, expect, it } from 'vitest'
import {
  createRemoteMcpClient,
  RemoteMcpError,
  type StreamableHttpTransport,
} from '../src/index.ts'

function response(body: unknown, status = 200): Readonly<{ status: number; text(): Promise<string> }> {
  return { status, text: async () => JSON.stringify(body) }
}

describe('createRemoteMcpClient', () => {
  it('posts exact JSON-RPC requests and increments ids', async () => {
    const requests: Array<{ url: string; init: Parameters<StreamableHttpTransport['request']>[1] }> = []
    const transport: StreamableHttpTransport = {
      request: async (url, init) => {
        requests.push({ url, init })
        const body = JSON.parse(init.body) as { id: number }
        return response({ jsonrpc: '2.0', id: body.id, result: { ok: true } })
      },
    }
    const client = createRemoteMcpClient({
      transport,
      headers: { authorization: 'Bearer test' },
    })

    await client.request('https://mcp.example.test/mcp', 'tools/list', { cursor: null })
    await client.request('https://mcp.example.test/mcp', 'tools/call', { name: 'echo' })

    expect(requests.map(({ url, init }) => ({ url, method: init.method, headers: init.headers, body: init.body }))).toEqual([
      {
        url: 'https://mcp.example.test/mcp',
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          authorization: 'Bearer test',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { cursor: null } }),
      },
      {
        url: 'https://mcp.example.test/mcp',
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          authorization: 'Bearer test',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'echo' } }),
      },
    ])
  })

  it('returns a valid result response', async () => {
    const client = createRemoteMcpClient({
      transport: { request: async () => response({ jsonrpc: '2.0', id: 1, result: { tools: [] } }) },
    })

    await expect(client.request('https://mcp.example.test/mcp', 'tools/list', {})).resolves.toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: { tools: [] },
    })
  })

  it('rejects a response with a mismatched id', async () => {
    const client = createRemoteMcpClient({
      transport: { request: async () => response({ jsonrpc: '2.0', id: 99, result: null }) },
    })

    await expect(client.request('https://mcp.example.test/mcp', 'ping', {})).rejects.toMatchObject({
      code: 'BRAMBO_SANDBOX_RESPONSE_INVALID',
    })
  })

  it('rejects an MCP error response', async () => {
    const client = createRemoteMcpClient({
      transport: { request: async () => response({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'method not found' } }) },
    })

    await expect(client.request('https://mcp.example.test/mcp', 'missing', {})).rejects.toMatchObject({
      code: 'BRAMBO_EXECUTOR_RUN_FAILED',
      requestId: 1,
    })
  })

  it('rejects non-2xx responses', async () => {
    const client = createRemoteMcpClient({
      transport: { request: async () => response('not used', 503) },
    })

    await expect(client.request('https://mcp.example.test/mcp', 'ping', {})).rejects.toMatchObject({
      code: 'BRAMBO_EXECUTOR_RUN_FAILED',
      requestId: 1,
    })
  })

  it('distinguishes caller abort from timeout', async () => {
    const transport: StreamableHttpTransport = {
      request: (_url, init) => new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('transport aborted')), { once: true })
      }),
    }
    const client = createRemoteMcpClient({ transport, timeoutMs: 50 })
    const controller = new AbortController()
    const aborted = client.request('https://mcp.example.test/mcp', 'ping', {}, controller.signal)
    controller.abort()
    await expect(aborted).rejects.toMatchObject({
      code: 'BRAMBO_EXECUTOR_CANCELLED',
      message: expect.stringContaining('aborted'),
    })

    const timedOut = client.request('https://mcp.example.test/mcp', 'ping', {})
    await expect(timedOut).rejects.toMatchObject({
      code: 'BRAMBO_EXECUTOR_CANCELLED',
      message: expect.stringContaining('timed out'),
    })
  })

  it('throws the public remote MCP error type', async () => {
    const client = createRemoteMcpClient({
      transport: { request: async () => response({ jsonrpc: '2.0', id: 1, error: { code: 1, message: 'nope' } }) },
    })

    await expect(client.request('https://mcp.example.test/mcp', 'ping', {})).rejects.toBeInstanceOf(RemoteMcpError)
  })
})