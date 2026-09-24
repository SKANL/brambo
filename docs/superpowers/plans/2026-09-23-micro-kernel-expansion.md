# Brambo Micro-Kernel Expansion Implementation Plan

**Date:** 2026-09-23  
**Design:** `docs/superpowers/specs/2026-09-23-micro-kernel-expansion-design.md`  
**Execution constraint:** kernel-first; no new adapters or transports.

## Working rules

- Work in small commits; each task is test-first and independently reviewable.
- Read the current file before modifying it; preserve public compatibility unless the design explicitly changes a result.
- Keep the kernel free of runtime dependencies.
- Do not add persistence implementations, provider registries, UI, or transport code.
- Do not modify `release-status.json`.
- Run the smallest focused test after each task, then the package checks at each phase boundary.
- Update exports, topology metadata, API docs, and tests in the same work unit as a public API change.

## File map before implementation

Expected implementation areas (confirm exact symbols before each task):

- `packages/kernel/src/acp.ts` or a new `packages/kernel/src/agent/` module set: lifecycle, turns, flow-control, permissions, audit, replay/admission contracts.
- `packages/kernel/src/index.ts`: intentional public exports.
- `packages/kernel/test/acp.test.ts` and new focused kernel tests: transition and contract coverage.
- `packages/session/src/run-session.ts`: orchestration and supervisor integration.
- `packages/session/src/event-log.ts`: session event/replay semantics.
- `packages/session/src/tool-executor.ts` and related session methods: authorization boundary before execution.
- `packages/contracts/src/tool-execution.ts`, `packages/contracts/src/session-events.ts`, and validators: optional execution context/event envelope compatibility.
- `packages/session/test/*`, `packages/kernel/test/*`, and contract tests: regression coverage.
- `docs/`/`docs-site/` API and architecture documentation: guarantees and examples.

Do not create all files up front. Split `acp.ts` only when responsibility boundaries are demonstrated by tests and dependency shape; otherwise keep focused modules in the existing style.

## Phase 0 — Baseline and compatibility inventory

### Task 0.1: Record baseline behavior

- Inspect current ACP, session, event-log, tool-executor, contracts, export, topology, and package tests.
- Run focused baseline tests and capture current public behavior.
- Identify all consumers of `SessionSupervisor`, `PermissionRequest`, `PermissionDecision`, `SessionUpdate`, and `ToolExecutionContext`.
- Add no production behavior yet.

**Tests:** existing focused kernel/session/contracts suites.  
**Commit:** `test(kernel): capture micro-kernel baseline` (only if a durable baseline fixture is needed).

### Task 0.2: Freeze compatibility surface

- Add compile-level/type-level assertions for existing exports and legacy `approveTool` behavior.
- Define compatibility shims for methods whose signatures must remain while semantics become multi-turn.
- Record any required deprecations in the design/docs.

**Tests:** public export and consumer-install tests.  
**Commit:** `test(kernel): lock public compatibility surface`.

## Phase 1 — P0 lifecycle and sequential turns

### Task 1.1: Specify transition tables as executable tests (RED)

- Add tests for every legal/illegal session transition.
- Add tests proving cancelled/failed turns cannot become completed.
- Add tests proving terminal sessions reject new work.
- Add tests for `cancelTurn` versus `closeSession`.

**Files:** kernel lifecycle tests; no implementation changes until failures are observed.  
**Commit:** `test(kernel): define session and turn transition invariants`.

### Task 1.2: Implement multi-turn supervisor (GREEN)

- Replace one-slot turn storage with current turn plus terminal turn summaries or an injected scheduler boundary.
- Permit FIFO queued turns and only one running turn.
- Ensure `queueTurn` cannot overwrite an existing turn.
- Ensure `beginTurn` only starts an actually queued turn.
- Ensure terminal outcomes are immutable.

**Files:** `packages/kernel/src/acp.ts` or `packages/kernel/src/agent/lifecycle.ts`, exports.  
**Tests:** lifecycle suite from Task 1.1 plus regression tests.  
**Commit:** `feat(kernel): implement sequential multi-turn lifecycle`.

### Task 1.3: Separate lifecycle and flow-control boundaries

