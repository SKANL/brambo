import { describe, expect, it, vi } from 'vitest'
import { type JsonObject, type JsonValue, type ToolInvocation, UncertainToolEffectError } from '@brambodev/contracts'
import * as session from '../src/index.ts'
import { call, signal, tool, options } from './workflow-tools.fixture.ts'

describe('durable workflow tools', () => {
  it('exports the dispatcher and bridge', () => {
    expect(session.createWorkflowToolDispatcher).toBeTypeOf('function')
    expect(session.createExistingToolBridge).toBeTypeOf('function')
  })
  it('denies absent authorization and unknown tools before execution', async () => {
    const execute = vi.fn(async () => null)
    const base = options([tool(execute)])
    await expect(session.createWorkflowToolDispatcher({ ...base, authorize: undefined as never })(call, signal)).rejects.toThrow(/authorization/)
    await expect(session.createWorkflowToolDispatcher(base)({ ...call, toolId: 'unknown' }, signal)).rejects.toThrow(/unknown tool/)
    expect(execute).not.toHaveBeenCalled()
    expect(base.records.size).toBe(0)
  })
  it('validates async schemas before authorization and executes validated output', async () => {
    let authorized = 0
    let received: JsonObject | undefined
    const registered = { ...tool(async (args) => { received = args; return null }), inputSchema: { '~standard': { version: 1 as const,
      validate: async (value: unknown) => Object.keys(value as object).length ? { value: { normalized: true } } : { issues: [{ message: 'bad' }] } } } }
    const dispatch = session.createWorkflowToolDispatcher({ ...options([registered]), authorize: async () => { authorized++; return true } })
    await expect(dispatch(call, signal)).rejects.toThrow(/arguments/)
    expect(authorized).toBe(0)
    await dispatch({ ...call, arguments: { input: true } }, signal)
    expect(received).toEqual({ normalized: true })
  })
  it('replays without execution after current authorization and conflicts on payload changes', async () => {
    let runs = 0
    let allowed = true
    const base = options([tool(async () => { runs++; return { done: true } })])
    const dispatch = session.createWorkflowToolDispatcher({ ...base, authorize: async () => allowed })
    expect(await dispatch(call, signal)).toEqual({ done: true })
    expect(await dispatch(call, signal)).toEqual({ done: true })
    await expect(dispatch({ ...call, arguments: { changed: true } }, signal)).rejects.toThrow(/conflict/)
    allowed = false
    await expect(dispatch(call, signal)).rejects.toThrow(/authorization/)
    expect(runs).toBe(1)
  })
  it('leaves crash-after-dispatch uncertain and never retries', async () => {
    let runs = 0
    const dispatch = session.createWorkflowToolDispatcher(options([tool(async () => { runs++; throw new Error('crash') })]))
    await expect(dispatch(call, signal)).rejects.toBeInstanceOf(UncertainToolEffectError)
    await expect(dispatch(call, signal)).rejects.toBeInstanceOf(UncertainToolEffectError)
    expect(runs).toBe(1)
  })
  it('checks cancellation and revocation after an awaited approval', async () => {
    const execute = vi.fn(async () => null)
    const controller = new AbortController()
    const base = options([tool(execute)])
    const dispatch = session.createWorkflowToolDispatcher({ ...base, authorize: async () => { controller.abort(); return true } })
    await expect(dispatch(call, controller.signal)).rejects.toThrow(/cancel/)
    expect(base.records.size).toBe(0)
    expect(execute).not.toHaveBeenCalled()
    let checks = 0
    const revoked = session.createWorkflowToolDispatcher({ ...base, authorize: async () => ++checks === 1 })
    await expect(revoked(call, signal)).rejects.toThrow(/authorization/)
    expect(base.records.size).toBe(0)
  })
  it.each([undefined, NaN, new Date(), { bad: undefined }, Object.defineProperty({}, 'hidden', { value: 'x' })])('rejects non-JSON output without finishing (%s)', async (output) => {
    const base = options([tool(async () => output as JsonValue)])
    await expect(session.createWorkflowToolDispatcher(base)(call, signal)).rejects.toBeInstanceOf(UncertainToolEffectError)
    expect(base.records.get(call.id)).not.toHaveProperty('result')
  })
  it('uses real local invocation argv and refuses missing bridge approval', async () => {
    const execution = vi.fn(async (request: { invocation: ToolInvocation }) => { void request; return ({ status: 'ok' as const, stdout: 'ok', stderr: '', exitCode: 0,
      enforcement: { version: 1 as const, providerId: 'test', enforcement: 'simulated' as const, controls: { filesystem: 'full' as const, network: 'none' as const, process: 'none' as const, resources: 'none' as const } } }) })
    const context = { cwd: '/workspace', environment: {}, policy: { version: 1 as const, mode: 'read-only' as const, workspaceRoot: '/workspace', requiredCapabilities: { filesystem: 'full' as const } } }
    const bridgeOptions = { id: 'write', invocation: { tool: { kind: 'local' as const, argv: ['node'] as [string] }, arguments: [] }, context, execute: execution }
    const denied = session.createExistingToolBridge(bridgeOptions)
    await expect(session.createWorkflowToolDispatcher(options([denied]))({ ...call, arguments: { argv: ['file.js'] } }, signal)).rejects.toThrow(/approval/)
    expect(execution).not.toHaveBeenCalled()
    const bridge = session.createExistingToolBridge({ ...bridgeOptions, approveTool: async () => true })
    await session.createWorkflowToolDispatcher(options([bridge]))({ ...call, arguments: { argv: ['file.js'] } }, signal)
    expect(execution.mock.calls[0]?.[0].invocation).toEqual({ tool: { kind: 'local', argv: ['node'] }, arguments: ['file.js'] })
  })
})



