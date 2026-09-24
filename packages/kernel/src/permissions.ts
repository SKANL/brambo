import type { PermissionTimer } from './acp.ts'

export type PermissionScope =
  | { readonly kind: 'action'; readonly action: string }
  | { readonly kind: 'session'; readonly sessionId: string }
  | { readonly kind: 'workspace'; readonly workspaceId: string }

export type PermissionReason =
  | { readonly kind: 'user'; readonly message?: string }
  | { readonly kind: 'policy'; readonly policyId: string; readonly message?: string }
  | { readonly kind: 'automatic'; readonly ruleId: string; readonly message?: string }
  | { readonly kind: 'expired'; readonly message?: string }
  | { readonly kind: 'revoked'; readonly message?: string }
  | { readonly kind: 'system'; readonly message: string }

export interface PermissionPolicySource {
  readonly kind: 'default' | 'session' | 'workspace' | 'action' | 'user' | 'automatic' | 'system'
  readonly id?: string
  readonly version?: string
}

export interface PermissionRequestContext {
  readonly id: string
  readonly action: string
  readonly sessionId?: string
  readonly turnId?: string
  readonly workspaceId?: string
  readonly reason?: PermissionReason
  readonly metadata?: Readonly<Record<string, unknown>>
}

export interface PermissionGrantInput {
  readonly id: string
  readonly scope: PermissionScope
  readonly decision: 'allow' | 'deny'
  readonly reason: PermissionReason
  readonly source: PermissionPolicySource
  readonly issuedAt?: number
  readonly expiresAt?: number
}

export interface PermissionGrant extends PermissionGrantInput {
  readonly issuedAt: number
  readonly revokedAt?: number
  readonly revokedReason?: PermissionReason
}

export interface PermissionClock { now(): number }

export type PermissionEvaluation =
  | { readonly kind: 'allow'; readonly reason: PermissionReason; readonly source?: PermissionPolicySource; readonly expiresAt?: number }
  | { readonly kind: 'deny'; readonly reason: PermissionReason; readonly source?: PermissionPolicySource }
  | { readonly kind: 'ask' }

export interface PermissionDecisionPolicy {
  evaluate(request: PermissionRequestContext): PermissionEvaluation
}

export type PermissionAuditEventType =
  | 'permission.grant.created'
  | 'permission.requested'
  | 'permission.approved'
  | 'permission.denied'
  | 'permission.expired'
  | 'permission.auto-decided'
  | 'permission.revoked'
  | 'tool.authorized'
  | 'tool.rejected'

export interface PermissionAuditEvent {
  readonly type: PermissionAuditEventType
  readonly permissionId?: string
  readonly grantId?: string
  readonly requestId?: string
  readonly sessionId?: string
  readonly turnId?: string
  readonly workspaceId?: string
  readonly action?: string
  readonly scope?: PermissionScope
  readonly source?: PermissionPolicySource
  readonly reason?: PermissionReason
  readonly occurredAt: number
  readonly expiresAt?: number
}

export interface PermissionAuditSink {
  append(event: PermissionAuditEvent): void | Promise<void>
}

export type PermissionAuthorizationResult =
  | { readonly kind: 'approved'; readonly grant: PermissionGrant }
  | { readonly kind: 'denied'; readonly reason: PermissionReason; readonly source: PermissionPolicySource; readonly grant?: PermissionGrant }
  | { readonly kind: 'ask' }

export interface PermissionAuthorizerOptions {
  readonly clock?: PermissionClock
  readonly timer?: PermissionTimer
  readonly policy?: PermissionDecisionPolicy
  readonly auditSink?: PermissionAuditSink
}

export interface PermissionAuthorizer {
  readonly grants: readonly PermissionGrant[]
  addGrant(input: PermissionGrantInput): PermissionGrant
  revoke(id: string, reason?: PermissionReason): boolean
  authorize(request: PermissionRequestContext): Promise<PermissionAuthorizationResult>
}

const defaultClock: PermissionClock = { now: () => Date.now() }
const noopTimer: PermissionTimer = {
  setTimeout: (callback, timeoutMs) => globalThis.setTimeout(callback, timeoutMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
}

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new TypeError(`${label} must be non-empty`)
}

