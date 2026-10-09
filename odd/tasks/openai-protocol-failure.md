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
- Next: the user explicitly authorized one further independent OpenAI request. Add and offline-test an enum-only response-state capture, use a larger output cap and fresh request identity, then make exactly one bounded request; no retries or downstream providers after a terminal outcome.
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

#### T2b — Identify HTTP-200 response subtype with one bounded probe
- [x] Add an allowlisted response-state extractor for top-level JSON status and recognized SSE event/status enums; never emit or persist the response body, content, error message, or arbitrary provider strings.
- [x] Add offline RED/GREEN tests proving recognized state projection and rejection of unknown/raw values; verify the probe gate stays disabled in local checks.
- [x] Disable redirects so the one-fetch limit also guarantees at most one HTTP exchange.
- [x] Run exactly one new OpenAI request with a fresh request identity, the same approved small model, and a higher output-token cap; stop on any terminal failure or uncertain outcome.
- User authorization: explicitly granted one independent bounded diagnostic on 2026-10-08; this is not a retry of the previous request and does not authorize downstream-provider calls before OpenAI succeeds.
- Route: delegated direct; probe/sanitizer/test changes span multiple files. Strict user-selected TDD; no production code changes unless a separately evidenced SDK defect is found.
- TDD RED for redirect handling: targeted Vitest — 1 failed, 1 passed, 1 skipped; the assertion failed because the helper passed `redirect: follow`. No network call occurred.
- TDD GREEN and offline verification: targeted Vitest — 2 passed, 1 skipped; adapter package suite — 6 files/69 tests passed; sanitizer Node tests — 6 passed; `node --check` passed for host and sanitizer. Probe gate was off and no transport was invoked.
- Safety fix: fetch init now sets `redirect: manual`, so default automatic redirect-follow cannot exceed the one-exchange authorization. An independent read-only review found the revised harness safe for one parent-only launch; its stdin timeout caveat is mitigated by supplying a complete line, and the reviewer did not run tests or launch anything.
- Live result: the single fresh request completed successfully with allowlisted `responseState=completed`, `envelopeStatus=ok`, and `transportAttempts=1`; output cap was 512. No body, message, key, or arbitrary provider string was retained. This establishes that the larger-cap request works, but does not prove the exact response state of the earlier 16-token request.
- Commit evidence: pending.

#### T2c — Honor selected OpenAI reasoning effort
- [x] Add a RED regression showing the OpenAI API adapter currently rejects the selected `reasoningEffort: low` configuration before transport.
- [x] Implement public configuration validation and request-payload support to send low reasoning effort for `gpt-6-luna`.
- [x] Run focused adapter tests, package suite, typecheck, and targeted lint; no provider request was made in this subtask.
- Discovery: the current official GPT-6 Luna model page confirms that `reasoning.effort` supports `low`; the GPT-6 guide documents the Responses API field as `reasoning.effort`. The local transport-seam test verifies explicit payload transmission, not live API acceptance. This configuration gap is separate from and not a proven cause of the earlier HTTP-200 `provider-response` failure. References: https://developers.openai.com/api/docs/models/gpt-6-luna ; https://developers.openai.com/api/docs/guides/latest-model.
- Route: delegated direct; public config, payload, and tests span multiple non-trivial files. Strict user-selected TDD; package runner is listed above.
- TDD RED: `pnpm --filter @brambodev/adapter-openai exec vitest run test/openai-provider.test.ts -t 'forwards configured low reasoning effort' --reporter=dot` — 1 failed, 45 skipped; adapter creation rejected the unrecognized configuration as invalid before the transport seam ran.
- TDD GREEN: focused test — 1 passed, 45 skipped; `pnpm --filter @brambodev/adapter-openai test` — 6 files/70 tests passed; package typecheck, targeted ESLint, and `git diff --check` passed. The commands emitted the existing Node engine warning (Node 24.14.1 vs `workflow-store-sqlite` requirement >=24.15.0); no failures resulted.
- Implementation: configuration validates the documented effort enum and emits the explicitly selected value as the Responses request's `reasoning.effort`; omitted configuration remains omitted.
- Commit evidence: `eef74f18e3d0e5a13613337c9cffa5cb83827de0` (`feat(adapter-openai): forward reasoning effort`).
- Parent verification: independently reran `pnpm --filter @brambodev/adapter-openai test` — 6 files/70 tests passed. The Node engine warning remained non-fatal. The candidate assessment over the two T2c commits, excluding the existing untracked files by exact inventory digest, was medium (`executable_change`), `review_due:false`, `under_budget`; RDD remains off, so no native review lifecycle was started.