describe('authority across durable awaits', () => {
  it('does not deliver replay after authority is revoked during result lookup', async () => {
    let allowed = true
    const base = options()
    const dispatch = session.createWorkflowToolDispatcher({ ...base, authorize: async () => allowed })
    await dispatch(call, signal)
    const originalResult = base.journal.result
    base.journal.result = async (id) => { allowed = false; return originalResult(id) }
    await expect(dispatch(call, signal)).rejects.toThrow(/authorization/)
  })
  it('does not finish when current authorization is revoked during execution', async () => {
    let allowed = true
    const base = options([tool(async () => { allowed = false; return null })])
    const dispatch = session.createWorkflowToolDispatcher({ ...base, authorize: async () => allowed })
    await expect(dispatch(call, signal)).rejects.toBeInstanceOf(UncertainToolEffectError)
    expect(base.records.get(call.id)).not.toHaveProperty('result')
  })
})

describe('durable journal failures', () => {
  it('does not deliver a newly finished result after authority is revoked while finishing', async () => {
    let allowed = true
    const base = options()
    const original = base.journal.finish
    base.journal.finish = async (id, result) => { await original(id, result); allowed = false }
    await expect(session.createWorkflowToolDispatcher({ ...base, authorize: async () => allowed })(call, signal)).rejects.toBeInstanceOf(UncertainToolEffectError)
  })
  it('does not retry after durable finish fails', async () => {
    let runs = 0
    const base = options([tool(async () => { runs++; return null })])
    base.journal.finish = async () => { throw new Error('storage error') }
    const dispatch = session.createWorkflowToolDispatcher(base)
    await expect(dispatch(call, signal)).rejects.toBeInstanceOf(UncertainToolEffectError)
    await expect(dispatch(call, signal)).rejects.toBeInstanceOf(UncertainToolEffectError)
    expect(runs).toBe(1)
  })
  it('has no process-local replay cache when the dispatcher is recreated', async () => {
    let runs = 0
    const base = options([tool(async () => { runs++; return 'saved' })])
    await session.createWorkflowToolDispatcher(base)(call, signal)
    expect(await session.createWorkflowToolDispatcher(base)(call, signal)).toBe('saved')
    expect(runs).toBe(1)
  })
  it('leaves the call uncertain when cancellation arrives during execution', async () => {
    const controller = new AbortController()
    const base = options([tool(async () => { controller.abort(); return null })])
    const dispatch = session.createWorkflowToolDispatcher(base)
    await expect(dispatch(call, controller.signal)).rejects.toThrow(/cancel/)
    expect(base.records.get(call.id)).not.toHaveProperty('result')
    await expect(dispatch(call, signal)).rejects.toThrow(/uncertain/)
  })
  it('passes MCP JSON directly without replacing the host-selected transport', async () => {
    let received: unknown
    const bridge = session.createExistingToolBridge({ id: 'write', invocation: { tool: { kind: 'mcp-stdio', argv: ['server'], name: 'host-tool' }, arguments: {} },
      context: { cwd: '/workspace', environment: {}, policy: { version: 1, mode: 'read-only', workspaceRoot: '/workspace', requiredCapabilities: { filesystem: 'full' } } },
      approveTool: async () => true, execute: async (request) => { received = request.invocation; return { status: 'ok', stdout: '', stderr: '', exitCode: 0,
        enforcement: { version: 1, providerId: 'test', enforcement: 'simulated', controls: { filesystem: 'full', network: 'none', process: 'none', resources: 'none' } } } } })
    await session.createWorkflowToolDispatcher(options([bridge]))({ ...call, arguments: { count: 1 } }, signal)
    expect(received).toEqual({ tool: { kind: 'mcp-stdio', argv: ['server'], name: 'host-tool' }, arguments: { count: 1 } })
  })
})