function scopeMatches(scope: PermissionScope, request: PermissionRequestContext): boolean {
  if (scope.kind === 'action') return scope.action === request.action
  if (scope.kind === 'session') return scope.sessionId === request.sessionId
  return scope.workspaceId === request.workspaceId
}

function scopeSpecificity(scope: PermissionScope): number {
  return scope.kind === 'action' ? 3 : scope.kind === 'workspace' ? 2 : 1
}

function expirationReason(): PermissionReason {
  return { kind: 'expired', message: 'permission grant expired' }
}

function cloneGrant(input: PermissionGrantInput, now: number): PermissionGrant {
  const issuedAt = input.issuedAt ?? now
  if (!Number.isFinite(issuedAt)) throw new TypeError('permission issuedAt must be finite')
  if (input.expiresAt !== undefined && (!Number.isFinite(input.expiresAt) || input.expiresAt < issuedAt)) {
    throw new TypeError('permission expiresAt must be finite and not precede issuedAt')
  }
  return Object.freeze({ ...input, issuedAt })
}

export function createPermissionAuthorizer(options: PermissionAuthorizerOptions = {}): PermissionAuthorizer {
  const clock = options.clock ?? defaultClock
  const timer = options.timer ?? noopTimer
  const records = new Map<string, PermissionGrant>()
  const timers = new Map<string, unknown>()
  let nextGeneratedId = 0

  const emit = async (event: PermissionAuditEvent): Promise<void> => {
    if (!options.auditSink) return
    await options.auditSink.append(Object.freeze(event))
  }

  const eventBase = (request: PermissionRequestContext, now: number) => ({
    requestId: request.id,
    action: request.action,
    sessionId: request.sessionId,
    turnId: request.turnId,
    workspaceId: request.workspaceId,
    occurredAt: now,
  })

  const expired = (grant: PermissionGrant, now: number): boolean => grant.expiresAt !== undefined && now >= grant.expiresAt

  const authorizer: PermissionAuthorizer = {
    get grants() { return Object.freeze([...records.values()]) },
    addGrant(input) {
      assertNonEmpty(input.id, 'permission grant id')
      if (input.scope.kind === 'action') assertNonEmpty(input.scope.action, 'permission action')
      if (input.scope.kind === 'session') assertNonEmpty(input.scope.sessionId, 'permission session id')
      if (input.scope.kind === 'workspace') assertNonEmpty(input.scope.workspaceId, 'permission workspace id')
      const grant = cloneGrant(input, clock.now())
      records.set(grant.id, grant)
      void emit({ type: 'permission.grant.created', grantId: grant.id, permissionId: grant.id, scope: grant.scope, source: grant.source, reason: grant.reason, occurredAt: clock.now(), expiresAt: grant.expiresAt }).catch(() => undefined)
      if (grant.expiresAt !== undefined && grant.expiresAt > clock.now()) {
        const delay = grant.expiresAt - clock.now()
        const handle = timer.setTimeout(() => {
          if (grant.revokedAt !== undefined || !records.has(grant.id) || !expired(grant, clock.now())) return
          void emit({ type: 'permission.expired', grantId: grant.id, permissionId: grant.id, scope: grant.scope, source: grant.source, reason: expirationReason(), occurredAt: clock.now(), expiresAt: grant.expiresAt }).catch(() => undefined)
        }, delay)
        timers.set(grant.id, handle)
      }
      return grant
    },
    revoke(id, reason = { kind: 'revoked', message: 'permission grant revoked' }) {
      const grant = records.get(id)
      if (!grant || grant.revokedAt !== undefined) return false
      const revokedGrant = Object.freeze({ ...grant, revokedAt: clock.now(), revokedReason: reason })
      records.set(id, revokedGrant)
      const timerHandle = timers.get(id)
      if (timerHandle !== undefined) {
        timer.clearTimeout(timerHandle)
        timers.delete(id)
      }
      void emit({ type: 'permission.revoked', grantId: id, permissionId: id, scope: grant.scope, source: grant.source, reason, occurredAt: clock.now(), expiresAt: grant.expiresAt }).catch(() => undefined)
      return true
    },
    async authorize(request) {
      assertNonEmpty(request.id, 'permission request id')
      assertNonEmpty(request.action, 'permission action')
      const now = clock.now()
      const matching = [...records.values()].filter((grant) => scopeMatches(grant.scope, request))
      const active: PermissionGrant[] = []
      for (const grant of matching) {
        if (grant.revokedAt !== undefined) continue
        if (expired(grant, now)) {
          await emit({ ...eventBase(request, now), type: 'permission.expired', grantId: grant.id, permissionId: grant.id, scope: grant.scope, source: grant.source, reason: expirationReason(), expiresAt: grant.expiresAt })
          continue
        }
        active.push(grant)
      }
      const denies = active.filter((grant) => grant.decision === 'deny')
      if (denies.length > 0) {
        const selected = denies.sort((a, b) => scopeSpecificity(b.scope) - scopeSpecificity(a.scope) || b.issuedAt - a.issuedAt)[0]!
        await emit({ ...eventBase(request, now), type: 'permission.denied', grantId: selected.id, permissionId: selected.id, scope: selected.scope, source: selected.source, reason: selected.reason, expiresAt: selected.expiresAt })
        return { kind: 'denied', grant: selected, reason: selected.reason, source: selected.source }
      }
      const allows = active.filter((grant) => grant.decision === 'allow')
      if (allows.length > 0) {
        const selected = allows.sort((a, b) => scopeSpecificity(b.scope) - scopeSpecificity(a.scope) || b.issuedAt - a.issuedAt)[0]!
        try {
          await emit({ ...eventBase(request, now), type: 'permission.approved', grantId: selected.id, permissionId: selected.id, scope: selected.scope, source: selected.source, reason: selected.reason, expiresAt: selected.expiresAt })
          return { kind: 'approved', grant: selected }
        } catch {
          return { kind: 'denied', reason: { kind: 'system', message: 'permission audit persistence failed' }, source: { kind: 'system', id: 'permission-audit' } }
        }
      }
      if (options.policy) {
        let evaluation: PermissionEvaluation
        try {
          evaluation = options.policy.evaluate(request)
        } catch {
          const reason: PermissionReason = { kind: 'system', message: 'permission policy evaluation failed' }
          try { await emit({ ...eventBase(request, now), type: 'permission.denied', source: { kind: 'system', id: 'permission-policy' }, reason }) } catch { /* fail closed */ }
          return { kind: 'denied', reason, source: { kind: 'system', id: 'permission-policy' } }
        }
        if (evaluation.kind === 'allow' || evaluation.kind === 'deny') {
          const source = evaluation.source ?? { kind: 'automatic', id: 'permission-policy' }
          const generatedInput: PermissionGrantInput = {
            id: `policy-${++nextGeneratedId}`,
            scope: { kind: 'action', action: request.action },
            decision: evaluation.kind,
            reason: evaluation.reason,
            source,
            issuedAt: now,
            ...(evaluation.kind === 'allow' && evaluation.expiresAt !== undefined ? { expiresAt: evaluation.expiresAt } : {}),
          }
          const generated = cloneGrant(generatedInput, now)
          try {
            await emit({ ...eventBase(request, now), type: evaluation.kind === 'allow' ? 'permission.auto-decided' : 'permission.denied', grantId: generated.id, permissionId: generated.id, scope: generated.scope, source, reason: evaluation.reason, expiresAt: generated.expiresAt })
          } catch {
            return { kind: 'denied', reason: { kind: 'system', message: 'permission audit persistence failed' }, source: { kind: 'system', id: 'permission-audit' } }
          }
          return evaluation.kind === 'allow' ? { kind: 'approved', grant: generated } : { kind: 'denied', grant: generated, reason: evaluation.reason, source }
        }
      }
      try { await emit({ ...eventBase(request, now), type: 'permission.requested', reason: request.reason }) } catch { /* ask remains fail closed */ }
      return { kind: 'ask' }
    },
  }
  return authorizer
}
