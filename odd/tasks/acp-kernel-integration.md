# Brambo micro-kernel expansion

## Objective

Implement the approved P0-P6 micro-kernel expansion: stable sequential multi-turn lifecycle, scoped authorization, expiration, structured policy decisions, audit, replay/admission semantics, tool integration, contract tests, and documentation without adding adapters or transports.

## Problem

Brambo already composes executors, workspaces, tools, sandboxes, events, and lifecycle, but it lacks a shared model for negotiated capabilities, streamed session updates, explicit permission decisions, structured cancellation, and bounded transport pressure.

## Authorized scope

- Add contracts and kernel/session integration for protocol-neutral lifecycle and authorization primitives.
- Preserve the kernel's zero runtime dependencies and existing plugin/lifecycle guarantees.
- Do not add adapters, Discord, Telegram, browser, debugger, AG-UI, provider-specific registries, or remote transport implementations in this slice.
- Preserve unrelated changes, including `release-status.json`.

## Resolved implementation mode

- Route: delegated direct for multi-file implementation.
- TDD: resolve from existing project configuration before implementation; if no explicit strict mode is configured, use focused tests and record that fact.
- Verification: package tests, typecheck, lint, and targeted contract tests.
- Delivery: separate work-unit commits for the P0, P1, and ACP-08 slices; no push or PR.

## Tasks

- [x] ACP-01 Define protocol-neutral session, turn, update, capability, permission, cancellation, backpressure, and typed error contracts. (`packages/kernel/src/acp.ts`; `AgentError` includes category, retryability, session validity, and recovery hint)
- [x] ACP-02 Add kernel-owned lifecycle/state supervision primitives without adding vendor or transport dependencies. (`createSessionSupervisor`, `queueTurn`, `beginTurn`, `completeTurn`, `complete`)
- [x] ACP-03 Add permission broker and cancellation propagation seams to session integration. (`createPermissionBroker`, `createCancellationController`; injected timeout timer and duplicate rejection)
- [x] ACP-04 Add bounded queue/backpressure and executor/session affinity contracts. (`createBoundedQueue`, `ExecutorAffinity` bound to supervised session ID)
- [x] ACP-05 Add focused tests and documentation for invariants and unsupported provider-specific behavior. (`packages/kernel/test/acp.test.ts`, API docblocks)
- [x] ACP-06 Add bounded replayable session updates with monotonic cursors and explicit overflow. (`createReplayableUpdateLog`)
- [x] ACP-07 Add idempotent prompt admission receipts without coupling to a persistence backend. (`createPromptAdmissionStore`)
- [x] ACP-08 Keep the minimal ACP stdio client as a frozen conformance seam; no adapter expansion.

### Expansion tasks

- [x] P0 Stabilize lifecycle with a sequential multi-turn supervisor and executable transition invariants. (`926404d`)
- [x] P1 Integrate supervisor state with `runSession`, cancellation, executor affinity, and bounded shutdown. (`df0811e`)
- [x] P2 Converge session event replay with cursor/sequence/correlation/causation semantics and explicit overflow. (`db648d3`)
- [x] P3 Add action/session/workspace permission scopes, grants, expiration, structured reasons, policy sources, precedence, revocation, and fail-closed automatic policy evaluation. (`625eea9`)
- [x] P3 Integrate authorization into tool execution while preserving the legacy `approveTool` compatibility seam. (`9140f9b`)
- [x] P3 Add typed permission audit events and an injected audit sink with sensitive-data redaction. (`625eea9`)
- [x] P4 Add reusable lifecycle/permission/replay/admission contract test fakes and suites. (`faced7f`)
- [x] P5 Keep adapters frozen and document the transport boundary. (`faced7f`; no adapter/transport code added)
- [x] P6 Document guarantees, non-guarantees, executor/policy/audit/replay extension guides, exports, and compatibility. (`faced7f`)

## Acceptance criteria

1. Existing kernel APIs and tests remain compatible.
2. New contracts represent explicit states and outcomes; no boolean-only permission or cancellation API.
3. Kernel remains free of runtime dependencies and provider-specific names.
4. Queue limits, overload, retryability, and session validity are observable and typed.
5. Tests cover normal, cancellation, timeout, rejection, overload, and terminal-state paths.
6. All required checks report observed results before the task is marked complete.

## Progress

- Research completed across 25 external repositories and ACP architecture documentation.
- ACP P0/P1 primitives, scoped authorization, replay convergence, tool integration, contract kit, and documentation are committed. UI bridges, new adapters, and remote transports remain out of scope.

## Verification evidence

- `pnpm --filter @brambodev/kernel exec vitest run test/acp.test.ts` — 4 tests passed.
- Focused ACP regression suite after review additions — 8 tests passed (timeout, duplicate rejection, typed errors, affinity included).
- Lifecycle follow-up focused suite — 9 tests passed (queued → running → completed turn and terminal session completion included).
- `pnpm --filter @brambodev/kernel typecheck` — passed (`tsc --noEmit`).
- `pnpm --filter @brambodev/kernel lint` — passed (`eslint .`).
- `pnpm --filter @brambodev/kernel test` — 9 files / 275 tests passed; 2 export-surface assertions initially failed and were updated in `test/helpers.ts` for the intentional additive API, then focused and full checks were rerun.
- P1 focused suite — 13 tests passed (replay ordering/overflow/close and prompt duplicate/conflict/terminal behavior included).
- Updated full kernel suite — 11 files / 286 tests passed; typecheck and lint passed.
- ACP adapter focused suite — 4 tests passed (lifecycle requests, updates/permission decisions, malformed/oversized frames, close rejection/cleanup).
- `pnpm --filter @brambodev/adapter-acp typecheck` — passed.
- `pnpm --filter @brambodev/adapter-acp lint` — passed.
- Kernel regression `pnpm --filter @brambodev/kernel exec vitest run test/acp.test.ts` — 13 tests passed.
- `pnpm --filter @brambodev/cli exec vitest run test/module-graph.test.ts` — 2 tests passed after registering the additive ACP module and raising the explicit graph budget to 98 modules / 1,352,000 bytes.
- `pnpm check` — passed: all 21 workspace typechecks, package test suites, and ESLint.
- `pnpm build` — passed: Docusaurus en/es production builds and all 21 package builds.

## Delivery evidence

- Work-unit commit: `1ddcb1c` (`feat(kernel): add ACP-neutral session primitives`).
- Work-unit commit: `eb22e26` (`feat(kernel): add replay and prompt admission primitives`).
- Work-unit commit: `d883db8` (`feat(adapter-acp): add stdio JSON-RPC client`).
- Work-unit commits: `926404d`, `625eea9`, `db648d3`, `9140f9b`, `df0811e`, and `faced7f`.
- Parent spot-check: `pnpm --filter @brambodev/kernel exec vitest run test/acp.test.ts` — 1 file / 9 tests passed.
- Parent P1 spot-check: `pnpm --filter @brambodev/kernel exec vitest run test/acp.test.ts` — 1 file / 13 tests passed.
- Pre-commit writer checks: full kernel suite 11 files / 282 tests passed; typecheck passed; lint passed.

## Next step

Run the complete repository verification gate and preserve `release-status.json`; no adapter/transport expansion is planned for this kernel slice.
