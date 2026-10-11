import { describe, expect, it } from 'vitest'
import { createWorkflowToolDispatcher, createExistingToolBridge, executeTool, type WorkflowToolRegistration } from '../src/index.ts'
import { call, options, signal, tool } from './workflow-tools.fixture.ts'

describe('workflow secret boundary', () => {
  it('looks up host references only after authorization and durable admission, redacting keys and values before persistence', async () => {
    const order: string[] = []
    const registration: WorkflowToolRegistration = { ...tool(), secretBinding: { references: { token: 'host-reference' },
      async execute(args, secrets) { order.push('execute'); expect(args).toEqual({}); expect(secrets.token).toBe('secret-canary'); return { 'secret-canary': ['secret-canary'] } } } }
    const base = options([registration])
    const originalBegin = base.journal.begin
    base.journal.begin = async (...args) => { order.push('begin'); return originalBegin(...args) }
    const dispatch = createWorkflowToolDispatcher({ ...base, authorize: async () => { order.push('authorize'); return true },
      resolveSecret: async (reference) => { expect(reference).toBe('host-reference'); order.push('secret'); return 'secret-canary' } })
    const result = await dispatch(call, signal)
    expect(order.indexOf('begin')).toBeLessThan(order.indexOf('secret'))
    expect(order.indexOf('authorize')).toBeLessThan(order.indexOf('begin'))
    expect(JSON.stringify([result, [...base.records.values()]])).not.toContain('secret-canary')
  })
  it('does not resolve on denial or completed replay', async () => {
    let lookups = 0
    let allowed = false
    const registration: WorkflowToolRegistration = { ...tool(), secretBinding: { references: { token: 'ref' }, execute: async () => 'secret-canary' } }
    const dispatch = createWorkflowToolDispatcher({ ...options([registration]), authorize: async () => allowed, resolveSecret: async () => { lookups++; return 'secret-canary' } })
    await expect(dispatch(call, signal)).rejects.toThrow(/authorization/)
    expect(lookups).toBe(0)
    allowed = true
    expect(await dispatch(call, signal)).toBe('[REDACTED]')
    expect(await dispatch(call, signal)).toBe('[REDACTED]')
    expect(lookups).toBe(1)
  })
  it('suppresses secret-bearing exceptions and isolates concurrent bindings', async () => {
    const registration: WorkflowToolRegistration = { ...tool(), secretBinding: { references: { token: 'ref' },
      execute: async (_, secrets) => { await Promise.resolve(); throw new Error(secrets.token) } } }
    let counter = 0
    const dispatch = createWorkflowToolDispatcher({ ...options([registration]), resolveSecret: async () => `canary-${++counter}` })
    const outcomes = await Promise.allSettled([dispatch(call, signal), dispatch({ ...call, id: 'call-2' }, signal)])
    for (const result of outcomes) { expect(result.status).toBe('rejected'); if (result.status === 'rejected') expect(String(result.reason)).not.toContain('canary-') }
  })
  it('redacts legacy observer context, invocation and result before delivery', async () => {
    const events: unknown[] = []
    const bridge = createExistingToolBridge({ id: 'write', invocation: { tool: { kind: 'local', argv: ['node'] }, arguments: [] },
      context: { cwd: '/workspace', environment: {}, policy: { version: 1, mode: 'read-only', workspaceRoot: '/workspace', requiredCapabilities: { filesystem: 'full' as const } } },
      approveTool: async () => true, secretEnvironment: { API_KEY: 'host-ref' }, onToolExecution: (event) => events.push(event), execute: executeTool,
      toolExecutor: { async execute(_, context) { return { status: 'ok', stdout: context.environment.API_KEY!, stderr: '', exitCode: 0,
        enforcement: { version: 1, providerId: 'test', enforcement: 'simulated', controls: { filesystem: 'full', network: 'none', process: 'none', resources: 'none' } } } } } })
    const base = options([bridge])
    await createWorkflowToolDispatcher(base)({ ...call, arguments: { argv: [] } }, signal)
    expect(events).toHaveLength(1)
    expect(JSON.stringify([events, [...base.records.values()]])).not.toContain('secret-canary')
  })
})



