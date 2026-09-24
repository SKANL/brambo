import { describe, expect, it } from 'vitest'
import { createPermissionAuthorizer } from '../src/permissions.ts'
import { createPromptAdmissionStore, createSessionSupervisor } from '../src/acp.ts'
import { createTestAuditSink, createTestClock, createTestExecutor, createTestPolicy, createTestReplayStore, createTestTimer } from './contract-kit.ts'

describe('kernel contract kit', () => {
  it('drives sequential turns and rejects invalid transitions', () => {
    const session = createSessionSupervisor('contract-session')
    expect(session.start().ok).toBe(true)
    expect(session.beginTurn('missing').ok).toBe(false)
    expect(session.queueTurn('one').ok).toBe(true)
    expect(session.beginTurn('one').ok).toBe(true)
    expect(session.completeTurn().ok).toBe(true)
    expect(session.queueTurn('two').ok).toBe(true)
    expect(session.beginTurn('two').ok).toBe(true)
    expect(session.cancelTurn().ok).toBe(true)
    expect(session.completeTurn().ok).toBe(false)
    expect(session.complete().ok).toBe(true)
    expect(session.close().ok).toBe(true)
  })

  it('keeps executor fakes deterministic', async () => {
    const executor = createTestExecutor<string>()
    await executor.run('first')
    await executor.run('second')
    expect(executor.calls).toEqual(['first', 'second'])
  })

  it('covers all permission scopes, deny precedence, expiry and automatic fail-closed', async () => {
    const clock = createTestClock(100)
    const timer = createTestTimer(clock)
    const audit = createTestAuditSink()
    const authorizer = createPermissionAuthorizer({ clock, timer, auditSink: audit.sink, policy: createTestPolicy(() => { throw new Error('unavailable') }) })
    const base = { action: 'fs.write', sessionId: 's', workspaceId: 'w' }
    authorizer.addGrant({ id: 'session', scope: { kind: 'session', sessionId: 's' }, decision: 'allow', reason: { kind: 'user' }, source: { kind: 'session' } })
    authorizer.addGrant({ id: 'workspace-deny', scope: { kind: 'workspace', workspaceId: 'w' }, decision: 'deny', reason: { kind: 'policy', policyId: 'lock' }, source: { kind: 'workspace' } })
    expect((await authorizer.authorize({ id: 'r1', ...base })).kind).toBe('denied')
    const temporary = authorizer.addGrant({ id: 'action', scope: { kind: 'action', action: 'fs.read' }, decision: 'allow', reason: { kind: 'user' }, source: { kind: 'action' }, expiresAt: 110 })
    expect((await authorizer.authorize({ id: 'r2', action: 'fs.read', sessionId: 's', workspaceId: 'w2' })).kind).toBe('approved')
    clock.advance(11); timer.runDue()
    expect((await authorizer.authorize({ id: 'r3', action: 'fs.read', sessionId: 's', workspaceId: 'w2' })).kind).toBe('approved') // session grant remains valid
    expect(temporary.id).toBe('action')
    const failed = await authorizer.authorize({ id: 'r4', action: 'unknown', sessionId: 'x', workspaceId: 'y' })
    expect(failed.kind).toBe('denied')
    expect(audit.events.some((event) => event.type === 'permission.expired')).toBe(true)
  })

  it('tests replay overflow and prompt duplicate/conflict contracts', () => {
    const replay = createTestReplayStore<string>(2)
    replay.append('a'); replay.append('b'); replay.append('c')
    expect(replay.readAfter(0).status).toBe('overflow')
    expect(replay.readAfter(1).entries.map((entry) => entry.update)).toEqual(['b', 'c'])
    const admission = createPromptAdmissionStore()
    const accepted = admission.admit({ clientId: 'c', idempotencyKey: 'k', payload: { prompt: 'x' } })
    expect(accepted.status).toBe('accepted')
    expect(admission.admit({ clientId: 'c', idempotencyKey: 'k', payload: { prompt: 'x' } }).status).toBe('duplicate')
    expect(admission.admit({ clientId: 'c', idempotencyKey: 'k', payload: { prompt: 'y' } }).status).toBe('conflict')
  })
})

