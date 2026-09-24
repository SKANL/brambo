# Brambo Micro-Kernel Expansion

**Date:** 2026-09-23  
**Status:** Approved implementation design  
**Scope:** `@brambodev/kernel`, `@brambodev/session`, `@brambodev/contracts`, documentation, and kernel contract tests.  
**Explicit exclusion:** no new adapters or transports.

## 1. Intent and constraints

Brambo is being extended as a micro-kernel SDK for safe, observable agent execution. The kernel, not a transport, is the product boundary. The implementation must stabilize session/turn semantics, authorization, cancellation, replay, admission, and audit before adding any new integration surface.

The existing `packages/adapter-acp` remains a thin conformance seam only. It is frozen for this change: no WebSocket, SSE, HTTP, Discord, Telegram, browser, AG-UI, vendor registry, model router, or provider-specific behavior is added.

The implementation must preserve existing public APIs wherever possible. Existing fields remain valid; new context is optional during migration. The kernel continues to have zero runtime dependencies.

## 2. Evidence from the current repository

- `packages/kernel/src/acp.ts` currently combines session lifecycle, turn state, cancellation, permission requests, bounded queues, replay, and prompt admission.
- The current supervisor stores one `turnId`/`turnState`, rejects a second queued turn, allows `beginTurn` to bypass `queued`, and can leave a cancelled turn represented as completed. These are semantic defects for a multi-turn SDK.
- `packages/session/src/run-session.ts` owns actual executor/workspace acquisition and cleanup, while the ACP supervisor is independent. The target design makes the supervisor the state machine and keeps `runSession` as orchestration.
- `packages/session/src/event-log.ts` provides per-session sequence numbers and replay, but has different semantics from the kernel replay log. The two APIs must converge semantically without conflating live notifications, history, and audit.
- `packages/session/src/tool-executor.ts` validates and executes tools, but permission authorization must be introduced before execution while preserving the legacy `approveTool` seam.

These observations are confirmed by source inspection. Design motivations below are architectural decisions/inferences, not claims that the current implementation already provides them.

## 3. Goals and non-goals

### Goals

1. Define a multi-turn, sequential session lifecycle with invalid transitions rejected.
2. Separate lifecycle state from scheduling, cancellation coordination, and executor affinity.
3. Add permission scopes for action, session, and workspace.
4. Add grants, expiration, revocation, structured reasons, policy sources, precedence, and optional automatic decisions.
5. Make automatic decisions deterministic, auditable, and fail-closed.
6. Add typed permission audit events and a caller-owned audit sink.
7. Integrate authorization with tool execution without breaking current consumers.
8. Define a causal, cursor-based event/replay envelope and explicit overflow semantics.
9. Preserve prompt idempotency and bounded queue behavior.
10. Provide a reusable kernel contract test kit and documentation of guarantees/non-guarantees.
11. Verify the complete workspace with focused tests, typechecking, lint, and build.

### Non-goals

- No new adapter or transport package.
- No durable database, Redis, queue service, or cloud storage in the kernel.
- No automatic executor failover in v1.
- No concurrent turns within one session in v1.
- No model routing, provider registry, vendor-specific policy, or UI permission surface.
- No automatic persistence of secrets, full prompts, complete tool arguments, credentials, or environment values.

## 4. Target architecture

```text
SDK consumers (CLI, plugins, future transports)
                    |
        session orchestration (`runSession`)
                    |
             Brambo micro-kernel
  lifecycle | turns | scheduler | cancellation
  permissions | audit | replay | admission
  capabilities | typed errors | affinity
                    |
     executors | workspaces | tools | sandbox
```

The kernel exposes protocol-neutral contracts. `runSession` composes kernel state with executor and workspace ownership. `EventBus` remains live notification; `SessionEventLog` remains session history/replay; `Kernel LogSink` remains kernel diagnostics/audit. None is silently substituted for another.

## 5. Lifecycle semantics (P0)

### Session states

```text
created -> active
created -> failed
created -> closed
active -> cancelling
active -> completed
active -> failed
active -> closed
cancelling -> active
cancelling -> failed
cancelling -> closed
completed -> closed
failed -> closed
closed -> terminal
```

`cancelTurn` and `closeSession` are distinct operations. A session may return from `cancelling` to `active` after the current turn reaches a terminal cancelled state. A completed or failed session cannot accept work and can only be closed. `close` releases ownership and clears runtime references; the event history remains readable through its log.

### Turn states

