# ACP kernel integration

## Objective

Add protocol-neutral agent-session capabilities discovered from the ACP and agent-runtime ecosystem without coupling `@brambodev/kernel` to a vendor, UI, or transport implementation.

## Problem

Brambo already composes executors, workspaces, tools, sandboxes, events, and lifecycle, but it lacks a shared model for negotiated capabilities, streamed session updates, explicit permission decisions, structured cancellation, and bounded transport pressure.

## Authorized scope

- Add contracts and kernel/session integration for ACP-neutral lifecycle primitives.
- Preserve the kernel's zero runtime dependencies and existing plugin/lifecycle guarantees.
- Do not add Discord, Telegram, browser, debugger, AG-UI, provider-specific registries, or remote transport implementations in this slice.
- Preserve unrelated changes, including `release-status.json`.

## Resolved implementation mode

- Route: delegated direct for multi-file implementation.
- TDD: resolve from existing project configuration before implementation; if no explicit strict mode is configured, use focused tests and record that fact.
- Verification: package tests, typecheck, lint, and targeted contract tests.
- Delivery: one work-unit commit for the coherent P0 slice; no push or PR.

## Tasks

- [x] ACP-01 Define protocol-neutral session, turn, update, capability, permission, cancellation, backpressure, and typed error contracts. (`packages/kernel/src/acp.ts`; `AgentError` includes category, retryability, session validity, and recovery hint)
- [x] ACP-02 Add kernel-owned lifecycle/state supervision primitives without adding vendor or transport dependencies. (`createSessionSupervisor`, `queueTurn`, `beginTurn`, `completeTurn`, `complete`)
- [x] ACP-03 Add permission broker and cancellation propagation seams to session integration. (`createPermissionBroker`, `createCancellationController`; injected timeout timer and duplicate rejection)
- [x] ACP-04 Add bounded queue/backpressure and executor/session affinity contracts. (`createBoundedQueue`, `ExecutorAffinity` bound to supervised session ID)
- [x] ACP-05 Add focused tests and documentation for invariants and unsupported provider-specific behavior. (`packages/kernel/test/acp.test.ts`, API docblocks)

## Acceptance criteria

1. Existing kernel APIs and tests remain compatible.
2. New contracts represent explicit states and outcomes; no boolean-only permission or cancellation API.
3. Kernel remains free of runtime dependencies and provider-specific names.
4. Queue limits, overload, retryability, and session validity are observable and typed.
5. Tests cover normal, cancellation, timeout, rejection, overload, and terminal-state paths.
6. All required checks report observed results before the task is marked complete.

## Progress

- Research completed across 25 external repositories and ACP architecture documentation.
- Current step: implementation complete; parent review and commit remain.

## Verification evidence

- `pnpm --filter @brambodev/kernel exec vitest run test/acp.test.ts` — 4 tests passed.
- Focused ACP regression suite after review additions — 8 tests passed (timeout, duplicate rejection, typed errors, affinity included).
- Lifecycle follow-up focused suite — 9 tests passed (queued → running → completed turn and terminal session completion included).
- `pnpm --filter @brambodev/kernel typecheck` — passed (`tsc --noEmit`).
- `pnpm --filter @brambodev/kernel lint` — passed (`eslint .`).
- `pnpm --filter @brambodev/kernel test` — 9 files / 275 tests passed; 2 export-surface assertions initially failed and were updated in `test/helpers.ts` for the intentional additive API, then focused and full checks were rerun.

## Next step

Delegate a single bounded writer after resolving project TDD configuration and prior progress.