- Extract scheduler/cancellation interfaces only where the test and dependency graph justify it.
- Preserve public compatibility through facade exports.
- Add explicit turn IDs and state accessors without exposing mutable internals.

**Commit:** `refactor(kernel): separate lifecycle and turn scheduling`.

## Phase 2 — P1 execution, affinity, cancellation, shutdown

### Task 2.1: Define executor binding and failure semantics (RED/GREEN)

- Add tests for stable session-to-executor affinity, mismatched affinity rejection, release, and executor failure.
- Implement `ExecutionBinding`/equivalent contract.
- Do not add failover.

**Commit:** `feat(kernel): formalize executor affinity`.

### Task 2.2: Implement cancellation coordination

- Add injected clock/timer seam and tests for queued cancellation, running cancellation, graceful timeout, forced cleanup, and cancellation/completion races.
- Keep cancellation reason structured.
- Ensure a cancelled operation cannot later report successful completion.

**Files:** kernel cancellation module, session orchestration tests.  
**Commit:** `feat(kernel): make cancellation and shutdown terminal`.

### Task 2.3: Integrate supervisor authority into `runSession`

- Create/acquire supervisor before workspace execution.
- Delegate state transitions to supervisor.
- Emit lifecycle events once and in causal order.
- Release workspace, executor, method, and kernel resources in existing safe order.
- Test success, failure, cancellation, and cleanup failure paths.

**Files:** `packages/session/src/run-session.ts`, session tests.  
**Commit:** `feat(session): bind runSession to kernel lifecycle`.

## Phase 3 — P2 causal events and replay

### Task 3.1: Define event envelope and ordering tests

- Add tests for cursor monotonicity, per-session sequence, correlation/causation IDs, version, and injected timestamps.
- Distinguish live EventBus notifications from persisted history and audit.

**Commit:** `test(session): define causal event ordering`.

### Task 3.2: Implement replay/read-after/overflow convergence

- Add `append`, `read`, `readAfter`, cursor bounds, and explicit overflow status to the selected event-log abstraction.
- Preserve existing replay APIs through compatibility wrappers.
- Never return incomplete replay as `ok`.
- Keep durable persistence out of the kernel; adapt existing in-memory/JSONL logs where appropriate.

**Files:** `packages/session/src/event-log.ts`, contracts, kernel replay module as needed.  
**Commit:** `feat(session): unify cursor-based replay semantics`.

## Phase 4 — P3 permission model

### Task 4.1: Add typed scopes and request context

- Define action/session/workspace discriminated scopes.
- Add optional session/turn/workspace context to permission/tool requests.
- Validate non-empty IDs and actions.
- Preserve current request/decision compatibility.

**Commit:** `feat(kernel): add scoped permission contracts`.

### Task 4.2: Add grants, structured reasons, and policy sources

- Implement immutable grants with decision, source, issued/expiry timestamps, and revocation state.
- Add structured reason union and policy-source descriptor.
- Ensure all generated decisions contain source and reason.

**Commit:** `feat(kernel): add permission grants and decision metadata`.

### Task 4.3: Add precedence, expiration, and revocation

- Implement deny-over-allow precedence.
- Match action > workspace > session > default.
- Inject a clock; validate expiry at all required boundaries.
- Implement revocation and immediate non-match.
- Add focused tests for every precedence/expiry/revocation edge case.

**Commit:** `feat(kernel): enforce permission precedence and expiry`.

### Task 4.4: Add optional automatic policy, fail-closed

- Add policy evaluator interface and `allow`/`deny`/`ask` result.
- Treat evaluator errors/unavailability as `ask` or `deny` according to explicit configuration; never allow implicitly.
- Include policy rule/source/version in audit metadata.

**Commit:** `feat(kernel): add fail-closed automatic permission policy`.

### Task 4.5: Add permission audit sink/events

- Add typed audit event union and `PermissionAuditSink`.
- Emit request, decision, expiry, revocation, tool-authorized, and tool-rejected events.
- Fingerprint sensitive arguments instead of persisting raw values.
- Define and test sink failure behavior; do not silently grant on audit failure.

**Commit:** `feat(kernel): add permission audit events`.

## Phase 5 — Tool authorization integration

### Task 5.1: Authorize before tool execution

