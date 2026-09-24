import { describe, expect, it } from 'vitest'
import {
  createPermissionAuthorizer,
  type PermissionAuditEvent,
  type PermissionDecisionPolicy,
  type PermissionGrantInput,
  type PermissionRequestContext,
} from '../src/permissions.ts'

function request(overrides: Partial<PermissionRequestContext> = {}): PermissionRequestContext {
  return { id: 'request-1', action: 'filesystem.write', sessionId: 'session-1', workspaceId: 'workspace-1', ...overrides }
}

function grant(overrides: Partial<PermissionGrantInput> = {}): PermissionGrantInput {
  return {
    id: 'grant-1',
    scope: { kind: 'action', action: 'filesystem.write' },
    decision: 'allow',
    reason: { kind: 'user', message: 'approved' },
    source: { kind: 'user', id: 'operator-1' },
    ...overrides,
  }
}

describe('scoped permission authorizer', () => {
  it('resolves action, workspace, and session scopes with most-specific allow precedence', async () => {
    const authorizer = createPermissionAuthorizer({ clock: { now: () => 100 } })
    authorizer.addGrant(grant({ id: 'session', scope: { kind: 'session', sessionId: 'session-1' } }))
    authorizer.addGrant(grant({ id: 'workspace', scope: { kind: 'workspace', workspaceId: 'workspace-1' } }))
    authorizer.addGrant(grant({ id: 'action', scope: { kind: 'action', action: 'filesystem.write' } }))

    const result = await authorizer.authorize(request())
    expect(result).toMatchObject({ kind: 'approved', grant: { id: 'action' } })
  })

  it('lets a matching explicit deny override every allow scope', async () => {
    const authorizer = createPermissionAuthorizer({ clock: { now: () => 100 } })
    authorizer.addGrant(grant({ id: 'allow', scope: { kind: 'action', action: 'filesystem.write' } }))
    authorizer.addGrant(grant({ id: 'deny', decision: 'deny', scope: { kind: 'session', sessionId: 'session-1' }, reason: { kind: 'policy', policyId: 'locked-session' } }))

    const result = await authorizer.authorize(request())
    expect(result).toMatchObject({ kind: 'denied', grant: { id: 'deny' }, reason: { kind: 'policy', policyId: 'locked-session' } })
  })

  it('ignores expired grants and revocation takes effect immediately', async () => {
    let now = 100
    const authorizer = createPermissionAuthorizer({ clock: { now: () => now } })
    authorizer.addGrant(grant({ expiresAt: 150 }))
    expect((await authorizer.authorize(request())).kind).toBe('approved')
    now = 151
    expect((await authorizer.authorize(request())).kind).toBe('ask')
    const replacement = authorizer.addGrant(grant({ id: 'replacement' }))
    expect((await authorizer.authorize(request())).kind).toBe('approved')
    expect(authorizer.revoke(replacement.id, { kind: 'revoked', message: 'operator revoked' })).toBe(true)
    expect(authorizer.grants.find((item) => item.id === replacement.id)).toMatchObject({ revokedAt: 151, revokedReason: { kind: 'revoked' } })
    expect((await authorizer.authorize(request())).kind).toBe('ask')
  })

  it('evaluates optional policy decisions and fails closed when policy throws', async () => {
    const policy: PermissionDecisionPolicy = {
      evaluate(input) {
        if (input.action === 'safe.read') return { kind: 'allow', reason: { kind: 'automatic', ruleId: 'safe-read' } }
        if (input.action === 'dangerous.write') return { kind: 'deny', reason: { kind: 'automatic', ruleId: 'deny-dangerous' } }
        throw new Error('policy unavailable')
      },
    }
    const authorizer = createPermissionAuthorizer({ clock: { now: () => 100 }, policy })
    expect((await authorizer.authorize(request({ action: 'safe.read' }))).kind).toBe('approved')
    expect((await authorizer.authorize(request({ action: 'dangerous.write' }))).kind).toBe('denied')
    const failed = await authorizer.authorize(request({ action: 'unknown' }))
    expect(failed).toMatchObject({ kind: 'denied', reason: { kind: 'system' } })
  })

  it('emits typed audit events without raw metadata or arguments', async () => {
    const events: PermissionAuditEvent[] = []
    const authorizer = createPermissionAuthorizer({
      clock: { now: () => 100 },
      auditSink: { append: (event) => { events.push(event) } },
    })
    const added = authorizer.addGrant(grant())
    await authorizer.authorize(request({ metadata: { secret: 'do-not-store' } }))
    authorizer.revoke(added.id, { kind: 'revoked', message: 'done' })
    expect(events.map((event) => event.type)).toEqual(['permission.grant.created', 'permission.approved', 'permission.revoked'])
    expect(events.every((event) => !('metadata' in event) && !('arguments' in event))).toBe(true)
    expect(events[1]).toMatchObject({ action: 'filesystem.write', sessionId: 'session-1', workspaceId: 'workspace-1' })
  })

  it('fails closed when audit persistence rejects an authorization event', async () => {
    const authorizer = createPermissionAuthorizer({
      clock: { now: () => 100 },
      auditSink: { append: async () => { throw new Error('audit unavailable') } },
    })
    authorizer.addGrant(grant())
    const result = await authorizer.authorize(request())
    expect(result).toMatchObject({ kind: 'denied', reason: { kind: 'system', message: 'permission audit persistence failed' } })
  })
})


