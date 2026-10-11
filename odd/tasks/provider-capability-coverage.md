# Provider capability coverage

## Outcome and authorization

Expose useful model controls across built-in providers and custom drivers without turning the core into a vendor-specific request bag.

The user approved the recommended provider-agnostic direction, written design, implementation plan and all local tasks using Subagent-driven execution. Strict TDD remains true. All seven implementation-plan tasks and PC1–PC5 are complete after parent review, including the final scoped correction PASS at source HEAD `f02f40362f95502c83ea0c6e88c1874c12f1682c`. Required local test/typecheck/lint, nine offline builds and emitted-declaration consumer proof passed. Supplemental release-doc snapshot validation remains a historical failure on 152 baseline CRLF/LF-only mismatches, NOT a pass. Packed-install, native/model/API/CLI, rendered-site and remote qualification remain unclaimed.

- Branch: `codex/provider-agnostic-orchestration`.
- Inspected baseline: `82fc17fee9877fb27b4f2b35d764070354a948be`.
- Design: `docs/superpowers/specs/2026-10-10-provider-capability-coverage-design.md`.
- Plan: `docs/superpowers/plans/2026-10-10-provider-capability-coverage.md`.
- Authorized eventual scope: additive public configuration/capability contracts, native mappings, task/run propagation, compatibility tests and documentation.
- Excluded: universal vendor parity, a hardcoded model catalog, credentials in durable configuration, policy grants through options, unrelated refactors and remote delivery.
- No push, PR, merge, installs, paid/provider calls or native CLI execution is authorized by this work unit.

## Stable tasks and route

- [x] **PC1 — Matrix and written design.** Map OpenAI, Anthropic, Codex CLI, Claude Code, OpenCode and arbitrary custom drivers; define extension, validation, policy and compatibility boundaries. Route: delegated mapping/design because understanding crosses four or more files. Written/self-reviewed and explicitly approved by the user; documentation commit `789476b74ee0b4975cb9d4ca801659431404a6be`.
- [x] **PC2 — Public typed configuration and capability extension contracts.** Add discoverable typed controls and controlled extension schemas with caller-supplied model-capability resolution. Route: delegated writer; multiple non-trivial contracts and adapters. Preserve legacy callers and custom drivers.
- [x] **PC3 — Native option mappings.** Map supported API controls and typed CLI model controls with model/version-aware validation, exact request/argument tests and no policy escalation. Route: delegated writer; multiple providers. Verify primary vendor documentation before adding new native controls.
- [x] **PC4 — Task/run propagation and compatibility.** Resolve explicit precedence, freeze effective durable configuration before admission, and preserve task restart/attempt behavior and existing profiles. Route: delegated writer; orchestration, contracts and runtime boundaries. Parent review clean through `503ae65b763bf809026c268e1e8a583d81ad797e`.
- [x] **PC5 — Verification and consumer documentation.** Verify public imports, synthetic mappings, rejection paths, durable replay and backward compatibility; document supported controls and unknown-model limitations. Route: delegated verification/docs; cross-package checks.

## Acceptance criteria

- Existing OpenAI reasoning controls remain available; vendor-native controls retain their own semantics.
- Unknown/custom models are explicit, not classified by an invented universal catalog.
- Unsupported or conflicting requested controls fail before fetch/spawn; no silent downgrade.
- Configuration cannot authorize tools, host access, credentials, approval bypass or other policy capabilities.
- Custom drivers can declare typed, namespaced controls without modifying a closed core vendor enum.
- Effective precedence is deterministic and validated; durable replay uses the same frozen configuration.
- Existing constructors, string executor selections and drivers without new configuration continue to work.
- Coverage statements distinguish exposed, forwarded, structurally validated and model-verified controls.

## TDD and planned verification

**Strict TDD: true**, from the current explicit user instruction. Every later source behavior requires observed **RED → GREEN → REFACTOR**; existing tests alone do not establish RED. The exact package scripts below were inspected, not executed in this documentation phase.

```text
pnpm --filter @brambodev/contracts test
pnpm --filter @brambodev/adapter-api test
pnpm --filter @brambodev/adapter-openai test
pnpm --filter @brambodev/adapter-anthropic test
pnpm --filter @brambodev/adapter-cli test
pnpm --filter @brambodev/orchestration test
pnpm --filter @brambodev/workflow-coordinator test
pnpm --filter @brambodev/runtime-local test
```

These scripts use Vitest. API/CLI adapter scripts exclude live-test filename patterns. Use the affected package's `typecheck` and `lint` scripts alongside focused tests. Any additional profile/package checks must be identified in the approved implementation plan. Mapping tests use synthetic transports/spawners, not credentials or native providers. Packaging checks requiring installs need separate authorization.

## Delivery and recovery

- Forecast after plan decomposition: approximately 1,000–1,600 authored implementation/test/doc lines; preliminary, not a size acceptance criterion. The approximately 400-line task heuristic does not permit omitting tests or compressing code.
- Delivery strategy: **ask-on-risk**. Preserve the previously selected **stacked-to-main** chain strategy and **Subagent-driven** execution method. Proposed delivery boundaries are the plan's seven tested work units, measured at execution. If a cohesive slice exceeds 400 after one honest slicing pass, stop for a maintainer exception/delivery decision; no prior exception is inherited. Local planning grants no remote delivery authorization.
- Design documentation commit: `789476b74ee0b4975cb9d4ca801659431404a6be` (two new docs, 201 additions). Plan documentation unit contains only the new plan and this tracker update; resolve its identity with `git log -1 -- docs/superpowers/plans/2026-10-10-provider-capability-coverage.md`. Parent handoff records the exact commit. Later task closures record their observed checks and work-unit commits here.
- Rollback boundary for this unit: remove the new implementation plan and revert only this tracker update; no SDK behavior changed.
- Existing dirty/untracked planning and integration files must remain untouched.
- Engram mirror: full current tracker is mirrored under `odd/provider-capability-coverage/tasks` in project `brambo`; closure requires exact full-content readback after the documentation commit. Historical pending-mirror entries below describe earlier snapshots.

## Current proof and next gate

PC1–PC4 are complete after source-backed design approval and parent-reviewed Tasks 1–6. The seven work units preserve the approved additive interfaces, strict-TDD behavior proof, explicit native mapping evidence and atomic durable admission. Task 7 adds public-root typed consumers and coverage/limits documentation; its final local checks and parent whole-branch review are recorded below. Historical task entries retain the status and checks observed at that time.

Design-unit proof: structural readback/source-script spot-checks and `git diff --cached --check` exit 0; 201 additions in the isolated design commit. Plan-unit proof: structural readback/self-review, existing-path checks, seven task headings/five Review Focus entries, zero placeholders and balanced code fences; `git diff --cached --check` exit 0. Tests/builds are **N/A: documentation-only phase**, not a claimed pass. All four existing dirty/untracked file hashes match the pre-write baseline.

