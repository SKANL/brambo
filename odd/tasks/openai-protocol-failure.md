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
- [x] Build a fresh disposable, one-request OpenAI-adapter probe because the prior temporary harness source files are absent.
- [x] Run one fresh instrumented OpenAI API probe with the previously authorized test credential, using only the safe failure projection.
- [ ] Follow the observed boundary evidence to the responsible SDK/test/provider/runtime layer.
- [ ] Add a RED regression test for the identified live-response cause, fix only that cause, and run relevant checks.
- Route: delegated direct; diagnosis prepares a multi-file implementation.
- TDD source: strict user choice; runner listed above.
- Read-only boundary map: `createOpenAIProvider` and `createApiDriverFactory` preserve `data.providerError`, but `runtime-local` rejects non-`ok` outcomes and the durable engine checkpoints only a generic task error; workflow snapshots therefore lose `failurePhase`, HTTP status, and `requestAccepted`. This is a confirmed SDK observability gap, not proof of the actual outbound failure cause.
- Probe status: the recorded temp directory exists but has none of the previous `.mjs`/`.js`/`.cjs`/`.ts` harness files; no prior invocation can be safely reused. No provider call or source edit occurred during this mapping.
- Safe direct-probe projection: envelope `status` plus `providerError.category`, `failurePhase`, HTTP `status`, and `requestAccepted` when present. Exclude request IDs, messages, summaries, turns, usage, rate limits, context, bindings, response bodies, and raw snapshots.
- Harness diagnosis: the first launch used `--reporter=basic`, which installed Vitest 4.1.11 rejects before tests start; changed the disposable host to `--reporter=dot`. Strict-TDD RED/GREEN for the fixture: the new local assertion failed on `workspace.capabilities=[]`, then passed with `['read']`. Contracts validation rejects an empty capability list before transport, explaining the safe `failed` envelope and zero attempts. The gated live test now requires exactly one fetch; gate-off Vitest, sanitizer tests (2/2), and host syntax check pass. These were test-harness defects, not the cause of the actual API response.
- Live probe result: exactly one transport attempt reached OpenAI; safe projection was `failed`, category `protocol`, phase `provider-response`, HTTP 200, `requestAccepted=true`. The response body/state was intentionally not captured. Existing code allows both a non-completed JSON response and explicit failed/incomplete SSE event to map to this phase; the 16-token output cap is a plausible test factor but not proven. Do not retry this terminal request or launch downstream provider calls.
- Probe accounting: the earlier harness invocations reported zero attempts and made zero provider requests; only the corrected probe made one actual request. The original five-stage failure and the corrected one-request failure are not proven to share a cause.
- Next: T2a's independent SDK fix is complete. The exact live provider-response subtype remains unclassified; after this terminal outcome, do not repeat OpenAI or start downstream providers without explicit authorization for a new bounded diagnostic request.
- Commit evidence: pending.

#### T2a — Preserve safe provider-failure metadata in durable workflow results
- [x] Add a failing workflow-level regression that proves `failurePhase`, HTTP status, and `requestAccepted` survive failure persistence.
- [x] Implement the smallest contract/runtime/engine propagation change without persisting provider messages or response bodies.
- [x] Run affected package tests, typechecks, and targeted lint.
- Confirmed independent SDK defect: adapter/API-driver preserve safe `data.providerError`, but runtime-local rejects non-ok output and durable-engine checkpoints a generic task failure; workflow snapshots lose those fields. This does not prove the cause of the live `provider-response` outcome.
- Route: delegated direct; investigation/write crosses multiple non-trivial files. Strict user-selected TDD; runner identified from package scripts.
- RED/GREEN: all three focused regressions failed before implementation for the expected reasons and passed after the change.
- Verification: runtime-local 20 tests, orchestration 191 tests, workflow-coordinator 74 passed/2 skipped; contracts 342 passed after removing the disposable live probe test that had caused the initial roster mismatch. Contracts/runtime-local/orchestration/workflow-coordinator typechecks and targeted lint passed; `git diff --check` passed. Parent spot-check: `pnpm --filter @brambodev/orchestration test` — 9 files/191 tests passed.
- Environment note: non-fatal engine warning; `workflow-store-sqlite` requests Node >=24.15.0 while the current Node is 24.14.1.
- Commit evidence: `8c7cc2e2fad17c7c366990cf8fd01591a76e6476` (`fix(orchestration): persist safe provider failure diagnostics`).
- Risk assessment: RDD off (`clone_local`); candidate medium (`executable_change`), `review_due:false`, `under_budget`; no native review lifecycle started.

### T3 — Verify the complete five-provider collaboration
- [ ] Run one fresh collaboration in provider order, stopping at the first terminal failure.
- [ ] Confirm context/artifact handoff across OpenAI API, Anthropic API, OpenCode, Claude Code, and Codex.
- [ ] Record sanitized stage outcomes and any unresolved external blocker; never record credentials.
- Route: delegated verification after T2; no source edits unless a newly evidenced defect is authorized by this same fix scope.
- Commit evidence: pending.

## Progress and next step

- Completed exploration: diagnosed the prior harness defects and confirmed the adapter's `protocol` fallback was broad and ambiguous. The reconstructed probe also exposed two test-only defects (unsupported Vitest reporter and empty workspace capabilities); both were fixed and their offline RED/GREEN proof is recorded under T2.
- T1 is complete across commits 61dd9bd, 7325312, and 79406b2. Malformed function-call JSON maps to `response-parse`, invalid function-call shape to `response-shape`, and stream body-read failures to `transport`; SSE parse failures remain `response-parse`. Public-path coverage verifies invalid function-call shape and malformed JSON, incomplete framing, and invalid event SSE cases. Current code passed those tests; mutation-based checks proved assertion sensitivity without falsely claiming a pre-fix RED result.
- One corrected live probe reached HTTP 200 and was accepted by the provider, then ended in `protocol/provider-response`; the specific response state was not retained. This is insufficient to attribute the cause to SDK, provider, or the 16-token test limit. No retry is authorized for this terminal outcome.
- User explicitly authorized skipping only the missing BMad renderer gate; systematic debugging and strict TDD were followed.
- Next: the independent SDK metadata-loss fix is complete. The actual provider-response subtype remains unclassified; do not repeat OpenAI or start downstream providers after this terminal outcome without explicit authorization for a new bounded diagnostic run.