describe('approval and secret isolation', () => {
  it('refuses missing bridge approval even when registration is copied, before lookup', async () => {
    let lookups = 0
    const bridge = createExistingToolBridge({ id: 'write', invocation: { tool: { kind: 'local', argv: ['node'] }, arguments: [] },
      context: { cwd: '/workspace', environment: {}, policy: { version: 1, mode: 'read-only', workspaceRoot: '/workspace', requiredCapabilities: { filesystem: 'full' } } },
      secretEnvironment: { API_KEY: 'ref' }, execute: async () => { throw new Error('must not execute') } })
    const base = options([{ ...bridge }])
    await expect(createWorkflowToolDispatcher({ ...base, resolveSecret: async () => { lookups++; return 'secret-canary' } })({ ...call, arguments: { argv: [] } }, signal)).rejects.toThrow(/approval/)
    expect(lookups).toBe(0)
    expect(base.records.size).toBe(0)
  })
  it('isolates simultaneous successful invocation secrets and saved results', async () => {
    let counter = 0
    const registration: WorkflowToolRegistration = { ...tool(), secretBinding: { references: { token: 'ref' },
      async execute(_, secrets) { await Promise.resolve(); return { token: secrets.token!, nested: [secrets.token!] } } } }
    const base = options([registration])
    const dispatch = createWorkflowToolDispatcher({ ...base, resolveSecret: async () => `canary-${++counter}` })
    const results = await Promise.all([dispatch(call, signal), dispatch({ ...call, id: 'call-2' }, signal)])
    expect(results).toEqual([{ token: '[REDACTED]', nested: ['[REDACTED]'] }, { token: '[REDACTED]', nested: ['[REDACTED]'] }])
    expect(JSON.stringify([...base.records.values()])).not.toContain('canary-')
  })
  it('suppresses a resolver exception without a known secret value', async () => {
    const registration: WorkflowToolRegistration = { ...tool(), secretBinding: { references: { token: 'ref' }, execute: async () => null } }
    const dispatch = createWorkflowToolDispatcher({ ...options([registration]), resolveSecret: async () => { throw new Error('secret-canary') } })
    const attempt = dispatch(call, signal)
    await expect(attempt).rejects.toThrow('secret resolution')
    await expect(attempt).rejects.not.toThrow('secret-canary')
  })
})

describe('review regressions: current approval before secrets', () => {
  it('does not resolve secrets when journal admission revokes mandatory approval', async () => {
    let approved = true
    let lookups = 0
    const registration: WorkflowToolRegistration = { ...tool(), approveInvocation: async () => { if (!approved) throw new Error('approval denied') },
      secretBinding: { references: { first: 'first-ref' }, execute: async () => null } }
    const base = options([registration])
    const originalBegin = base.journal.begin
    base.journal.begin = async (...args) => { const result = await originalBegin(...args); approved = false; return result }
    await expect(createWorkflowToolDispatcher({ ...base, resolveSecret: async () => { lookups++; return 'secret-canary' } })(call, signal)).rejects.toThrow(/approval/)
    expect(lookups).toBe(0)
  })
  it('does not resolve later secrets after approval is revoked during a lookup', async () => {
    let approved = true
    const lookups: string[] = []
    const registration: WorkflowToolRegistration = { ...tool(), approveInvocation: async () => { if (!approved) throw new Error('approval denied') },
      secretBinding: { references: { first: 'first-ref', second: 'second-ref' }, execute: async () => null } }
    await expect(createWorkflowToolDispatcher({ ...options([registration]), resolveSecret: async (ref) => { lookups.push(ref); approved = false; return 'secret-canary' } })(call, signal)).rejects.toThrow(/approval/)
    expect(lookups).toEqual(['first-ref'])
  })
})