Final status: parent whole-feature review and final scoped correction review are complete; PC5 is closed. Plan-owned ledger and seven briefs: `.superpowers/sdd/2026-10-10-provider-capability-coverage/`; context: `execution-context.md`. Execution baseline: `b34e17f66e43e3e55edeb775b60e0bbd7bea9785`. Preserve Subagent-driven and stacked-to-main; no remote delivery occurred. Parent reconciles the full feature mirror after the handoff.

## PC2 subprogress — Task 1 public control contracts

- [x] Implement Task 1 contracts, root exports and additive manifest/request/snapshot fields with legacy-input compatibility. Task 2 resolution/mapper work remains pending, so PC2 is NOT complete.
- Route: delegated bounded writer, `controls_task1`; multiple non-trivial contract and test files. Strict TDD true; runner Vitest, explicit current user authorization.
- RED before source edits: focused configuration/snapshot command exited 1 (8 failed, 2 passed). Actual failures: missing validator export, invalid optional RunRequest controls accepted, snapshot field refused. Expanded compatibility RED: 8 failed / 57 passed, four files.
- Additional safety RED: array Proxy property access (1 failed / 10 skipped) exposed `durableJson` reading array length; use own length descriptor. Inherited optional controls RED failed first on RunRequest, then on ExecutorManifest (each 1 failed / 11 skipped); both now reject without evaluating inherited properties.
- GREEN / REFACTOR: focused configuration/snapshot command passed 12 tests; full `pnpm --filter @brambodev/contracts test` passed 357 tests / 25 files. `pnpm --filter @brambodev/contracts typecheck` and `lint` exited 0; `git diff --check` exited 0. Readability refactor expanded the modified manifest validator; behavior stayed green.
- Baseline: 342 tests / 24 files passed. Existing engine warning: Node 24.14.1, while workflow-store-sqlite declares >=24.15.0. No baseline test failures. Earlier intermediate type errors were corrected and rechecked.
- Runtime harness: N/A, data contracts only; no native/provider/store execution. Snapshot duplicate/foreign IDs reject in validation before any store port can receive them.
- Work-unit commit: `feat(contracts): add extensible execution control contracts`; resolve identity with `git log -1 --format=%H --grep='^feat(contracts): add extensible execution control contracts$'`. Exact identity is recorded in the local execution ledger/report after commit, avoiding a self-referential commit hash.
- Rollback: remove execution-configuration module/exports/tests and revert only additive fields/validation plus descriptor-based array length read; legacy contracts remain intact. Four unrelated dirty/untracked paths preserved by SHA-256 comparison.
- Parent independent review/spot check and mirror reconciliation pending; RDD off, no native review. Remote PR slicing/exception remains a later human decision; no local test coverage was omitted to meet a line heuristic.

## Task 1 fix round 1 — immutable descriptor ownership

- Parent review found P1 (validate one Proxy reflection, clone a later one) and P2 (spreading validated inputs performs new control-property Gets). Both reproduced before fix edits.
- Regression RED: focused three-file command with `--testNamePattern 'descriptor snapshot|second-read cycle|proxy control get'` exited 1, 4 failed / 35 skipped. A changing Proxy returned a function after initial validation; a bounded second-read cycle changed `{ x: 1 }` into `{ x: { x: 1 } }`; run/driver spreads exposed synthetic-secret control Get errors.
- Additional wrapper RED: compatibility `--testNamePattern 'wrapper snapshot reflection failures'` exited 1, 1 failed / 3 skipped; Standard Schema wrapper threw a coded error rather than returning issues.
- Fix: capture own data descriptors once per JSON object; preserve shared/cyclic references in a memoized owned graph; validate only the owned graph before freezing. Strict records validate owned descriptors, too. Configured request/driver return paths spread only owned data snapshots, never original inputs; schema wrapper translates coded snapshot failures to safe issues. Legacy no-control return identities remain intact.
- GREEN: regression subset 4 passed / 35 skipped; three owning files 40 tests / 3 files passed; full contracts 362 tests / 25 files passed. Contracts typecheck/lint each exited 0; fixed-array/legacy compatibility coverage stays green.
- Fix commit locator: `git log -1 --format=%H --grep='^fix(contracts): preserve descriptor-owned control snapshots$'`; exact identity follows in the ignored execution report/ledger after commit. Parent re-review and mirror reconciliation remain pending; no remote or provider operations.

## Task 1 reviewed closure

- Parent confirmed specification and implementation review clean after fix round 1. Task 1 is complete.
- Implementation: `2eb8ae1523ea19a715f0bb25925dc334552941b1`; ownership fix: `dbd92a2e8b4acf01cc997e7e22db168aa1ee965b`.
- Final Task 1 verification: contracts 362 tests / 25 files; contracts typecheck/lint exit 0. Earlier pending-review statements above are historical evidence, superseded by this closure.

## PC2 subprogress — Task 2 deterministic resolution and mapping

- [x] Implement deterministic provider/model-first resolution, controlled native-key/extension canonicalization, explicit support receipts, immutable JSON output and optional configured registry construction.
- [x] Parent independent review/spot check of Task 2: specification/implementation review clean at 587b1c441c6f5e4d578d927f436a4d3e289c6cc2; PC2 complete.
- Route: delegated bounded writer, `controls_task2`; contracts/orchestration multi-file behavior. Strict TDD true; runner Vitest; Task 2 dispatch baseline `dbd92a2e8b4acf01cc997e7e22db168aa1ee965b`.
- Initial RED: orchestration focused command 5 failed / 1 passed (missing resolver export); mapper owning contracts command 4 failed / 14 skipped (missing mapper export). Registry RED: 2 failed / 1 passed / 24 skipped (optional configured method dropped).
- Edge RED: optional-undefined omission 1 failed / 1 passed / 6 skipped; provider-schema proof invalidation plus constructed foreign contract 2 failed / 35 skipped; accessor/unknown-undefined pair 2 failed / 9 skipped; host-port/version mutation 1 failed / 11 skipped; one-shot in-place provider mutation and incompatible model/provider normalizers 2 failed / 12 skipped. Each source fix followed its observed failing test.
- Final GREEN / REFACTOR: focused resolver 14 tests; owning contracts file 18 tests; full orchestration 209 tests / 10 files; full contracts 366 tests / 25 files. Both packages' typecheck/lint exit 0. The implementation refactor exports the existing host-contract validator directly, removes a synthetic manifest detour, and reuses canonical descriptor lookups.
- Schemas may normalize initial requested values, but admitted/replayed data must be stable. Resolver-owned values and frozen configuration prevent post-model validation from silently changing support proof; configured registry consumption compares schema output without re-normalizing a replay. Missing resolver means explicit unknown support with receipt version `unresolved`, never guessed model support.
- Runtime harness: synthetic resolution-to-construction boundary with connected fetch/spawn spies, configured registry construction, and native extension mapping only. Unsupported/required-unknown/schema rejection blocks construction and I/O. No native providers, CLI execution, installs, remote operations or RDD.
- Work-unit commit: `feat(orchestration): resolve model controls without policy escalation`; exact identity: `git log -1 --format=%H --grep='^feat(orchestration): resolve model controls without policy escalation$'` (recorded after commit in the execution report/ledger).
- Rollback: revert only Task 2 resolver/mapper/registry additions, their root exports and owning tests; Task 1 data contracts and all legacy driver create paths remain. The cohesive unit exceeds the advisory 400-line heuristic; no tests were omitted or compressed. A later remote PR slice/exception is still a separate human decision.
- Existing engine warning remains: Node 24.14.1 versus workflow-store-sqlite >=24.15.0. Intermediate typecheck failures (readonly construction types and incomplete synthetic outcome typing) were corrected; no required check remains failing. All four unrelated file SHA-256 values match dispatch baseline.