```text
queued -> running
queued -> cancelled
queued -> failed
running -> cancelling
running -> completed
running -> failed
cancelling -> cancelled
cancelling -> failed
```

There is at most one `running` turn per session. A cancelled or failed turn never becomes completed. A turn is an immutable record in the session history; the supervisor tracks the current turn and terminal summaries separately.

### Multi-turn policy

Turns are FIFO and sequential in v1. A session may queue several turns, but only one is running. A second turn does not overwrite the first. Concurrent turns, turn priorities, and cross-session fairness are deferred until event ordering, permission ownership, workspace isolation, and cancellation races have explicit semantics.

## 6. Execution semantics (P1)

The implementation separates these responsibilities conceptually and, where file size/dependencies justify it, physically:

- `SessionLifecycle`: valid session transitions and terminality.
- `TurnScheduler`: FIFO admission/dequeue and queued-turn cancellation.
- `CancellationCoordinator`: cancellation signal, graceful timeout, forced cleanup, final outcome.
- `ExecutionBinding`: stable `sessionId -> executorId` affinity and release.

A session has one stable executor binding for its lifetime. Executor failure fails the session; v1 does not silently fail over. Graceful shutdown is bounded and observable. A cancellation request records intent, signals execution, waits for the configured grace period, and then forces cleanup if required. `runSession` must not independently invent a competing state machine.

## 7. Permission model (P3)

### Scope

```ts
type PermissionScope =
  | { readonly kind: 'action'; readonly action: string }
  | { readonly kind: 'session'; readonly sessionId: string }
  | { readonly kind: 'workspace'; readonly workspaceId: string }
```

A scope is explicit and discriminated. Free-form scope strings are not accepted.

### Requests and grants

Requests carry `id`, `action`, session/turn/workspace context when available, structured reason context, metadata, and request expiry. Grants carry an immutable id, scope, decision, structured reason, policy source, issued/expiry timestamps, optional session/workspace association, and revocation state.

### Structured reasons and policy sources

```ts
type PermissionReason =
  | { readonly kind: 'user'; readonly message?: string }
  | { readonly kind: 'policy'; readonly policyId: string; readonly message?: string }
  | { readonly kind: 'automatic'; readonly ruleId: string; readonly message?: string }
  | { readonly kind: 'expired'; readonly message?: string }
  | { readonly kind: 'revoked'; readonly message?: string }
  | { readonly kind: 'system'; readonly message: string }

interface PermissionPolicySource {
  readonly kind: 'default' | 'session' | 'workspace' | 'action' | 'user' | 'automatic' | 'system'
  readonly id?: string
  readonly version?: string
}
```

### Resolution order

1. Reject invalid or closed-session requests.
2. Reject an explicit deny; deny always wins over allow.
3. Ignore expired or revoked grants.
4. Match exact action scope, then workspace scope, then session scope, then default policy.
5. Evaluate an optional automatic policy.
6. If unresolved, remain pending for an explicit decision; absence of a decision never implies allow.

The implementation must make precedence testable and deterministic. A policy evaluator failure produces `ask` or `deny`, never `allow`.

### Expiration and revocation

Request timeout and grant expiration are separate. `issuedAt`/`expiresAt` plus an injected clock are the source of truth; timers only accelerate notification. Expiration is checked when a grant is created, before execution, on duplicate resolution, and when a session is resumed. Revocation takes effect immediately and emits audit.

### Optional automatic decision

```ts
interface PermissionDecisionPolicy {
  evaluate(request: PermissionRequestContext): PermissionEvaluation
}

type PermissionEvaluation =
  | { readonly kind: 'allow'; readonly reason: PermissionReason; readonly expiresAt?: string }
  | { readonly kind: 'deny'; readonly reason: PermissionReason }
  | { readonly kind: 'ask' }
```

Automatic policy is optional, pure/deterministic at the kernel boundary, versioned through its source, auditable, and fail-closed.

## 8. Audit model

Permission audit is a typed channel, not an unstructured expansion of the existing kernel log:

```ts
interface PermissionAuditSink {
  append(event: PermissionAuditEvent): void | Promise<void>
}
```

Events include `permission.requested`, `permission.approved`, `permission.denied`, `permission.expired`, `permission.auto-decided`, `permission.revoked`, `tool.authorized`, and `tool.rejected`.

The event contains permission/session/turn/workspace IDs, action, scope, source, reason, timestamps, and an optional arguments fingerprint. Full secrets, prompts, credentials, environment maps, and raw arguments are excluded by default. Audit sink failure must have a defined policy: authorization execution does not turn an otherwise approved action into an implicit allow when audit persistence fails; the selected failure behavior is surfaced as a typed error and tested.

