# API adapters — execution tracker

## Objective
Ship Brambo's complete API executor capability: shared transport-neutral core, official OpenAI Responses and Anthropic Messages adapters, secure third-party extension, host-controlled local tools and policies, environment/CLI selection, release documentation, deterministic verification, and authorized live evidence.

## Problem and rationale
Brambo currently supports CLI vendors. The API path must remain micro-kernel-first: the kernel/session owns execution and policy boundaries; providers are explicit packages registered by the host. Provider credentials and arbitrary imports must never enter persisted profiles.

## Authorized scope
Implementation worktree: C:\Users\angua\.codex\worktrees\api-adapters\panda
Implementation design: docs/superpowers/specs/2026-09-24-api-adapters-design.md
Implementation plan: docs/superpowers/plans/2026-09-24-api-adapters.md
Route: delegated direct (subagent-driven). Trigger: each remaining task touches multiple non-trivial files and requires implementation-focused reading.

## Constraints
- OpenAI and Anthropic support is first-release, not a reduced variant.
- Local tools go through Brambo executeTool(), approval/policy, and host control.
- Third-party providers are npm packages plus explicit host registration; discovery is opt-in and allowlisted.
- Core packages cannot depend on provider SDKs.
- No credentials in config, imports, logs, errors, or ordinary tests.
- Live provider calls require separate explicit authorization and credentials.
- Every task gets TDD/functional checks, a conventional work-unit commit, and native review when due.

## TDD
Mode: existing tests required; runner: pnpm/Vitest. Evidence: plan and existing package tests. Each writer must demonstrate RED → GREEN → REFACTOR where the task introduces behavior.

## Delivery
Strategy: ask-on-risk. Forecast: multi-package changes exceed one small slice; keep each task as an independently reviewable work-unit commit.

## Tasks
- [x] T01 contracts/session compatibility — commit 288ec4e; reviewed.
- [x] T02 provider contracts — commits fdab094, 50542da; reviewed.
- [x] T03 registry and retry transport — commits 004229d, 8d356a0, 6e6022d; reviewed.
- [x] T04 safe events/redaction — commits 487312a, a30c9d1; reviewed.
- [x] T05 authorized local tool loop — commits ec050d2, cbaa4d1; reviewed.
- [x] T06 hosted capabilities and ownership ledger — commits 0d2b511, 8e19076; native review acknowledged (review-21f12eff062f4d46).
- [x] T07 public conformance suite — commits 4f8fe0c, f3c6253, aa7c4fd; 68 adapter-api tests + packed proof passed; native review abandoned at explicit user direction after provider lifecycle returned empty output.
- [x] T08 official OpenAI Responses adapter — commits a313a68, 0ac5233, 802e077; 49 adapter tests passed; independent review corrections closed; real-provider evidence remains pending T15.
- [x] T09 official Anthropic Messages adapter — commits 179e796, 3c92dc5, fa79c65, 9b7cdc8, 23c4814; 50 adapter tests passed; final independent review passed; real-provider evidence remains pending T15.
- [x] T10 safe allowlisted installed-provider discovery — commits 883bc1a, 990eb2f, af18d64; 79 adapter-api tests, typecheck, and lint passed; final independent review passed.
- [x] T11 environment and CLI API-profile integration — commits f2d48ab, ca7f876; 137 environment and 231 CLI tests passed; final independent review passed; profiles persist only providerId/model/capabilities.
- [x] T12 docs, metadata, manual live-test guards, and initial deterministic verification — commits 831f629, f566b49, 670d936; independent review passed for that implementation. This does not establish real-provider release evidence.
- [x] T13 add the plan-required scheduled live workflow alongside manual dispatch, without exposing secrets to untrusted pull requests — commit 86d3444; workflow policy RED → GREEN (9/9), `pnpm check`, `pnpm docs:check`, and `pnpm lint` passed. Scheduled execution itself remains unobserved.
- [x] T14 rerun final deterministic release checks on candidate 86d3444 and record only observed results in the verification report — commit 05601e5; `pnpm check`, `pnpm build`, `pnpm proof:consumer-install`, and `pnpm docs:check` passed. The docs-only report edit passed a further `pnpm docs:check` and source-byte check.
- [ ] T15 collect bounded OpenAI and Anthropic real-provider evidence only after explicit authorization, protected credentials, and configured models; otherwise retain a clearly pending result.
- [ ] T16 record the terminal native review receipt or exact non-terminal status for the final candidate; do not infer approval from earlier independent reviews.

## Current verification
- Task 6 authority was recovered from the authoritative review store and acknowledged on 2026-09-24; acknowledgement burned only its approved candidate authority.
- No live API evidence is yet authorized or available; T15 remains pending.
- The deterministic report records actual checks against candidate 86d3444 and is committed at 05601e5; final-candidate native receipt remains pending (T16).

## Next step
Seek separate authorization for T15 and resolve T16 before claiming the full release acceptance checklist complete.