## Task 2 reviewed closure

Parent confirmed Task 2 specification/implementation review clean at 587b1c441c6f5e4d578d927f436a4d3e289c6cc2. PC2 is complete; historical pending-review prose is superseded. Task 3 API controls are now in progress.


## PC3 API subprogress — Task 3 OpenAI

- [x] Implement OpenAI public configuration/effort types, named schema, frozen baseline/derived contracts, extension-only registration and controlled direct invocation.
- Route: delegated bounded writer, controls_task3; multi-file provider/exports/tests/docs. Baseline 587b1c441c6f5e4d578d927f436a4d3e289c6cc2. Strict TDD true, explicit user instruction, Vitest.
- Initial behavioral RED: 14 failures (native low remained medium; builder missing; rejection returned ok). Additional RED: manifest field 2 failures, mixed-model legacy fallback 1, registered output controls 1, schema object ordering 1, usage model 1, arbitrary extension configurationKey 1. Detailed test-first correction transparency is recorded in task-3-report.md; early unproven additions were deleted before their focused RED and implementation.
- Final focused command `pnpm --filter @brambodev/adapter-openai test test/model-controls.test.ts --testNamePattern 'controlled|control rejection'`: 20 passed. Full package test: 91 passed / 7 files; typecheck/lint/diff check exit 0.
- Primary evidence checked 2026-10-10: https://developers.openai.com/api/docs/guides/reasoning — existing reasoning.effort mapping/values retained. Model-specific availability/combination evidence remains host-owned, no universal catalog.
- Controlled behavior comes only from effective envelope; constructor instructions/conversation state and host policy stay separate. Parent confirmed no silent legacy fallback onto a new model; callers must include desired controls in resolution layers.
- Runtime harness: fake transport body/credential spies; frozen invocation input, native low/high effort/model, usage model, literal legacy body equality, schema/receipt/policy rejection before I/O. No native provider calls.
- Resolver-plus-adapter public composition proof deferred by parent to Tasks 5/7: installed adapters have no orchestration dependency and cross-package relative imports violate AD-2. No dependency/install changes or test-only resolver imitation.
- Work-unit commit locator: `git log -1 --format=%H --grep='^feat(openai): expose validated API model controls$'`. Source, tests, README and this tracker ship together; exact hash follows in local report/ledger.
- Rollback: revert only OpenAI additive schemas/contracts/registrations/invocation mapping/usage annotation, their exports/tests/README and this section. Legacy behavior/host handlers remain. Four unrelated path SHA-256 values unchanged.
- Parent independent review/spot check pending. PC3 also requires Task 4 CLI work and stays incomplete. RDD off; remote PR slicing/exception is separate and pending.


## PC3 API subprogress — Task 3 Anthropic

- [x] Implement Anthropic public configuration/effort type, named schema, frozen baseline/derived contracts, extension-only registration and controlled direct invocation.
- Route: delegated bounded writer, controls_task3; multi-file provider/exports/tests/docs. Strict TDD true, explicit user instruction, Vitest.
- Initial behavioral RED: 14 failures (native output_config.effort absent, builder missing, rejection returned ok). Additional RED: manifest field 2 failures, mixed-model legacy fallback 1, registered output controls 1, schema object ordering 1, usage model 1, manual thinking budget 1, arbitrary extension configurationKey 1. Detailed actual commands/test-first correction transparency: task-3-report.md.
- Final focused `pnpm --filter @brambodev/adapter-anthropic test test/model-controls.test.ts --testNamePattern 'controlled|control rejection'`: 20 passed. Full package test: 103 passed / 9 files; typecheck/lint/diff check exit 0.
- Primary evidence checked 2026-10-10: https://platform.claude.com/docs/en/build-with-claude/effort — output_config.effort low/medium/high/xhigh/max, model-dependent availability, not a thinking budget. https://platform.claude.com/docs/en/build-with-claude/extended-thinking — existing manual budget minimum 1024 and below invocation max_tokens (interleaved exception not exposed). No new model/mode catalog or policy grant.
- Existing adaptive/manual thinking host selection/grants remain authoritative. Controlled output ceilings are rechecked before credential/fetch; effort itself does not grant thinking. Strict native mapping rejects auth/model/tools/unknown/nested-extra destinations and occupied fields.
- Runtime harness: captured Messages bodies, original-envelope mutation after async entry, usage attribution, literal legacy body equality, adaptive-thinking plus native effort, manual-budget rejection, credential/transport spies. No paid/native/remote/install/RDD calls.
- Native registrations require omitted configurationKey and resolve through extension IDs. Parent confirmed this constraint; arbitrary custom-driver schemas remain the generic driver seam. Host capability handler needed no gratuitous edit.
- OpenAI work-unit: 3321587c6d91a7fc4b5ab743ea6257751674f61c (341 additions / 20 deletions, 361 authored changed lines). Anthropic commit locator: `git log -1 --format=%H --grep='^feat(anthropic): expose validated API model controls$'`; exact identity/counts recorded after commit in the local report/ledger. Each behavior includes tests/docs/tracker and is separately removable.
- Rollback: revert only Anthropic additive schema/contracts/registrations/invocation mapping/usage annotation, their exports/tests/README and this section. Existing thinking/remote capability handlers and legacy selection behavior remain.
- All four unrelated SHA-256 values match dispatch baseline. Existing engine warning remains: Node 24.14.1 versus workflow-store-sqlite >=24.15.0. Early setup/type/lint failures were corrected and final required checks pass.
- Parent review/spot check and feature mirror reconciliation pending. API work is implemented; PC3 stays incomplete pending CLI Task 4. Tasks 5/7 own actual resolver-to-provider public composition proof. No remote delivery; no size exception inferred.


## Task 3 review fix round 1 — shared control consumption