### T3 — Verify the complete five-provider collaboration
- [x] Build and offline-test a fresh temporary workflow host and disposable workspace; the old five-provider TEMP directory is empty and the prior durable run must not be resumed.
- [ ] Run one fresh collaboration in provider order, stopping at the first terminal failure.
- [ ] Confirm context/artifact handoff across OpenAI API, Anthropic API, OpenCode, Claude Code, and Codex.
- [ ] Record sanitized stage outcomes and any unresolved external blocker; never record credentials.
- Route: delegated direct for temporary harness construction and offline tests; parent-only single live execution; delegated read-only verification afterward. No production source edits unless a newly evidenced SDK defect is within the authorized fix scope.
- Existing-run evidence: the old temporary full-collaboration folder is empty; the prior durable run made one OpenAI attempt and left all later stages pending. `durable-engine.ts` only retries an uncertain task when journaled effects prove replay safety, so T3 must use a fresh workflow/run identity and disposable workspace.
- Model mapping for the authorized run: OpenAI API and Codex CLI `gpt-6-luna` with low reasoning; Anthropic API and Claude Code use the current Haiku API identifier `claude-haiku-4-5-20251001`; OpenCode Go uses `opencode-go/deepseek-v4-flash`. Anthropic's official status page lists Haiku 4.5 as active and Haiku 3/3.5 as retired; DeepSeek documents the V4 Flash slug as a legacy name that currently serves V4.1 Flash. No fallback or other provider/model substitution.
- OpenCode safety boundary: use workspace-local configuration with explicit deny for file edits, shell, external-directory access, subagents, and web tools; do not rely on prompt-only restrictions. If the installed CLI cannot enforce this, stop before live execution.
- Model documentation: https://docs.anthropic.com/en/docs/about-claude/model-deprecations ; https://docs.opencode.ai/docs/go/ ; https://api-docs.deepseek.com/updates/.
- Offline harness result: fresh temp-only host/pipeline/tests under `C:\Users\angua\AppData\Local\Temp\brambo-t3-offline-cb026a5d13004113853f70c901494cc3`; RED was 0/8 tests passing, then GREEN was 11/11 passing with `node --conditions=brambo-source --test pipeline.test.mjs`; parent independently reran the suite (11/11 pass) and `node --check host.mjs` plus `node --check pipeline.mjs` both exited 0. Parent structural spot-check confirmed the host checks static blockers before reading stdin or initializing providers. No API, CLI, or network call occurred.
- Current live preflight blockers: OpenAI's official GPT-6 Luna model page confirms low reasoning effort and the adapter now forwards it, but T2c itself used only a local transport seam and made no live API call. T3a/T3b now set explicit OpenCode deny-all configuration and Claude/Codex CLI isolation flags at the child-process boundary, but live CLI enforcement has not been tested. OpenCode's normal session storage persists synthetic content in the user-level SQLite store. No credentials were read and no providers were initialized. Keep the harness fail-closed until the remaining live-execution and input gates are resolved.
- Commit evidence: pending.

#### T3a — Make the disposable OpenCode policy deterministic
- [x] Add an offline RED/GREEN regression proving explicit per-child config replaces any inherited config values: adapter-spawn assertions verify the explicit deny-all `OPENCODE_CONFIG_CONTENT`, config file, and config directory are passed without reading ambient values.
- [x] Make the T3 child environment explicitly point to the disposable deny-all file, inject the same deny-all policy as the highest user-configurable `OPENCODE_CONFIG_CONTENT` layer, and point `OPENCODE_CONFIG_DIR` at an empty temp directory without reading ambient values.
- [x] Fail closed if Windows' documented system-managed `%ProgramData%\opencode` config is present; the preflight checks only the fixed path's existence and never reads config contents.
- [x] Pass `reasoningEffort: 'low'` in the T3 OpenAI API selection so the real chain uses the user's chosen setting.
- Independent CLI contract challenge: Claude's local help and official docs confirm `--tools ""` disables built-in tools even though the adapter skips permission prompts; Codex help/docs confirm its read-only sandbox and ephemeral flags, but read-only may block the requested test command. OpenCode official config docs confirm config precedence and that managed settings override all user config; permissions docs confirm explicit deny rules. Parent's prior path-only check reported the current host has no Windows managed OpenCode configuration directory. No CLI session or provider call was executed.
- OpenCode state note: the CLI persists sessions in a user-level SQLite store. The user explicitly authorized testing the authenticated CLI; T3 uses only synthetic task content and will not inspect or copy the database. Report the normal session persistence side effect.
- Route: delegated direct; temp harness config and tests span multiple files. Strict user-selected TDD; observed RED then GREEN with `node --conditions=brambo-source --test pipeline.test.mjs`, followed by `node --check host.mjs` and `node --check pipeline.mjs`. No provider/CLI invocation while iterating offline tests.
- Status: complete for offline T3a hardening; the separately tracked live five-provider T3 run remains pending.
- Commit evidence: no product-code commit; harness changes are temporary-only. Tracker update is recorded separately.

