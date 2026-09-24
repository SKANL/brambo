---
title: Kernel execution contracts
audience: Developers and maintainers
prerequisites: Node.js >=20 and TypeScript
outcome: Implement a safe executor, permission policy, audit sink, or replay store
scope: Micro-kernel lifecycle, authorization, replay, and extension boundaries
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# Kernel execution contracts

Brambo's kernel is the protocol-neutral execution boundary. It owns lifecycle
semantics and authorization decisions; it does not own a transport, provider
registry, database, or user interface.

## Guarantees

- A session starts in `created`, accepts work only after `active`, and reaches a
  terminal `completed`, `failed`, or `closed` state through typed transitions.
- Turns are FIFO and sequential in v1: at most one turn is `running` for a
  session. A cancelled or failed turn never becomes `completed`.
- Executor affinity is explicit. An executor failure fails the session; v1 does
  not silently fail over to another executor.
- Permission scopes are discriminated as `action`, `session`, or `workspace`.
  A matching explicit deny wins over every allow, and more specific allows win
  over broader allows.
- Grant expiration is checked against the injected clock. Timers only accelerate
  expiration notification; they are not the source of truth. Revocation takes
  effect immediately.
- Automatic permission policy is optional and fail-closed. A policy exception,
  or an audit sink failure for an approval, cannot become an implicit allow.
- Replay reads report `overflow` when the requested cursor is older than the
  retained window. Partial history is never reported as complete.
- Prompt admission detects same-key duplicates and conflicting payloads. A
  receipt proves admission identity, not durable execution or result storage.

## Non-guarantees and deferred behavior

The kernel does **not** provide concurrent turns, priority scheduling, executor
failover, durable receipt/result storage, a distributed event store, a remote
transport, a permission UI, or vendor-specific policy. These require explicit
semantics and belong above the kernel.

`EventBus` is live notification. The session event log is history/replay. The
kernel `LogSink` and `PermissionAuditSink` are diagnostics/audit. Emitting on one
is not an implicit append to another.

The kernel also does not claim OS isolation. Sandbox policy constrains a process;
permission policy decides whether an action is authorized. Keep those policies
separate.

## Implementing an executor

A host composes an executor with `runSession` and supplies a stable executor id.
The executor should:

1. accept one turn at a time for a session;
2. observe the supplied cancellation signal and stop within the host's grace
   period;
3. report failures as typed execution failures rather than returning success;
4. release all process, workspace, and stream resources in its own cleanup path;
5. never assume that a cancellation is a successful completion.

The kernel does not launch a process or choose a vendor. Those choices are the
host's composition responsibility.

## Implementing a permission policy

Implement `PermissionDecisionPolicy.evaluate(request)` as a deterministic,
side-effect-free function. Return `allow`, `deny`, or `ask`; do not treat a
missing context as approval. Include a structured reason and a versioned
`PermissionPolicySource` for automatic decisions. If an external policy service
is unavailable, return `ask` or `deny`, never `allow`.

Use `createPermissionAuthorizer` to combine explicit grants with the policy.
Action scope is most specific, followed by workspace and session. Add explicit
denies for safety boundaries rather than relying on ordering between unrelated
allows.

## Implementing an audit sink

`PermissionAuditSink.append(event)` receives typed, redacted metadata. Events
contain ids, scope, action, source, reason, and timestamps; they do not contain
raw prompt metadata, complete tool arguments, credentials, or environment maps.
Persist or forward the event before treating an approval as usable. If the sink
fails, the authorizer returns a system denial for the approval path.

## Implementing a replay store

The kernel's in-memory replay log is bounded and intentionally not durable. A
host-owned durable store may implement equivalent semantics:

- assign a monotonic cursor;
- retain a bounded or policy-defined window;
- implement `readAfter(cursor)`;
- return an explicit overflow result with the oldest available cursor;
- preserve ordering and never fabricate missing events;
- make close/rejection observable.

Prompt admission has the same boundary: a durable implementation may store
receipts, but the kernel contract does not claim that a receipt contains the
execution result.

## Contract-test checklist

Before shipping an executor or host integration, run the kernel contract matrix:

- invalid session and turn transitions;
- sequential multi-turn execution;
- queued and running cancellation, including completion races;
- executor failure and bounded shutdown;
- action/session/workspace permission scope and deny precedence;
- expiry, revocation, automatic allow/deny, and policy failure;
- audit for approval, denial, expiry, and revocation;
- replay read-after and overflow;
- prompt duplicate/conflict and closed-store rejection;
- shutdown with pending turns or permissions.

The reusable deterministic helpers in `packages/kernel/test/contract-kit.ts`
provide a manual clock/timer, audit collector, policy factory, executor fake,
and replay-store factory for kernel-level contract tests.