- Parent-authorized scope: centralize only duplicated provider-neutral schema ownership, JSON equality and effective-envelope validation; both native control schemas/maps and thinking/streaming policy remain provider-owned. Contracts supplies public `snapshotExecutionControlSchema` and `validateExecutionConfigurationForContract`; adapters depend on the contracts root, not orchestration. The consumer uses existing contract providerId/requiresModel metadata and does not invent support evidence.
- Minor coverage: both adapter owning suites now register `fixture:custom` before testing requiredSupport with an unverified receipt. Rejection asserts zero credential/transport calls; the same registration/value/receipt succeeds when support is optional, preventing an unknown-ID rejection from masking the branch. Unknown-ID coverage remains separate.
- Parent-approved pure refactor protocol: existing behavior characterization before production edits was GREEN, 21 tests/provider. No behavior defect or fabricated RED claimed. After extraction, owning contracts file 22 tests and both adapter files 21 tests passed. Shared helper tests cover callback receiver/frozen ownership, immutable admitted data, exact receipts/canonical IDs, schema issue/transform rejection and order-independent equality.
- Final package checks: `pnpm --filter @brambodev/contracts test` 370 tests / 25 files; `pnpm --filter @brambodev/adapter-openai test` 92 / 7; `pnpm --filter @brambodev/adapter-anthropic test` 104 / 9. Each package's `typecheck` and `lint` exited 0. Existing Node engine warning remains. Detailed commands/intermediate setup corrections are appended to task-3-report.md.
- Runtime harness: fake provider transport bodies and zero-I/O rejection spies, plus public contracts helper consumption. Actual resolver+adapter composition remains required in Tasks 5/7; this fix neither proves nor removes that deferred boundary. No new native fields, documentation-network research, installs, provider/native CLI, remote or RDD operations.
- Work-unit commit locator: `git log -1 --format=%H --grep='^refactor(contracts): centralize API control consumption$'`; exact hash/counts follow in ignored execution report/ledger. Rollback restores local adapter helpers and removes only these contracts helper exports/tests plus registered-support characterization and this tracker section; prior native mappings/legacy behavior stay intact.
- Parent scoped rereview pending; PC3 remains incomplete pending CLI Task 4. Four unrelated paths remain unstaged and their baseline hashes are preserved. Feature mirror reconciliation follows the commit.


## Task 3 reviewed closure / PC3 CLI subprogress — Task 4

- Parent confirmed Task 3 scoped review clean at 6294f21a561ca7229fa060c9c372969ee9b6fab3; Task 3 is complete. Historical pending-review entries above are superseded; PC3 stays incomplete until Task 4 review.
- Task 4 route: delegated bounded writer controls_task4; multiple native trait/control/engine/test files. Baseline 6294f21a561ca7229fa060c9c372969ee9b6fab3. Strict TDD true, explicit user instruction, Vitest package runner.
- Primary-evidence ruling: exact synthetic declared versions Codex 0.162.1, Claude Code 2.1.111, OpenCode 1.18.35; only verified model/reasoning/variant surfaces. Unknown versions reject rather than infer a range. Custom traits can extend contract/versions/native scope with host evidence without a core provider/model enum. Cost: future versions require explicit evidence/update; no installed CLI or synthetic model qualification claimed.
- Native schemas/contracts, per-invocation owned controls, full argv projection and version matching added without changing policy argv. Per-run executionConfiguration atomically replaces factory modelControls; raw model/config override conflicts reject only on the opt-in path. Legacy trusted extraArgs remain unchanged.
- RED: initial focused command 45 failed / 6 passed (missing typed argv/export and accepted invalid requests); factory snapshot 1 failed; raw-argv race/incomplete mapping 2 failed; Windows cmd shim safety 1 failed. Detailed exact commands/URLs/intermediate checks: .superpowers/sdd/2026-10-10-provider-capability-coverage/task-4-report.md.
- Runtime harness: literal FakeSpawner argv and zero-child rejection; direct mocked Node spawn-entry synthetic environment proof for all three controlled factories with allowlist, key blanking and both Windows PWD aliases. Legacy environment/parser/cancellation clauses remain active; FakeSpawner env is not confinement evidence.
- Final package checks and work-unit identity follow in the execution ledger/report. Existing Node engine warning only after check corrections. Live suites excluded by the package script; no native/provider/remote/install/RDD operations.
- Rollback: opt-in adapter-cli native control module/exports/options/trait metadata/tests/docs only; preserve legacy raw-host behavior and four unrelated dirty/untracked paths. Remote delivery and PR budget decisions remain separate; no coverage omitted for the advisory task line heuristic.
- Work-unit locator: git log -1 --format=%H --grep='^feat(adapter-cli): add policy-preserving typed model controls$'. Parent independent review/spot check and mirror reconciliation pending; PC3 remains incomplete.
- Task 4 final local GREEN: focused 59 tests; direct spawn environment subset 9 tests; full adapter-cli 235 passed / 5 skipped, 12 files (240 total). Typecheck/lint/diff checks exited 0. Four unrelated hashes match baseline; parent independent review remains pending.

## Task 4 review fix round 1 — direct Windows execution

- Parent-authorized P1: engine shim suffix refusal missed the real Node spawner's asynchronous Windows EINVAL fallback for bare commands. Controlled invocations now pass per-invocation `allowShellFallback:false`; the spawner snapshots it and refuses both initial shims and async cmd.exe retry. Legacy omission/replay behavior is preserved; no shell escaping or native flag/version/policy changes.
- Observed strict TDD RED: spawner direct-boundary/legacy subset 4 failed / 4 passed / 13 skipped before production edits. All three vendor bare-command async retries and initial no-shell shim failed; synchronous EINVAL and legacy fallback were existing GREEN characterizations. Owning files GREEN: 94 tests / 3 files. Exact commands and intermediate test/type correction transparency: task-4-report.md.
- Route remains delegated bounded writer controls_task4, narrow seam/spawner/engine/tests/docs. Full package/typecheck/lint results and exact commit identity recorded after final checks in the local execution ledger/report. Rollback only the additive option, controlled spawn field, spawner guard and regression tests/docs; keep original Task 4 and legacy behavior.
- Task 4 parent scoped rereview remains pending; PC3 is not checked off. No native/provider/install/remote/RDD/subagent operations. Four unrelated dirty/untracked paths untouched; remote budget decisions remain separate.
- Fix round 1 final checks: full adapter-cli 242 passed / 5 skipped, 12 files (247 total); typecheck/lint/diff check exit 0. Four unrelated SHA-256 values match baseline. Work-unit locator: `git log -1 --format=%H --grep='^fix(adapter-cli): prevent controlled Windows shell fallback$'`; exact identity/counts follow in the execution ledger/report. Parent rereview/PC3 pending; existing Node engine warning only.


## Task 4 reviewed closure

- Parent confirmed Task 4 specification/implementation review clean after the Windows no-shell fallback fix at `940e5e1bdbf339259a182433d4af746240d9cc2c`.
- Task 4 and PC3 are complete. Prior pending-review statements remain historical evidence; synthetic pinned CLI fixtures do not qualify installed/native execution.

## PC4 subprogress — Task 5 configured construction and direct runtime