#### T3b — Enforce zero-tool and read-only settings for authenticated CLI stages
- [x] Add offline RED assertions that Claude Code runs with built-in tools disabled and customizations/MCP disabled, without bypassing permission prompts; verify Codex CLI is ephemeral, ignores user configuration, and uses a read-only sandbox with non-interactive approval behavior.
- [x] Implement only the minimal CLI arguments/configuration needed to enforce those settings through Brambo's actual child-process adapter boundary; preserve the existing OpenCode deny-all policy and blank API-key variables for CLI subprocesses.
- [x] Run offline RED/GREEN, syntax checks, and `git diff --check`; no CLI/provider/network invocation while iterating.
- Root-cause evidence: the adapter currently adds `--dangerously-skip-permissions` for Claude Code, which suppresses permission prompts but does not disable tools; the official/local CLI contract supports `--tools ""` and `--safe-mode`. A read-only Codex sandbox may refuse an in-workspace command, which is an acceptable terminal result rather than a reason to relax isolation or retry.
- Route: delegated direct; the temporary pipeline and test contract span multiple non-trivial files. Strict user-selected TDD; verification command is `node --conditions=brambo-source --test pipeline.test.mjs`.
- No live provider or CLI execution is authorized by this subtask; any future live run remains one sequential invocation with synthetic data and no retries.
- Base commit: `88f12698dbae02748790b01b0b1702dedd8efdb2`.
- RED: `node --conditions=brambo-source --test pipeline.test.mjs` — 10 passed, 2 failed; the actual adapter-spawn assertions found Claude's permission-bypass flag present and Codex's explicit non-interactive approval flag absent. An earlier intermediate test run also reported 10 passed/2 failed, including an absent construction-seam assertion; that temporary assertion was replaced with the behavioral Codex boundary regression before implementation.
- GREEN: the exact offline suite passed 12/12 tests; `node --check host.mjs`, `node --check pipeline.mjs`, and `git diff --check` exited 0. The Git check printed only the existing LF-to-CRLF conversion warning. Refactor review required no further behavior or structural change.
- Harness implementation: `createCliStageAdapter` uses the public generic Brambo CLI engine with a copy of `CLAUDE_CODE_TRAITS` excluding only `--dangerously-skip-permissions`; all remaining traits are preserved, and existing `--tools` with an empty argument, `--safe-mode`, and no-session-persistence reach the child-process seam. Host and tests share this construction path. Codex now explicitly adds `--ask-for-approval never`, preserving low reasoning, ephemeral sessions, ignored user configuration, and the read-only sandbox. The default product adapter traits are unchanged.
- Safety evidence: actual adapter spawn options retain OpenCode's deny-all inline/file/directory configuration and explicitly blank both API-key variables for all CLI children; the existing managed-config preflight, credential-input ordering, serial execution, patch allowlist, and bounded transport tests remain green. Only synthetic fixtures were used. No provider, CLI binary, network call, host launch, or credential/auth-store access occurred.
- Parent verification: independently reran `node --conditions=brambo-source --test pipeline.test.mjs` (12/12 passed), `node --check host.mjs`, `node --check pipeline.mjs`, and `git diff --check` (exit 0). Structural readback confirmed the tests exercise actual adapter spawn options, not just helper configuration.
- Independent review: no critical, important, or minor findings; reviewer approved offline T3b only and explicitly declined to assert live CLI enforcement or provider/auth behavior.
- Review tier: RDD is off (`clone_local`). Native risk assessment returned high/unassessable because the existing unrelated untracked files were not included in the assessment inventory; no native review lifecycle was started. The high-tier independent static verification was completed above.
- Status: complete for offline T3b hardening only; live CLI enforcement and the five-provider T3 run remain unverified/pending. Read-only command refusal must remain terminal rather than triggering relaxed isolation or retries.
- Commit evidence: `2fbbd9abcf27e1c5bd4d1d5fecec6df0815af04` (`docs: record offline CLI safety hardening`); harness changes remain temporary-only.

