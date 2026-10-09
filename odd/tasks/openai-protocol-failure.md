# OpenAI Protocol Failure: Diagnosis and Fix

## Objective

Identify and fix the cause of the failed OpenAI API stage in Brambo's five-provider collaboration, then verify the complete provider handoff rather than stopping at an opaque protocol error.

## Problem

A fresh isolated collaboration made one OpenAI API attempt and stopped with normalized category `protocol` and no HTTP status. Anthropic, OpenCode, Claude Code, and Codex stages remained pending. The temporary harness's diagnostic projection and category allowlist were repaired and its six focused tests pass, so the remaining failure is not yet classified as an SDK, provider, transport, or runtime defect.

## Why

The SDK must work for developers' projects, not merely pass isolated adapter tests. The prior run did not preserve enough safe boundary evidence to locate the failure.

## Scope and constraints

- Work only in the attached worktree `C:\Users\angua\.codex\worktrees\provider-agnostic-orchestration\panda`, branch `codex/provider-agnostic-orchestration`.
- Do not modify the separate `C:\code\panda` checkout or its existing untracked planning/release files.
- Preserve existing untracked files in the attached worktree.
- Never write or print API keys, prompts, response bodies, raw provider messages, headers, or environment values.
- Add only bounded safe diagnostics (stable failure phase/category/status); avoid exposing secrets or user content.
- TDD is strict: RED → GREEN → REFACTOR, explicitly selected by the user for this task.
- Package check: `pnpm --filter @brambodev/adapter-openai test`.
- Do not blind-retry an uncertain provider request. Use fresh run identities for any authorized live probe and stop on the first terminal failure.
- Forecast: under 400 authored changed lines; default delivery strategy `ask-on-risk`; commits stay local and no PR/push is authorized.

## Acceptance criteria

- A focused regression test fails before the SDK diagnostic fix and passes afterward.
- OpenAI adapter failures preserve enough stable, privacy-safe information to distinguish relevant request/transport/response/callback phases without claiming provider acceptance when that is unknown.
- The live failure is classified from captured evidence as SDK, test harness, provider/configuration, or execution environment; no unsupported attribution.
- The minimal root-cause fix is covered by tests.
- The five-provider collaboration is rerun after the fix and reaches all stages successfully, or stops with an accurately classified external blocker and no false success.
- Existing unrelated worktree files remain untouched.

## Tasks