- [x] Implement paired configured API/CLI factory construction, effective-envelope binding and pre-adapter mismatch rejection; runtime owns deeply frozen controls before the first async store/workspace boundary.
- Route: delegated bounded writer, controls_task5; multiple non-trivial factory/runtime and test files. Strict TDD true, current explicit user instruction; Vitest runner. No Task 6/7 implementation.
- Baseline: `940e5e1bdbf339259a182433d4af746240d9cc2c`. Initial RED: API 3 failed / 6 skipped; CLI/registry 2 failed / 4 passed / 37 skipped; runtime 2 failed / 12 skipped, including observed caller mutation from deep to mutated.
- Additional accessor RED: one failure per wrapper exposed synthetic-secret getters. Use existing public RunRequest validation rather than new generic validation. An intermediate nonexistent validator import invalidated an apparent narrow GREEN; the actual runtime harness caught it. Corrected to public validateRunRequest, added successful-dispatch guard, then reran full configured coverage. Detailed transparency and commands: task-5-report.md.
- Existing index exports already expose changed option types, and Task 2 registry already preserves/validates createConfigured; no gratuitous production edits there. Registry owning tests characterize effective ownership before asynchronous legacy schema validation.
- Actual harness: resolver -> registered custom/API factory -> configured driver -> local runtime -> captured synthetic acme RunRequest and native OpenAI/Anthropic fake transport bodies. Public root export metadata resolves workspace-only package entries; no cross-package relative source imports, resolver imitation, installs or production dependency additions. This closes the deferred Task 3 local composition proof, not packed-install or native-model qualification.
- Controls use shared contracts consumer/schema snapshot utilities. Host support receipts and policy stay separate; runtime does not invoke resolvers or add capabilities. CLI legacy adapter construction remains zero-argument. Runtime mutation barrier includes nested extension arrays; malformed/accessor controls reject before store/materialization; different bound controls reject before adapter/fetch, not before workspace materialization.
- Final focused checks: API 4 passed / 6 skipped; CLI/registry 8 passed / 37 skipped; runtime 5 passed / 12 skipped. Full checks: adapter-api 94 tests / 10 files; orchestration 213 / 10; runtime-local 25 / 2. All nine owning package test/typecheck/lint commands exit 0; diff check exit 0. Commit identity follows in the local execution ledger/report. Existing Node engine warning only; no hidden failures or omissions. Earlier runtime test typing and test-only unused-parameter lint failures were corrected before final checks.
- Work-unit locator: `git log -1 --format=%H --grep='^feat(runtime): propagate frozen execution controls through drivers$'`. Rollback: remove paired construction/binding/runtime ownership and their tests/docs; preserve legacy execution, host resolver and registry seam. Approximately 400 lines is advisory; no tests omitted, no remote PR budget exception inferred.
- Task 5 parent review/spot check and mirror reconciliation pending. PC4 remains unchecked pending Task 6 atomic durable admission/replay. Four unrelated dirty/untracked paths preserved by SHA-256 comparison. No native/provider/remote/install/RDD/subagents.

## PC4 subprogress — Task 6 atomic admission and stored replay

- [x] Implement atomic configured start admission, detached frozen engine task context, replay version/contract checks and import/configuration fingerprint preservation.
- Route: delegated bounded writer controls_task6; multiple non-trivial orchestration/coordinator files plus owning contract/fixture tests. Strict TDD true, explicit approved execution context; Vitest commands in task-6-report.md. Base fc87832b624b43a66a737bdbdb82b5069b2b2d0e; Task 5 parent review clean.
- Parent-authorized missing-interface ruling: additive synchronous trusted host worker executorVersionForTask(task) declaration. Configured executor-version entries require equal current declarations before factory/runtime construction; absence/invalid/mismatch/throw refuses safely. No-version API/legacy paths require no port. This declares compatibility, not an installed native binary qualification; never conflate manifest driver version with executor version or reevaluate model defaults/support on replay.
- Actual RED: missing admission export 7 failures; owned production SQLite replay 8 failures; configured import history 1; direct engine freeze [false,false] instead of [true,true] 1; wrong registry driver ID accepted 1. Fingerprint rollback regression 2 failures: changed controls/raw driver config returned duplicate, not conflict. No initial duplicate-specific RED claimed: initial replay filter skipped it. Detailed first attempt/fixture corrections are retained in task-6-report.md.
- Actual harness: public admission helper -> production SQLite on an owned temporary root -> controlled checkpoint -> close/reopen -> actual worker/engine -> synthetic configured factory/runtime/driver. Preserves completed checkpoint/support receipts and refuses version mismatch with zero construction; previously used resolver/default callbacks throw if replay invokes them. Deterministic file authority proves first actual create arguments/no pending command during resolution, not multiprocess SQLite behavior. Import/export/reopen conformance preserves exact effective field and configured definition identity.
- Ambient Node 24.14.1 cannot open production SQLite despite importing node:sqlite. Preexisting bundled Node 24.19.0 and cached pnpm 11.23.0 through network-disabled Corepack run the actual fixtures/gates; no install/runtime/configuration change. One overlapping-tool run timed out two unchanged-5000ms tests; retained honestly, narrow/owning/full replay reruns passed. Initial test-only lint issue fixed. No timeout/TTL/maxWorkers=2 inflation.
- Final package checks: contracts 371/25 files; coordinator 94/6; orchestration 223/11. Contracts/coordinator typecheck/lint exit 0; orchestration final check completion follows in the execution ledger/report. Source NUL-byte and diff checks exit 0; four unrelated SHA-256 baselines unchanged. No native/provider/network/install/remote/RDD/subagents.
- Rollback only additive admission/configured context/import/worker version seam and owning tests/docs; preserve underlying store schemas, policies, ownership and legacy paths. Work-unit commit locator: git log -1 --format=%H --grep='^feat(orchestration): freeze model controls at durable admission$'. Exact commit/counts follow in local report/ledger. PC4 remains unchecked pending parent review, and no remote budget/PR decision is inferred.

Task 6 final orchestration typecheck/lint both exited 0; all nine required package gates are GREEN (688 tests / 42 files). PC4 remains pending parent review. Full tracker mirror reconciliation follows this commit's handoff.

## Task 6 review fix round 1 — optional undefined normalization

- Parent-authorized P1 correction only; route remains delegated bounded writer controls_task6, strict TDD. Normalize descriptor-owned task execution layers with the existing Task 2 helper before strict whole-definition JSON validation. Registered optional undefined values are omitted; unknown/nested undefined and accessors still reject without getter calls. No worker/default/resolver reevaluation change.
- Observed RED before source edits: admission 3 failed / 3 passed / 8 unselected; production SQLite duplicate identity 1 failed / 10 unselected. Focused GREEN: admission 6 and SQLite 1. Omitted/undefined identity-equivalent inputs preserve snapshot/fingerprint; empty optional layers remain pending until resolution; SQLite returns the original duplicate receipt and stored controls replay without resolver calls.
- Final sequential supported-runtime gates: orchestration 229 passed / 11 files and coordinator 95 / 6; all six test/typecheck/lint scripts exit 0, no package skips. Intermediate typing corrections, exact focused commands, runtime identity and rollback are retained in task-6-report.md. Contracts unchanged/not rerun for this scoped fix; initial proof remains historical.
- Four unrelated SHA-256 baselines unchanged; no timeout/TTL/maxWorkers, schema, installed runtime, native/provider/network/install/remote/RDD/subagent changes. Work-unit locator: `git log -1 --format=%H --grep='^fix(orchestration): normalize task controls before admission$'`. Exact commit/counts follow in the ignored execution ledger/report. PC4 remains unchecked pending parent scoped rereview; parent reconciles the full memory mirror after handoff.