#### T3c — Verify and isolate CLI child-process environments
- [x] Add a synthetic-canary regression through the actual CLI adapter spawn boundary proving whether parent-process environment values reach authenticated provider CLIs; never read, print, copy, or persist real environment values.
- [x] If the adapter inherits arbitrary host environment, add the smallest public SDK isolation control or safe child-environment allowlist needed to keep unrelated secrets out of CLI tool processes while preserving required platform/runtime variables and the CLI's normal authenticated session lookup. Keep OpenAI/Anthropic API-key variables explicitly blank for CLI children.
- [x] Run the adapter's focused RED/GREEN suite, typecheck/lint as applicable, and the offline T3 pipeline suite. Do not invoke any CLI, provider, network, or live host while iterating.
- Root-cause evidence: static harness readback shows its intended CLI environment starts with only blank OpenAI/Anthropic key fields, but prior adapter mapping noted that spawned CLI processes may inherit the parent environment. The actual SDK spawn contract must be tested with a synthetic sentinel before any live invocation.
- Route: delegated direct; adapter implementation and tests span multiple non-trivial files if the suspected inheritance is confirmed. Strict user-selected TDD; resolve the exact package test runner from that package's scripts before writing.
- Scope: a production SDK change is authorized only if the synthetic RED test confirms the adapter leaks arbitrary parent environment into child processes; otherwise keep any necessary correction temporary-harness-only and document the evidence.
- Base commit: `a884420f5c843cb237e5f53684c2f2bce9b13a00`.
- Confirmed root cause: `createNodeChildSpawner` spread all of `process.env` before explicit `env` overrides. Through the actual Claude adapter and Node spawner, a mocked OS-spawn boundary received the synthetic unrelated-secret sentinel despite blank OpenAI/Anthropic key overrides. Tests replace the environment with synthetic fixtures and restore its property descriptor without inspecting real values; no provider binary is launched.
- Public SDK control: optional `inheritEnv: readonly string[]` is forwarded from all trait-driven CLI adapters to the Node spawn seam. Omitted preserves legacy full inheritance; `[]` inherits none; an explicit list selects only named host variables, then caller `env` overrides and owned `PWD` apply. Windows overrides de-duplicate case-insensitive keys so inherited `PATH` cannot defeat explicit `Path`, nor caller `pwd` defeat owned `PWD`. Custom spawners must honor the option themselves.
- Harness hardening: all three CLI stages now explicitly inherit only platform/runtime discovery, profile/auth-lookup paths, temporary-directory paths, and locale names. The list excludes unrelated API keys/secrets, injected runtime hooks (`NODE_OPTIONS`), and inherited provider configuration; OpenCode's disposable explicit deny-all settings and blank OpenAI/Anthropic keys remain unchanged. Profile paths preserve normal session lookup without inspecting/copying auth stores; environment filtering does not sandbox filesystem access or isolate shared profile state.
- RED: initial focused canary command `pnpm --filter @brambodev/adapter-cli test --testNamePattern 'isolates an adapter child'` failed 1/169 skipped because the synthetic canary reached spawn. Expanded command `pnpm --filter @brambodev/adapter-cli test --testNamePattern 'spawn environment'` failed 3/1 passed/168 skipped (allowlist, empty inheritance, Windows override regressions). Offline harness command `node --conditions=brambo-source --test pipeline.test.mjs` failed 1/11 passed because CLI spawn options omitted the inheritance allowlist.
- GREEN: `pnpm --filter @brambodev/adapter-cli test` passed 11 files/167 tests, with 5 existing skips; the focused environment command passed 4/168 skipped. Offline harness suite passed 12/12 tests. `pnpm --filter @brambodev/adapter-cli typecheck`, `pnpm --filter @brambodev/adapter-cli lint`, `node --check pipeline.mjs`, `node --check host.mjs`, and `git diff --check` exited 0. Non-fatal warnings: workflow-store-sqlite requires Node >=24.15.0 while current Node is 24.14.1; Git reports existing LF-to-CRLF conversion policy. Refactor readback required no further source changes.
- Status: complete for offline T3c environment hardening only. No live host, provider API, provider CLI, network call, real environment-value inspection, or auth-store access occurred; live enforcement/authentication and the five-provider run remain unverified/pending. Unrelated untracked files remain untouched.
- Commit evidence: work-unit `dd69906ba66b84527008ca09cf382753cf4bc12c` (`fix(adapter-cli): allow restricted child environments`). Temporary harness changes are outside Git.
- Prior implementation commit: `dd69906ba66b84527008ca09cf382753cf4bc12c`.
- [x] Correct the independent review's Windows `PWD` alias-order defect and rerun focused/full adapter and offline harness checks. T3c was reopened for this correction and is complete again after observed checks below.
- Review finding: combining explicit caller `env` and SDK-owned `PWD` in one object retains an existing uppercase `PWD` insertion slot. If lowercase `pwd` follows it, the normalization loop deletes the owned uppercase key and accepts the caller's lowercase path. Both alias insertion orders must preserve owned `PWD`; normalize caller overrides first, then enforce the SDK-owned value last.
- Review correction RED: `pnpm --filter @brambodev/adapter-cli test --testNamePattern 'spawn environment'` failed 1/5 passed/168 skipped. The uppercase-first alias fixture produced only caller-controlled lowercase `pwd`; the reverse insertion order passed. Both fixtures exercise the actual Node spawner with a mocked OS spawn and synthetic-only environment replacement.
- Review correction implementation: append `['PWD', cwd]` as a separate final entry after `Object.entries(options.env ?? {})`, preserving the existing case-insensitive de-duplication loop. This prevents an existing object property's insertion slot from moving SDK ownership before a later alias. Refactor readback needed no further changes.
- Review correction GREEN: focused environment command passed 6/168 skipped; `pnpm --filter @brambodev/adapter-cli test` passed 11 files/169 tests with 5 existing skips. Adapter `typecheck` and `lint`, offline `node --conditions=brambo-source --test pipeline.test.mjs` (12/12), `node --check pipeline.mjs`, `node --check host.mjs`, and `git diff --check` exited 0. Only the previously recorded Node engine and CRLF warnings remained. No provider/CLI/network/live-host/auth-store or real environment-value access occurred; unrelated untracked files were preserved.
- Correction commit evidence: work-unit `b79fcb06e62701232d2ffc3766250323e9c601c8` (`fix(adapter-cli): enforce owned PWD after caller aliases`). Live T3 remains pending/unverified.