## 9. Event and replay semantics (P2)

A session event envelope carries:

```ts
interface SessionEventEnvelope<T> {
  readonly cursor: number
  readonly sequence: number
  readonly sessionId: string
  readonly turnId?: string
  readonly correlationId?: string
  readonly causationId?: string
  readonly type: string
  readonly version: number
  readonly occurredAt: string
  readonly payload: T
}
```

The API exposes append/read/readAfter/oldestCursor/latestCursor/replayStatus. A cursor older than the retained window returns an explicit `overflow` result with `oldestAvailableCursor`; incomplete replay is never presented as complete. Cursor ordering is monotonic per log, sequence ordering is per session, and timestamps use an injectable clock in tests.

`EventBus` is for live notification, `SessionEventLog` for history/replay, and `LogSink`/`PermissionAuditSink` for diagnostics/audit. A bus emission is not durable history unless an explicit log append succeeds.

## 10. Admission and flow control

Prompt admission remains keyed by `clientId + idempotencyKey`. Same key/same payload returns the original receipt; same key/different payload returns a typed conflict; closed stores reject admission. Receipts are kernel-level identity evidence, not durable results. Durable storage remains an external implementation.

Prompts are FIFO and never silently dropped. Permission/cancellation control messages have priority over normal work. Bounded queues return explicit accepted/overloaded/closed outcomes. The kernel may expose policy hooks, but UI-oriented coalescing/latest-only behavior remains outside the kernel.

## 11. `runSession` and tool integration

`runSession` remains responsible for composition and resource ownership:

```text
validate -> create/acquire supervisor -> bind executor -> create workspace
-> active -> enqueue turn -> run -> emit updates
-> complete/cancel/fail turn -> release resources -> close/fail session
```

The supervisor owns transition truth. `runSession` delegates transitions and does not mutate parallel lifecycle fields.

Tool execution becomes:

```text
ToolInvocation
 -> PermissionRequestContext
 -> existing grants/policy/broker
 -> approved | denied | expired
 -> ToolExecutor.execute
 -> audit
 -> ToolExecutionEvent
```

`approveTool` remains as a compatibility fallback during migration. New `sessionId`, `turnId`, and `workspaceId` context is optional initially. `SandboxPolicy` remains distinct: sandbox policy constrains what a process can do; permission policy determines whether an actor may authorize an action.

## 12. Compatibility policy

- Preserve existing exports and accepted states where they are not semantically unsafe.
- Add new fields as optional first; introduce new discriminated types instead of widening strings.
- Keep the ACP adapter package unchanged for this work.
- Mark old single-turn methods as compatibility shims only where their behavior can be mapped without violating terminality.
- Add deprecation notes rather than silently changing result meanings.
- Update topology/export tests and public API documentation with every new export.

If a current method cannot preserve the new invariant, introduce a new explicit method and make the old method return a typed invalid-state result rather than silently performing a different operation.

## 13. Contract test kit

The test kit must cover lifecycle transitions and races, sequential multi-turn execution, queued/running cancellation, cancellation/completion races, executor failure/timeout, all permission scopes, precedence, expiration, revocation, automatic allow/deny/policy failure, audit for every authorization outcome, replay/read-after/overflow, prompt duplicate/conflict, and shutdown with pending turns or permissions.

Provide reusable fakes for clock, executor, permission policy, audit sink, update consumer, replay store, and cancellation source. Each fake must be deterministic and side-effect-free. Adapter conformance is not part of this change; the kit is for kernel/executor implementations.

## 14. Documentation and acceptance criteria

Document guarantees, non-guarantees, lifecycle diagrams, permission precedence, audit redaction, replay overflow, executor affinity, and examples for implementing an executor, permission policy, audit sink, and durable replay store outside the kernel.

Acceptance requires:

- no new adapter/transport source files;
- kernel/session/contracts typecheck and lint clean;
- focused contract tests cover every transition and permission requirement;
- workspace `pnpm check` passes;
- workspace `pnpm build` passes;
- docs validate and public exports are intentional;
- `release-status.json` and unrelated pre-existing changes remain untouched.

## 15. Deferred decisions

The following are intentionally not solved by this change: concurrent turns, priority scheduling, automatic failover, durable receipt/result storage, cross-process event consistency, distributed leases, remote transport protocol, UI approval interaction, and provider-specific policy registries. They require evidence from the stabilized kernel rather than assumptions now.