## PC4 reviewed closure / PC5 local proof — Task 7

- Parent confirmed Task 6 scoped rereview clean at `503ae65b763bf809026c268e1e8a583d81ad797e`. PC4 is complete; historical pending-review lines above remain evidence at their original time.
- Task 7 route: delegated bounded writer `controls_task7`, cross-package consumer/docs and integrated gates. Baseline `503ae65b763bf809026c268e1e8a583d81ad797e`; strict TDD remains true. No production source/export defect was found: implementation RED/GREEN is N/A for this proof/documentation unit; no synthetic failure was manufactured.
- Public typed API consumer imports contracts/API/testing roots and exercises configured acme extension mapping plus legacy construction; the original nine-create conformance count remains intact. Orchestration root consumer observes literal precedence, actual custom factory execution, the same admitted schemas/IDs and persisted run overrides. Custom CLI trait/root-export metadata proof observes native scope and no-shell/restricted-env propagation, not an OS sandbox. Earlier Task 5 fake-fetch runtime and Task 6 actual SQLite replay proof remain separate.
- Focused final checks: three orchestration public consumers passed / eight unselected; API conformance consumer 11 passed / one file; both owning typechecks exit 0. First new fixture omitted required DriverRequest.context (TS2741); corrected test-only. Fresh emitted-root declarations also compile with NodeNext and no brambo-source condition: `pnpm --filter @brambodev/adapter-api exec tsc --ignoreConfig --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 --strict --skipLibCheck test/consumer-conformance.fixture.ts` exited 0. First ad-hoc attempt needed TS7 --ignoreConfig (TS5112); retained honestly, not behavioral RED.
- All 24 sequential required package test/typecheck/lint commands exit 0 on existing bundled Node 24.19.0 + cached pnpm 11.23.0, COREPACK_ENABLE_NETWORK=0. Full test counts: contracts 371/25 files; adapter-api 95/10; OpenAI 92/7; Anthropic 104/9; CLI 242/12 plus five existing nonapplicable clause skips; orchestration 232/11; coordinator 95/6; runtime-local 25/2. Total 1,256 passed / 82 files, five skipped. No SQLite/coordinator package skips on the supported runtime. Exact commands/logs/skip clauses: `.superpowers/sdd/2026-10-10-provider-capability-coverage/task-7-report.md`.
- All eight inspected offline package builds exit 0. Supplemental read-only docs route/API/metadata/link/example checks pass; docs tests 17 passed; three README root-import fragments typecheck; source-byte/diff checks exit 0. These do not claim a full-repository build, fresh rendered site or installed consumer.
- Supplemental `pnpm docs:validate-versions` fails (exit 1): 152 existing release-snapshot byte mismatches, all CRLF/LF-only, zero other mismatches. Each snapshot matches baseline 503ae65 canonical content, and exact docs-site/validator input diff versus baseline exits 0. Complete errors and read-only byte comparison are retained in task-7 report/logs. No snapshot rewrite or validator weakening; this environmental check remains a concern for parent review.
- Packed-consumer install remains pending: the existing proof invokes npm install --offline --ignore-scripts, still outside no-install authorization. Source proof is extended but not executed. docs generation/build, full-repository checks, hosted/native/model qualification, remote/push/PR/merge and RDD are not claimed or run.
- Rollback only consumer assertions/proof label, six README changes and this tracker/current-status reconciliation. Four unrelated SHA-256 baselines are unchanged. Work-unit locator: `git log -1 --format=%H --grep='^docs: document extensible provider control coverage and limitations$'`; exact identity/counts follow in the ignored report/ledger. Parent owns full cumulative mirror reconciliation and whole-branch review. PC5 remains unchecked; local proof does not authorize delivery or a PR size exception.
## Final correction wave - verification and review boundaries

- Parent-authorized bounded correction against `06dd8dcb2e42315731fea57cf4a67911b5155f36`: all three final review findings plus the candidate cold-import/root-lint failures. Route: delegated writer; multiple non-trivial boundary files. Strict TDD remains true; no second implementation wave, native review, remote operation, install or provider execution.
- P1: the engine checks the originating pending/running start receipt's configured fingerprint against the actual definition plus stored controls before its first workflow definition/run/task mutation. A real admitted -> SQLite reopen -> first worker fixture has no pre-seeded definition event. Raw configuration drift rejects before configured construction/runtime; the direct engine fixture proves zero commits. Worker lease/receipt bookkeeping remains unchanged: an engine-level refusal is rethrown, with pending snapshot/running receipt, not fabricated blocked settlement. Legacy/import starts without the additive fingerprint retain their existing path.
- P2: both API/CLI wrappers reject supplied controls on legacy construction, including configured-capable factories constructed through `create`. Accessors are not evaluated; zero adapter dispatch is asserted. Omitted and explicit undefined controls preserve legacy success.
- P2: shared consumers accept Standard Schema successes with explicit `issues: undefined`, using the existing descriptor-owned result helper and preserving value equality. Custom CLI projection uses owned success/issue descriptors. Malformed/accessor results still reject without evaluating getters.
- Functional gate: CLI's existing asynchronous public `session/cli` composition boundary is deferred past help/version. Public exports and cold-budget assertions are unchanged. Fresh child graph: 78 modules / 1,133,333 bytes, below the existing 100 / 1,400,000 limits. No latency qualification is inferred from that proxy.
- Ignored Task 7 scratch diagnostics were renamed from `.mjs` to `.mjs.txt` inside the verified owned evidence directory, preserving their 893/1,009 bytes. No ESLint disable/global ignore or original-file cleanup.
- Observed pre-edit RED: engine first mutation (1), worker changed raw configuration (1; unchanged first execution passed), legacy API overrides (2), legacy CLI overrides (2), Standard Schema undefined issues (2), custom CLI schema (1), original cold graph gate (1; control passed). Exact commands and all setup/verification failures are in `final-fix-report.md`.
- Final parent-authorized bounded identical root replay ran after every prior owned process completed: `pnpm test`, `pnpm typecheck`, `pnpm lint` all exit 0. Tests: 3,063 package passes / 205 files, 16 existing skips / 3 skipped files, plus all 11 root no-network guard tests. Nine offline builds and emitted-root consumer declaration compilation exit 0; source-byte/diff checks pass. No deadline, TTL, worker/test setting or test ceiling changed.
- Prior attempts retained: first root tests passed but a new test-fixture-only TS2322 needed a JsonValue cast; subsequent root tests hit the unchanged CLI graph CONTROL's 5,000ms deadline at 6,187ms. That attempt's typecheck/lint passed. Parent authorized exactly one final identical replay; it passed. No timeout increase or indefinite retry.
- Supplemental docs versions remain the previously recorded 152 baseline newline-only mismatches; not rewritten or rerun in this correction. Packed install/native model/binary/site-generation qualification remain separately pending. All four original unrelated hashes match.
- Work-unit locator: `git log -1 --format=%H --grep='^fix(controls): close admission and consumer validation gaps$'`. Rollback only the six changed boundary source files, their six owning tests and this correction tracker section; leave the original feature, stored schema, leases and legacy policies intact. Exact commit/counts are recorded in the ignored report/ledger after commit. Parent owns full tracker mirror reconciliation. **PC5 remains pending the final scoped review of all confirmed findings and functional gate fixes.**
## Final reviewed closure and recoverable verification report