describe('review regressions: effective arguments and execution authority', () => {
  it('authorizes effective transformed arguments while journaling original payload', async () => {
    let executed: unknown
    const approvedArguments: unknown[] = []
    const registered = { ...tool(async (args) => { executed = args; return null }), inputSchema: { '~standard': { version: 1 as const,
      validate: async () => ({ value: { resource: '/protected' } }) } } }
    const base = options([registered])
    const original = { ...call, arguments: { resource: '/allowed' } }
    const denied = session.createWorkflowToolDispatcher({ ...base, authorize: async (_, __, effective) => effective.arguments.resource === '/allowed' })
    await expect(denied(original, signal)).rejects.toThrow(/authorization/)
    expect(executed).toBeUndefined()
    const dispatch = session.createWorkflowToolDispatcher({ ...base, authorize: async (_, __, effective) => { approvedArguments.push(effective.arguments); return effective.arguments.resource === '/protected' } })
    await dispatch(original, signal)
    expect(executed).toEqual({ resource: '/protected' })
    expect(approvedArguments.length).toBeGreaterThan(0)
    expect(approvedArguments.every((args) => JSON.stringify(args) === JSON.stringify(executed))).toBe(true)
    expect(JSON.parse(base.records.get(call.id)!.payload)).toEqual(original)
  })
  it('rechecks actor authority after the bridge awaits its execution-boundary approval', async () => {
    let allowed = true
    let executions = 0
    const bridge = session.createExistingToolBridge({ id: 'write', invocation: { tool: { kind: 'local', argv: ['node'] }, arguments: [] },
      context: { cwd: '/workspace', environment: {}, policy: { version: 1, mode: 'read-only', workspaceRoot: '/workspace', requiredCapabilities: { filesystem: 'full' } } },
      approveTool: async () => { await Promise.resolve(); allowed = false; return true }, execute: async () => { executions++; throw new Error('executor reached') } })
    const run = bridge.secretBinding!.execute
    await expect(run({ argv: [] }, {}, signal, async () => { if (!allowed) throw new Error('authorization denied') })).rejects.toThrow(/authorization/)
    expect(executions).toBe(0)
  })
  it('rechecks actor authority after the legacy approval wrapper awaits', async () => {
    let allowed = true
    let legacyBoundary = false
    let effects = 0
    const bridge = session.createExistingToolBridge({ id: 'write', invocation: { tool: { kind: 'local', argv: ['node'] }, arguments: [] },
      context: { cwd: '/workspace', environment: {}, policy: { version: 1, mode: 'read-only', workspaceRoot: '/workspace', requiredCapabilities: { filesystem: 'full' } } },
      approveTool: async () => { await Promise.resolve(); if (legacyBoundary) allowed = false; return true },
      execute: async (request) => { legacyBoundary = true; await request.approveTool!({ invocation: request.invocation, context: request.context }); effects++; throw new Error('effect reached') } })
    await expect(session.createWorkflowToolDispatcher({ ...options([bridge]), authorize: async () => allowed })({ ...call, arguments: { argv: [] } }, signal)).rejects.toBeInstanceOf(UncertainToolEffectError)
    expect(effects).toBe(0)
  })
})