- Construct `PermissionRequestContext` from invocation and optional execution context.
- Resolve existing grants/policies before sandbox/MCP/local execution begins.
- Emit authorization audit before invoking the tool.
- Preserve the legacy `approveTool` fallback during migration.

**Files:** `packages/session/src/tool-executor.ts`, session methods, contracts validators.  
**Tests:** approved, denied, expired, policy-failure, legacy fallback, audit failure.  
**Commit:** `feat(session): authorize tool execution through kernel permissions`.

### Task 5.2: Keep sandbox policy separate

- Add tests demonstrating that sandbox capability validation and permission authorization remain independent.
- Do not move sandbox policy logic into permission policy.

**Commit:** `test(session): protect sandbox and authorization boundaries`.

## Phase 6 — P4 contract test kit

### Task 6.1: Build deterministic fakes

- Add `FakeClock`, `FakeExecutor`, `FakePermissionPolicy`, `FakeAuditSink`, `FakeUpdateConsumer`, `FakeReplayStore`, and cancellation helpers where not already available.
- Keep fakes package-internal or explicitly public only if consumers need them.

**Commit:** `test(kernel): add deterministic micro-kernel fakes`.

### Task 6.2: Add contract suites

- Run the same lifecycle/permission/replay/admission contracts against the kernel implementations.
- Cover pending work during shutdown, races, overload, replay overflow, duplicate/conflicting prompts, and all permission scopes.

**Commit:** `test(kernel): add micro-kernel contract suites`.

## Phase 7 — P5 public API and documentation (P6)

### Task 7.1: Stabilize exports and topology

- Export only intentional contracts from `packages/kernel/src/index.ts` and contract packages.
- Update topology/module-budget tests and package metadata if new public modules are added.
- Confirm no adapter or transport package was added.

**Commit:** `refactor(kernel): stabilize micro-kernel public exports`.

### Task 7.2: Document guarantees and limits

- Document lifecycle transition tables, sequential-turn invariant, cancellation/shutdown, permission scope/precedence/expiry, audit redaction, replay overflow, prompt idempotency, executor affinity, and compatibility shims.
- Add examples for an executor, permission policy, audit sink, and external durable replay store.
- Explicitly document all non-goals and deferred decisions.

**Files:** relevant `docs/`, `docs-site/`, package READMEs/API docs.  
**Commit:** `docs(kernel): document execution and authorization contracts`.

## Phase 8 — Verification and delivery evidence

### Task 8.1: Focused verification

Run, at minimum:

```text
pnpm --filter @brambodev/kernel typecheck
pnpm --filter @brambodev/kernel test
pnpm --filter @brambodev/kernel lint
pnpm --filter @brambodev/session typecheck
pnpm --filter @brambodev/session test
pnpm --filter @brambodev/session lint
```

Record exact results and skipped opt-in/live suites.

### Task 8.2: Workspace verification

Run:

```text
pnpm check
pnpm build
pnpm docs:check
```

If a check fails, fix the narrowest source of failure and rerun the affected check; do not lower budgets or omit tests. Confirm `release-status.json` remains untouched.

### Task 8.3: Final structural audit

- Inspect `git diff --check` and public exports.
- Confirm no new adapter/transport source exists.
- Confirm all requested permission capabilities have tests and docs.
- Confirm lifecycle and replay requirements have direct evidence.
- Update the task/recovery document with commit IDs, verification output, and any remaining deferred work.

## Suggested commit grouping

1. `test(kernel): define session and turn transition invariants`
2. `feat(kernel): implement sequential multi-turn lifecycle`
3. `feat(kernel): make cancellation and shutdown terminal`
4. `feat(session): bind runSession to kernel lifecycle`
5. `feat(session): unify cursor-based replay semantics`
6. `feat(kernel): add scoped permission contracts`
7. `feat(kernel): add permission grants and decision metadata`
8. `feat(kernel): enforce permission precedence and expiry`
9. `feat(kernel): add fail-closed automatic permission policy`
10. `feat(kernel): add permission audit events`
11. `feat(session): authorize tool execution through kernel permissions`
12. `test(kernel): add micro-kernel contract suites`
13. `docs(kernel): document execution and authorization contracts`

Squash only if repository delivery policy requires it; otherwise retain work-unit history so each semantic change is independently reviewable.