**Status: COMPLETE_WITH_CONCERNS.** All seven approved plan tasks and PC1–PC5 are complete. Parent final whole-feature review followed by the one scoped correction recheck closes the prior "with fixes" condition. Source HEAD is `f02f40362f95502c83ea0c6e88c1874c12f1682c`; final scoped range is `06dd8dcb2e42315731fea57cf4a67911b5155f36..f02f40362f95502c83ea0c6e88c1874c12f1682c`. Specification: all three findings ADDRESSED. Quality: PASS, no residual finding or further correction loop. Local ordinary delivery remains human-owned; no remote action or native review receipt is implied.

The reviewed engine rejects first-admission fingerprint drift before definition/run/task mutations and configured construction/runtime. Actual SQLite admission/reopen tests have no pre-seeded definition event; direct engine proof has zero commits. Normal worker lease/running-receipt bookkeeping remains unchanged. API/CLI legacy wrappers reject supplied effective controls with zero adapter dispatch; omitted/explicit undefined stays compatible. Descriptor-owned Standard Schema success accepts `issues: undefined` while malformed/accessor results remain safe. Cold composition is deferred at the existing async public session/cli boundary without changing exports, test budgets or policy. Owned scratch evidence remains preserved as `.mjs.txt`, not deleted or lint-exempted.

### Final verification of the unchanged source candidate

This documentation closure did not rerun or change any source, tests, deadline, TTL, runner or configuration. Retained exact command results were read back before documenting completion. Existing bundled Node **24.19.0**, cached pnpm **11.23.0**, `COREPACK_ENABLE_NETWORK=0` were used sequentially; no install/download.

| Command | Final observed result |
|---|---|
| `pnpm test` | Exit 0, 317.3820704s; **3,063 package tests passed / 205 files**, 16 existing skips / 3 skipped files; 28 package summaries. The root `node --test scripts/live-api-guard.test.mjs` actually ran: **11 passed, 0 failed, 0 skipped**. Fake credentials and network-blocking preload only, not live provider qualification. |
| `pnpm typecheck` | Exit 0, 36.2010578s; full recursive typecheck including docs-site. |
| `pnpm lint` | Exit 0, 20.8831559s; root `eslint .`, unchanged ignore/configuration. |
| `pnpm --filter @brambodev/<package> build` | Nine sequential exit-0 offline builds: contracts, adapter-cli, orchestration, workflow-coordinator, runtime-local, adapter-api, adapter-openai, adapter-anthropic, cli. Existing clean-dist targets were checked inside the workspace/package before cleanup. |
| `pnpm --filter @brambodev/adapter-api exec tsc --ignoreConfig --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 --strict --skipLibCheck test/consumer-conformance.fixture.ts` | Exit 0 against emitted public declarations, no source condition; not packed-installed proof. |
| `node --conditions=brambo-source packages/cli/test/module-graph.child.mjs <file-URL of packages/cli/src/index.ts>` | 78 modules / 1,133,333 bytes; unchanged ceilings 100 / 1,400,000. Before correction 102 / 1,433,808; baseline 100 / 1,395,609. Graph proxy is not 300ms wall-clock qualification. |
| `node scripts/check-source-bytes.mjs`; `git diff --check` | Exit 0 on the corrected source candidate. Closure uses documentation diff/staged checks and structural readback only. |

Strict TDD RED preceded every actual correction: engine sentinel 1 failure; worker drift 1 failure with unchanged case passing; legacy API and CLI overrides 2 each; Standard Schema explicit undefined issues 2; custom CLI schema 1; original cold gate 1 with CONTROL passing. Focused GREEN covered engine/CLI 33, API 12, contracts 24, custom CLI 60, worker 13, CLI graph/run 49; expanded characterizations are included in the final root result. Pure extraction and documentation units do not claim manufactured RED.

Failures remain visible: first root test passed but typecheck found new fixture-only TS2322, corrected by JsonValue cast; later identical root test hit the unchanged graph CONTROL 5,000ms deadline at 6,187ms while the actual graph budget passed. Its typecheck/lint passed and guard short-circuited. Parent authorized exactly one identical sequential bounded replay after all owned processes ended; that final replay passed. No performance-related test weakening or further retry. Existing skips: CLI 5, sandbox-local 7, projection 4; three sandbox files wholly skipped.

**Supplemental `pnpm docs:validate-versions`: historical exit 1, 152 baseline release snapshots differ only by CRLF/LF; zero other mismatches. All 152 canonical comparisons and exact validator/docs input comparison match the prior baseline. NOT PASS, not rerun or rewritten in the correction/closure.** Packed consumer install remains outside no-install authorization. Native binary/API/CLI/model acceptance, rendered-site generation/build, remote deployment, multi-host and wall-clock startup qualification remain explicitly unqualified. No push, PR, merge, worktree/branch deletion or size exception authorized.

Detailed ignored evidence remains under `.superpowers/sdd/2026-10-10-provider-capability-coverage/`: task-1 through task-7 reports, final-review.md, final-scoped-review.md, final-fix-report.md, final-fix-bounded-root-{test,typecheck,lint}.txt, final-fix-bounded-root-gates.json, final-fix-builds.json, final-fix-consumer-declarations.txt and final-fix-cold-graph.json. This tracked section preserves the substantive final proof if ignored evidence is later cleaned. Four original unrelated paths remain unchanged by SHA-256. Preserve the worktree and all plan-owned evidence until the parent delivery choice.

### Exact work-unit commit boundaries

Design: `789476b74ee0b4975cb9d4ca801659431404a6be`. Approved plan/execution baseline: `b34e17f66e43e3e55edeb775b60e0bbd7bea9785` (plan documentation commit). The seven tasks produced **13 implementation/proof/correction feature commits: 12 source-changing commits and one Task 7 consumer/docs proof commit**, in the following chronological order. Final documentation closure is a separate tracker-only commit, located with `git log -1 --format=%H --grep='^docs: close provider capability coverage verification$'`; it does not change the reviewed source candidate.