## Progress and next step

- Completed exploration: diagnosed the prior harness defects and confirmed the adapter's `protocol` fallback was broad and ambiguous. The reconstructed probe also exposed two test-only defects (unsupported Vitest reporter and empty workspace capabilities); both were fixed and their offline RED/GREEN proof is recorded under T2.
- T1 is complete across commits 61dd9bd, 7325312, and 79406b2. Malformed function-call JSON maps to `response-parse`, invalid function-call shape to `response-shape`, and stream body-read failures to `transport`; SSE parse failures remain `response-parse`. Public-path coverage verifies invalid function-call shape and malformed JSON, incomplete framing, and invalid event SSE cases. Current code passed those tests; mutation-based checks proved assertion sensitivity without falsely claiming a pre-fix RED result.
- One corrected live probe reached HTTP 200 and was accepted by the provider, then ended in `protocol/provider-response`; the specific response state was not retained. This is insufficient to attribute the cause to SDK, provider, or the 16-token test limit. No retry is authorized for this terminal outcome.
- User explicitly authorized skipping only the missing BMad renderer gate; systematic debugging and strict TDD were followed.
- Next: T2a's metadata-loss fix, T2b's bounded diagnostic, and T2c's explicit reasoning-effort payload support are complete. Official docs confirm `gpt-6-luna` supports low; the 512-token request succeeded, but the original 16-token response subtype remains unknown. T3 must still resolve the remaining CLI safety gates before any authorized launch. Never resume the prior uncertain run.



