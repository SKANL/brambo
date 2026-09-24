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
- [ ] T07 public conformance suite — adapter-api testing export, fixtures, consumer proof.
- [ ] T08 official OpenAI Responses adapter — full mapping, streaming/tools/capabilities and tests.
- [ ] T09 official Anthropic Messages adapter — full mapping, streaming/tools/capabilities and tests.
- [ ] T10 safe allowlisted installed-provider discovery.
- [ ] T11 environment and CLI API-profile integration.
- [ ] T12 docs, metadata, CI/live-test guards, deterministic release verification, and authorized live evidence.

## Current verification
- Task 6 authority was recovered from the authoritative review store and acknowledged on 2026-09-24; acknowledgement burned only its approved candidate authority.
- No live API evidence is yet authorized or available.

## Next step
Implement T07 through a delegated writer with focused tests and a work-unit commit; then review it before T08.