```text
2eb8ae1523ea19a715f0bb25925dc334552941b1 feat(contracts): add extensible execution control contracts
dbd92a2e8b4acf01cc997e7e22db168aa1ee965b fix(contracts): preserve descriptor-owned control snapshots
587b1c441c6f5e4d578d927f436a4d3e289c6cc2 feat(orchestration): resolve model controls without policy escalation
3321587c6d91a7fc4b5ab743ea6257751674f61c feat(openai): expose validated API model controls
ba193aa40a47d9099a977cef4277c0c4ffe5284b feat(anthropic): expose validated API model controls
6294f21a561ca7229fa060c9c372969ee9b6fab3 refactor(contracts): centralize API control consumption
4dec041b92fdfb7e97cd3882b2d27f16c3357f2d feat(adapter-cli): add policy-preserving typed model controls
940e5e1bdbf339259a182433d4af746240d9cc2c fix(adapter-cli): prevent controlled Windows shell fallback
fc87832b624b43a66a737bdbdb82b5069b2b2d0e feat(runtime): propagate frozen execution controls through drivers
a5fe2827df56216bd9e6f149635296fc04f76d57 feat(orchestration): freeze model controls at durable admission
503ae65b763bf809026c268e1e8a583d81ad797e fix(orchestration): normalize task controls before admission
06dd8dcb2e42315731fea57cf4a67911b5155f36 docs: document extensible provider control coverage and limitations
f02f40362f95502c83ea0c6e88c1874c12f1682c fix(controls): close admission and consumer validation gaps
```

Task boundaries: Task 1 = first two commits; Task 2 = third; Task 3 = OpenAI, Anthropic and shared extraction; Task 4 = typed CLI plus Windows fallback fix; Task 5 = runtime propagation; Task 6 = durable admission plus normalization correction; Task 7 = consumer/docs proof. Final `f02f403` is the one whole-feature correction wave. Reviewed correction authored changes: 186 additions + 25 deletions = 211 lines, 13 tracked paths.

### Preserved ruling register — verbatim, ledger order

All six literal `Ruling:` entries are retained below without reordering, shortening or removing their reason/cost clauses. Other parent contextual rulings remain in the original task sections and are retained after this register.

Ruling: add mapper behavioral RED in contracts test file and run its focused command before mapper implementation, as Step 4 already requires contracts focused test — owning package determines RED — cost if wrong: additional focused test invocation.

Ruling: missing evidence keeps that control rejected and PC3 partial, as explicit plan/spec boundary requires; never invent support — cost if wrong: later mapping follow-up.

Ruling: reject unsupported surfaces and report PC3 partial rather than guess flags, per binding spec — cost if wrong: later evidence-backed mapping work.

Ruling: Human approval supplied by parent supersedes historical plan/spec/tracker approval-pending prose; approved technical requirements remain unchanged — current explicit authorization controls execution — cost if wrong: stop dependent execution and reconcile authorization.

Ruling: This is Superpowers Subagent-driven execution bookkeeping, not an SDD/OpenSpec lifecycle selection; workspace script name does not create SDD authority — explicit selected route is Subagent-driven direct work — cost if wrong: naming confusion, not source mutation.

Ruling: parent accepted evidence-pinned synthetic Codex 0.162.1 / Claude Code 2.1.111 / OpenCode 1.18.35 and conservative native surface schemas. Unknown versions reject; custom host trait/version extension remains possible without a closed provider switch. Reason: no guessed compatibility; cost: future versions need explicit evidence/update. These fixtures are not installed CLI qualification or model support evidence.

- Parent rulings: controlled model/behavior comes exclusively from effective envelope; constructor prompt/conversation state and policy remain separate. Native registrations are extension-only, omit configurationKey. Cost: opt-in callers include desired controls in resolved layers; custom drivers retain arbitrary owning schemas.

- Parent-authorized missing-interface ruling: additive synchronous trusted host worker executorVersionForTask(task) declaration. Configured executor-version entries require equal current declarations before factory/runtime construction; absence/invalid/mismatch/throw refuses safely. No-version API/legacy paths require no port. This declares compatibility, not an installed native binary qualification; never conflate manifest driver version with executor version or reevaluate model defaults/support on replay.
Closure route: delegated documentation/bookkeeping only. Tests/runtime harness N/A for this closure because no behavior changed; prior source verification remains bound to f02f403. Rollback this closure removes only the current-status reconciliation and final recovery section in this tracker, not reviewed source/tests, original historical rulings or unrelated work. Structural readback, ruling equality/order, exact staged path, unchanged source HEAD and four unrelated hashes are the closure checks. Full tracker Engram mirror/readback is required under project brambo, topic odd/provider-capability-coverage/tasks, capture_prompt false, no invented session identity.
## Delivery verification — protected stacked-to-main chain

This later delivery evidence supplements, rather than rewrites, the historical local proof above. PC5 remains closed for that original proof; this section records independently reviewed remote delivery of the same technical outcome.

| Slice / PR | Protected merge commit | Final changed lines |
|---|---|---:|
| 1 Planning / #60 | `6659ff411502ad153a2694d302b9370e9595348f` | 379 |
| 2 Contracts / #61 | `2ab9337af88d9e8fe376c82ceb384499de04a6d2` | 864 |
| 3 OpenAI / #62 | `ecd2bcbf28e80baa0a46f2db68b9a800ca5fe69f` | 329 |
| 4 Anthropic / #63 | `ddaaa0f40b751eec5c420502e6f38aa95c7185f6` | 346 |
| 5 CLI / #64 | `acbeca41a2b9c3eae8d6310158ff593f40cb2c7e` | 592 |
| 6 API / #65 | `ddc8d56c87c88600cf92ddbe7f0d7bdb92ec83d3` | 329 |
| 7 Integration / #66 | `f4dac493023f10be8f132ca98f1c229b35195ad4` | 1627 |
| 8 This evidence PR | Pending independent review, required CI and protected merge | Measured in PR |

Each merged PR received independent review and final applicable CI SUCCESS, including frozen installation, source checks, build, packed consumer-install proof and coordinator platform checks. Unlike the historical unclaimed local packaging report, remote CI now establishes packed installation proof for these exact delivered boundaries; it does not establish installed/native CLI or live provider/model qualification.

Maintainer-authorized cohesive size exceptions covered contracts864, CLI592 and integration1627. The 31-line CLI lazy-composition dependency moved into contracts to preserve the existing cold-entry budget; no test thresholds were weakened. Four adapter README pending-integration qualifications were restored to final-source prose with the actual resolver/admission/runtime interfaces in #66.

Owning bundled-consumer baselines were deliberately corrected to contracts143, OpenAI12, Anthropic13, CLI23 and orchestration18. Exact table equality, bundler controls and all other package rows remain unchanged; these are explicit corrections to the frozen source's stale expected counts, not relaxed assertions.

Earlier Windows cross-user-continuation stale-lease and SQLite EPIPE failures remain logged in review/CI history. Final applicable checks passed after bounded subsequent verification; no source-fix or harmlessness claim is made for those transient observations. The historical local 152 CRLF/LF supplemental snapshot failures remain disclosed, while remote LF documentation builds passed. No new native/provider qualification is inferred.

Before this evidence write, source parity against `48820e34519b6b74647ee40c25e3ce2dbdbbb75e` confirmed no missing implementation modules or adapter README differences. Remaining differences were only this evidence tracker, intentional bundled-consumer baselines, and preserved upstream workflow/pnpm-lock changes. Original source worktree dirty paths remained untouched; no local dependency install, publication, policy grant or protection bypass was introduced by delivery.