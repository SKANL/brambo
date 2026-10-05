import { describe, expect, it } from 'vitest'
import type { DriverRequest, DriverServices, ExecutorAdapter, RunRequest } from '@brambodev/contracts'
import { runExecutorContractSuite } from '@brambodev/contracts'
import * as orchestration from '../src/index.ts'
import { createCliDriverFactory, createDriverRegistry, negotiateCapabilities } from '../src/index.ts'

it('exposes injected CLI driver creation', () => {
  expect(orchestration).toHaveProperty('createCliDriverFactory', expect.any(Function))
})

const services: DriverServices = {
  dispatchTool: async () => { throw new Error('not used') },
  resolveSecret: async () => { throw new Error('not used') },
}
const request: DriverRequest = {
  key: { namespace: 'test', runId: 'run-1' }, sessionId: 'session-1', taskId: 'task-1',
  prompt: 'already reconstructed authorized prompt', context: { private: 'must not append' },
  workspace: { id: 'workspace-1', rootPath: '/private-workspace', capabilities: ['read', 'write'] },
  continuation: 'fresh', signal: new AbortController().signal,
}
const cancelled = { status: 'cancelled' as const, data: null, summary: 'cancelled', errors: [{ message: 'aborted' }] }
function cancellableAdapter(): ExecutorAdapter {
  return { run: async ({ signal }) => {
    await Promise.resolve()
    return signal?.aborted ? cancelled : { status: 'ok', data: { nativeId: 'not-a-binding' }, summary: 'completed' }
  } }
}
async function registeredDriver(id: 'claude-code' | 'codex' | 'opencode', createAdapter = cancellableAdapter) {
  const registry = createDriverRegistry()
  registry.register(createCliDriverFactory({ id, createAdapter }))
  return registry.resolve(id).create({}, services)
}

describe('injected CLI drivers', () => {
  it.each(['claude-code', 'codex', 'opencode'] as const)('forwards a fresh prompt to %s without context, argv or identity invention', async (id) => {
    let received: RunRequest | undefined
    const driver = await registeredDriver(id, () => ({ run: async (input) => {
      received = input
      return { status: 'ok', data: { nativeId: 'provider-session' }, summary: 'completed' }
    } }))
    const outcome = await driver.run(request)
    expect(received).toEqual({ prompt: 'already reconstructed authorized prompt', workspace: request.workspace, signal: request.signal })
    expect(outcome).toEqual({ result: { status: 'ok', data: { nativeId: 'provider-session' }, summary: 'completed' } })
    expect(driver.manifest.kind).toBe('cli')
  })

  it('does not infer interception, streaming or native continuation from a CLI identity', async () => {
    const driver = await registeredDriver('codex')
    expect(negotiateCapabilities({ driver: driver.manifest, runtime: ['streaming', 'tool-interception', 'native-continuation', 'context-reconstruction'], policy: ['streaming', 'tool-interception', 'native-continuation', 'context-reconstruction'], required: [], optional: ['streaming', 'tool-interception', 'native-continuation', 'context-reconstruction'] })).toEqual({ effective: ['context-reconstruction'], degraded: ['streaming', 'tool-interception', 'native-continuation'] })
  })

  it('refuses unsupported native continuation without invoking the adapter', async () => {
    let executions = 0
    const driver = await registeredDriver('claude-code', () => ({ run: async () => { executions++; return cancelled } }))
    await expect(driver.run({ ...request, continuation: 'native' })).rejects.toThrow(/native continuation.*unsupported/)
    expect(executions).toBe(0)
  })

  it('returns cancellation for an already aborted request without invoking the adapter', async () => {
    let executions = 0
    const driver = await registeredDriver('opencode', () => ({ run: async () => { executions++; return cancelled } }))
    const controller = new AbortController()
    controller.abort('secret-canary')
    expect((await driver.run({ ...request, signal: controller.signal })).result.status).toBe('cancelled')
    expect(executions).toBe(0)
  })

  it('propagates live abort and preserves the adapter cancellation envelope', async () => {
    const driver = await registeredDriver('codex')
    const controller = new AbortController()
    const pending = driver.run({ ...request, signal: controller.signal })
    controller.abort()
    expect((await pending).result).toEqual(cancelled)
  })

  it('does not turn an aborted signal into fabricated termination proof', async () => {
    const driver = await registeredDriver('codex', () => ({ run: async () => { await Promise.resolve(); return { status: 'ok', data: null, summary: 'already completed' } } }))
    const controller = new AbortController()
    const pending = driver.run({ ...request, signal: controller.signal })
    controller.abort()
    expect((await pending).result.status).toBe('ok')
  })

  it('refuses malformed adapter results', async () => {
    const driver = await registeredDriver('codex', () => ({ run: async () => ({ status: 'cancelled', summary: 'missing required fields' }) } as unknown as ExecutorAdapter))
    await expect(driver.run(request)).rejects.toThrow(/schema violation/)
  })

  it('refuses nonempty configuration before constructing the injected adapter', async () => {
    let constructions = 0
    const registry = createDriverRegistry()
    registry.register(createCliDriverFactory({ id: 'codex', createAdapter: () => { constructions++; return cancellableAdapter() } }))
    await expect(registry.resolve('codex').create({ secret: 'secret-canary' }, services)).rejects.toThrow(/invalid driver configuration/)
    expect(constructions).toBe(0)
  })

  it('keeps the existing executor contract unchanged', async () => {
    expect((await runExecutorContractSuite(cancellableAdapter())).passed).toBe(true)
  })
})

it('delivers authorized reconstructed context through CLI prompt composition', async () => {
  let received: RunRequest | undefined
  const driver = await registeredDriver('codex', () => ({ run: async input => { received = input; return { status: 'ok', data: null, summary: 'done' } } }))
  await driver.run({ ...request, continuation: 'reconstructed', prompt: 'current task', context: { ref: { revision: 'durable-revision' }, events: ['prior-task-completed'] } })
  expect(received?.prompt).toContain('current task')
  expect(received?.prompt).toContain('durable-revision')
  expect(received?.prompt).toContain('prior-task-completed')
  expect(received?.prompt).not.toContain('nativeSessionId')
})