### T1 — Preserve safe OpenAI failure-boundary evidence
- [x] Add failing tests for the error boundaries that currently collapse to `protocol`.
- [x] Implement the smallest adapter contract change that preserves stable, safe phase/cause information and accurately represents whether a request was accepted.
- [x] Run the adapter package suite and record observed results.
- [x] Correct malformed function-call payloads that currently fall through to processing.
- [x] Distinguish stream body-read transport failures from SSE parse/protocol failures.
- Review follow-up from independent verification of commit 61dd9bd: the two phase mappings above were incomplete; reopen T1 before proceeding to T2.
- [x] Add a public-adapter regression for invalid function-call shape mapping to `response-shape`.
- [x] Add a public-adapter regression for malformed/framing/event SSE failures mapping to `response-parse`.
- Independent review follow-up from commit 7325312: the classifiers appeared correct, but these branches lacked focused public-path assertions; T1 was reopened for coverage only, without claiming a new production defect. Resolved by the coverage commit below.
- Route: delegated direct; implementation spans adapter logic and tests (>1 non-trivial file).
- TDD source: strict user choice; runner listed above.
- RED: contract focused test 1 failed/8 passed; API redaction focused test 1 failed/3 passed; OpenAI suite 8 failed/29 passed against the original implementation. Additional focused regressions separately failed for unsuccessful provider responses (1 failed/37 skipped) and preserving the primary transport boundary when error observation also throws (1 failed/38 skipped).
- GREEN: `pnpm --filter @brambodev/adapter-openai test` — 6 files/63 tests passed; `pnpm --filter @brambodev/contracts test` — 24 files/341 tests passed; `pnpm --filter @brambodev/adapter-api test` — 10 files/90 tests passed.
- Checks: typecheck passed for adapter-openai, contracts, and adapter-api; targeted ESLint passed for all seven changed source/test files. The pnpm workspace printed a non-fatal engine warning because workflow-store-sqlite requires Node >=24.15.0 while this environment uses Node 24.14.1.
- Runtime harness: N/A for T1; verification uses mocked/local tests only and made no provider or network calls.
- Commit evidence: implementation work-unit `61dd9bd41ed0d00781b06ce833b0877c31013de5` (`fix(adapter-openai): preserve safe failure phases`).
- Reopened RED: malformed function-call arguments focused test failed 1/39 skipped because the error was reported as `processing`; stream body-read rejection focused test failed 1/40 skipped because it was reported as `response-parse`.
- Reopened GREEN: both focused tests passed individually; `pnpm --filter @brambodev/adapter-openai test` — 6 files/65 tests passed.
- Reopened checks: adapter-openai typecheck and targeted ESLint for both source files and the provider test passed; `git diff --check` passed. The non-fatal Node engine warning described above remained.
- Correction commit evidence: `7325312da8f7bb97f53c5ebc1eb7cf4366d44016` (`fix(adapter-openai): classify function and stream failures`).
- Coverage review: an independent read-only review found no new implementation defect, but identified two untested classifications above; coverage additions remain pending.
- Coverage verification: current HEAD passed the focused public-adapter tests: 4 passed/41 skipped (invalid function-call shape plus malformed JSON, incomplete framing, and invalid event shape SSE cases).
- Mutation-based RED proof: temporarily changing the invalid function-call classifier to `response-parse` made its focused test fail 1/44 skipped; temporarily changing the SSE parse fallback to `response-shape` made all three SSE cases fail (3 failed/42 skipped). Each temporary production mutation was restored byte-for-byte before final verification; this is mutation-based sensitivity proof, not a pre-fix RED claim.
- Coverage GREEN: `pnpm --filter @brambodev/adapter-openai test` — 6 files/69 tests passed; adapter typecheck and targeted ESLint for the test file passed; `git diff --check` passed. The non-fatal Node engine warning described above remained.
- Coverage commit evidence: `79406b28094186b05a5737dbf31ca4bb00270f06` (`test(adapter-openai): cover response failure phases`); tests only, no production classifier changes.
- Parent spot-check: `pnpm --filter @brambodev/adapter-openai test` — 6 files/69 tests passed. The workspace's Node engine warning remained non-fatal.
- Delegated verification gate: RDD is off (`clone_local`); candidate assessment was medium (`executable_change`), `review_due: false`, `under_budget`; no native review lifecycle was started. Parent structural readback and package-suite spot-check completed.

### T2 — Reproduce and correct the actual OpenAI-stage cause
- [ ] Run one fresh instrumented OpenAI API probe with the previously authorized test credential, using only the safe failure projection.
- [ ] Follow the observed boundary evidence to the responsible SDK/test/provider/runtime layer.
- [ ] Add a RED regression test for the identified root cause, fix only that cause, and run relevant checks.
- Route: delegated direct; diagnosis prepares a multi-file implementation.
- TDD source: strict user choice; runner listed above.
- Commit evidence: pending.

### T3 — Verify the complete five-provider collaboration
- [ ] Run one fresh collaboration in provider order, stopping at the first terminal failure.
- [ ] Confirm context/artifact handoff across OpenAI API, Anthropic API, OpenCode, Claude Code, and Codex.
- [ ] Record sanitized stage outcomes and any unresolved external blocker; never record credentials.
- Route: delegated verification after T2; no source edits unless a newly evidenced defect is authorized by this same fix scope.
- Commit evidence: pending.

## Progress and next step

- Completed exploration: diagnosed the prior harness defects and confirmed the adapter's `protocol` fallback was broad and ambiguous.
- T1 is complete across commits 61dd9bd, 7325312, and 79406b2. Malformed function-call JSON maps to `response-parse`, invalid function-call shape to `response-shape`, and stream body-read failures to `transport`; SSE parse failures remain `response-parse`. Public-path coverage verifies invalid function-call shape and malformed JSON, incomplete framing, and invalid event SSE cases. Current code passed those tests; mutation-based checks proved assertion sensitivity without falsely claiming a pre-fix RED result.
- The prior live failure remains unclassified: T1 improves future evidence but does not establish the cause of that earlier attempt. No provider request was run during T1.
- User explicitly authorized skipping only the missing BMad renderer gate; systematic debugging and strict TDD were followed.
- Next: continue to T2's separately authorized live diagnosis; T3 remains dependent on the observed T2 outcome.



