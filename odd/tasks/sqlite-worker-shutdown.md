# SQLite worker shutdown

## Objective and authorized scope
Diagnose and fix intermittent EPIPE in SQLite multiprocess testing with strict TDD. Deliver one focused PR, independent review and protected merge; never republish npm, modify versions/tags or bypass protections.

## Problem and classification
Historical main CI run 38195757122 (Node 24.15) failed at closeWorker's unchecked IPC send during finally. Investigate teardown masking the worker's original error; do not assume an SDK storage defect. Retain typed busy errors and all ownership/fencing assertions.

## Constraints and route
Strict TDD is explicitly required by the user: observed RED -> GREEN -> REFACTOR. Delegated direct writer owns investigation and test harness changes (4+ files required). No deadline, lease TTL, busy-timeout or retry changes. Rough forecast: 250-350 authored changed lines, one coherent PR. Delivery: single PR below repository size gate; parent owns independent review and merge.

## Tasks
- [x] T1: Trace IPC lifecycle and retain historical failure evidence; identify deterministic reproductions.
- [x] T2: Observe failing shutdown regressions before behavior changes; fix only the demonstrated lifecycle defect while retaining original operation errors.
- [ ] T3: Run focused regressions, complete SQLite suite, fixed 10-case stress schedule, full pnpm check, build and packed consumer proof.
- [ ] T4: Commit, push and create focused PR; independent review and every applicable remote check before protected merge.
- [ ] T5: Diagnose primary SQLite busy with phase-preserving worker failures and controlled real database locks before changing host scheduling or retry policy.

## Applicable checks and acceptance
Use pinned pnpm 11.23.0 on supported Node >=24.15. Exact runners: pnpm --filter @brambodev/workflow-store-sqlite test; pnpm check; pnpm build; pnpm proof:consumer-install. Deterministic cases must exercise IPC send failure, already exited/signaled child, lifecycle listeners and preservation of original worker/store failures. A broken IPC pipe during expected teardown must not mask an actual worker failure. Existing admission exclusion and backend conformance assertions remain unchanged. No skipped tests added or tests removed. Any unrelated required failure is disclosed and investigated, not blindly retried.

## Progress and evidence
- Base: origin/main 262f08adabe62422e39566707e9b55a88e8a64e2.
- Historical evidence: ignored .scratch/release-preparation/closure-postmerge-ci-failed.log.
- Investigation found unchecked child.send and events.once(exit) error rejection in finally; regression and fix phases are recorded below.
- Next: complete build/packed-consumer checks, commit and deliver for independent review.
## Root cause and observed TDD
- Test harness defect: unchecked child.send during finally emitted EPIPE; events.once(exit) rejected it and replaced a primary operation error. exitCode-only failed to recognize signal-terminated peers.
- Mechanical extraction preserved the original closeWorker behavior before regression execution. RED: 3 failing and 2 passing deterministic tests (red-primary.log); observed EPIPE, masked original storage error, and waiting after signal exit.
- GREEN: 34 SQLite tests passed; after typed fixture cleanup and two real child-process cases, 36 tests passed, typecheck passed (refactor-sqlite.log).
- Fix is test-only: subscribe before sending, callback-classify only EPIPE/closed-channel teardown races and still wait for exit, recognize signalCode, reject unrelated process errors. No SDK exports, production bytes, timeout or lease behavior changed.
- Fixed stress forecast: 10 complete multiprocess runs, stop/report on the first failure; not retry-until-green.

## Full verification
- Node 24.19.0 / pnpm 11.23.0: pnpm check exited 0; 3075 Vitest tests passed, 16 pre-existing skips (5 adapter-cli, 7 sandbox-local, 4 projection); 43 Node guard tests passed, none skipped. No skip/exclusion was added. Typecheck and ESLint passed.
- Fixed stress schedule: all 10 independent multiprocess runs passed; no rerun of a failed case.
- pnpm build exited 0 (all packages plus English/Spanish documentation). pnpm proof:consumer-install exited 0: adapter-api 1 passed; session 14 passed, 1 pre-existing Windows platform skip. All source assertions and export count checks remain unchanged.
- The historical primary worker failure was hidden by EPIPE; its exact cause cannot be recovered from that old stack. Typed storage busy remains a legitimate separate failure and is not translated into success.
- Rollback boundary: restore the original multiprocess closeWorker helper and remove its test-only lifecycle utility/regressions; all SDK/runtime bytes remain unchanged.

## Work-unit commit and delivery
- T1/T2/T3 evidence is carried by functional commit c7b8ef019234c4e4955660da9c49ecb3aea39929 (fix(sqlite-tests): handle worker shutdown IPC races).
- No consumer-visible change, so no changeset is required by CONTRIBUTING.md. All package versions stay 0.5.0.
- Delivery remains pending independent PR review and all fresh remote checks. Do not merge with a failing or unknown check; no npm publication is authorized.

## Reopened primary-failure investigation
- EOF-only normalization e382eeacdc732640cc9a43f6861540e32957acb4 passed committed-range diff check and 8 focused tests. Fresh CI38199943566 attempt1 failed only Node24: multiprocess test reported primary SQLite storage busy, not EPIPE (35 passed/1 failed). Other15PRchecks passed. No rerun or merge.
- T3 is reopened for full verification after the new diagnostic/host-fixture work. Earlier completed TDD/verification evidence remains historical and unchanged.
- SDK README documents BEGIN IMMEDIATE with 100ms bounded contention and typed BRAMBO_WORKFLOW_STORE_BUSY; hosts decide whether to retry unchanged commands. Both opening/schema validation and lease claim use this transaction primitive.
- The old message-only IPC failure cannot identify which phase failed. Parent accepted bounded diagnostic writes: real database lock held throughout open vs claim, phase/code/bounded stack carried to parent errors. No SDK mutation, timeout/TTL increase, arbitrary-error retry or outcome relaxation is authorized. Report diagnostics before proposing any bounded host policy.
- Diagnostic RED: two actual held-write-lock cases failed only because the parent error lost phase, typed code and expected-message context (diagnostic-red.log). GREEN: all 38 SQLite tests passed, no skips; typecheck and diff check passed (diagnostic-green.log).
- Worker errors now preserve operation phase, typed code and a bounded 2048-character worker stack; parent errors retain expected ready/result message. Controlled locks independently reproduced documented BUSY during both schema validation/open and claim, without sleeps or timeout changes. These cases cannot retroactively identify the phase of the historical CI failure.
- Diagnostic stage is complete; bounded host contention policy remains a proposal pending parent authorization. Full root checks and fresh remote delivery checks remain pending after the complete fix.
