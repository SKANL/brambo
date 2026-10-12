# SQLite worker shutdown

## Objective and authorized scope
Diagnose and fix intermittent EPIPE in SQLite multiprocess testing with strict TDD. Deliver one focused PR, independent review and protected merge; never republish npm, modify versions/tags or bypass protections.

## Problem and classification
Historical main CI run 38195757122 (Node 24.15) failed at closeWorker's unchecked IPC send during finally. Investigate teardown masking the worker's original error; do not assume an SDK storage defect. Retain typed busy errors and all ownership/fencing assertions.

## Constraints and route
Strict TDD is explicitly required by the user: observed RED -> GREEN -> REFACTOR. Delegated direct writer owns investigation and test harness changes (4+ files required). No deadline, lease TTL or SDK busy-timeout changes. Parent approved an explicit test-host command policy: only typed BUSY permits at most three unchanged operation attempts with fixed 100/200ms backoff; never rerun failed tests. Initial forecast: 250-350 authored changed lines; measure the coherent final slice before push and report any repository size-gate exception needed. Parent owns independent review and merge.

## Tasks
- [x] T1: Trace IPC lifecycle and retain historical failure evidence; identify deterministic reproductions.
- [x] T2: Observe failing shutdown regressions before behavior changes; fix only the demonstrated lifecycle defect while retaining original operation errors.
- [x] T3: Run focused regressions, complete SQLite suite, fixed 10-case stress schedule, full pnpm check, build and packed consumer proof.
- [ ] T4: Commit, push and create focused PR; independent review and every applicable remote check before protected merge.
- [x] T5: Diagnose primary SQLite busy with phase/code/expected-message visible in ordinary CI errors and controlled real database locks before changing host scheduling or retry policy.
- [x] T6: Prove explicit bounded test-host BUSY recovery, exhaustion and immediate unrelated-error propagation while preserving unchanged commands and exact admission exclusion.

## Applicable checks and acceptance
Use pinned pnpm 11.23.0 on supported Node >=24.15. Exact runners: pnpm --filter @brambodev/workflow-store-sqlite test; pnpm check; pnpm build; pnpm proof:consumer-install. Deterministic cases must exercise IPC send failure, already exited/signaled child, lifecycle listeners and preservation of original worker/store failures. A broken IPC pipe during expected teardown must not mask an actual worker failure. Existing admission exclusion and backend conformance assertions remain unchanged. No skipped tests added or tests removed. Any unrelated required failure is disclosed and investigated, not blindly retried.

## Progress and evidence
- Base: origin/main 262f08adabe62422e39566707e9b55a88e8a64e2.
- Historical evidence: ignored .scratch/release-preparation/closure-postmerge-ci-failed.log.
- Investigation found unchecked child.send and events.once(exit) error rejection in finally; regression and fix phases are recorded below.
- Next: independent final-head review and every fresh remote check before protected merge.
## Root cause and observed TDD
- Test harness defect: unchecked child.send during finally emitted EPIPE; events.once(exit) rejected it and replaced a primary operation error. exitCode-only failed to recognize signal-terminated peers.
- Mechanical extraction preserved the original closeWorker behavior before regression execution. RED: 3 failing and 2 passing deterministic tests (red-primary.log); observed EPIPE, masked original storage error, and waiting after signal exit.
- GREEN: 34 SQLite tests passed; after typed fixture cleanup and two real child-process cases, 36 tests passed, typecheck passed (refactor-sqlite.log).
- Fix is test-only: subscribe before sending, callback-classify only EPIPE/closed-channel teardown races and still wait for exit, recognize signalCode, reject unrelated process errors. No SDK exports, production bytes, timeout or lease behavior changed.
- Fixed stress forecast: 10 complete multiprocess runs, stop/report on the first failure; not retry-until-green.

## Historical EPIPE-only verification
- Node 24.19.0 / pnpm 11.23.0: pnpm check exited 0; 3075 Vitest tests passed, 16 pre-existing skips (5 adapter-cli, 7 sandbox-local, 4 projection); 43 Node guard tests passed, none skipped. No skip/exclusion was added. Typecheck and ESLint passed.
- Fixed stress schedule: all 10 independent multiprocess runs passed; no rerun of a failed case.
- pnpm build exited 0 (all packages plus English/Spanish documentation). pnpm proof:consumer-install exited 0: adapter-api 1 passed; session 14 passed, 1 pre-existing Windows platform skip. All source assertions and export count checks remain unchanged.
- The historical primary worker failure was hidden by EPIPE; its exact cause cannot be recovered from that old stack. Typed storage busy remains a legitimate separate failure and is not translated into success.
- Rollback boundary: revert the test-only worker lifecycle, diagnostics, host policy and their regressions; all SDK/runtime bytes remain unchanged.

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
- Diagnostic stage is complete; the subsequently approved bounded host policy and local verification are complete below. Fresh remote delivery checks remain pending.
- Parent subsequently approved T6: test-only three-attempt typed BUSY policy with fixed 100/200ms backoff. Diagnostic fixtures keep retries disabled by default. Tests must release a real held lock on observed retry, preserve the final original error on exhaustion, never retry unrelated errors, and retain exact acquired/contended outcomes. This is a documented host command policy, not blind test rerunning or an SDK behavior change.

## Final host-policy verification
- Diagnostic work-unit commit: 1c35697278d2d48a2999b10cea78c2b887c2433d; host-policy work-unit commit: 687cc475c5a52094ab4a51e7dee749d661c6f559. Policy RED: 2 locked-claim cases failed/1 unrelated-error case passed; both worker open/claim recovery cases failed before opt-in integration. Visible-message RED: both phase cases failed before adding phase/code/expected-message context while retaining the original message. Final GREEN: all 43 SQLite tests passed; final pnpm check passed 3082 Vitest tests, 16 unchanged skips, 43 Node guards, typecheck and lint.
- Fixed post-policy stress: 10/10 complete multiprocess runs passed; no case failed or was rerun. Held-lock cases independently prove open and claim BUSY; the historical CI failure phase remains unknown. Exhaustion propagates the final original typed error after exactly three unchanged attempts; unrelated errors fail on the first attempt. Exact acquired/contended admission assertion remains unchanged.
- Build passed all packages and English/Spanish docs; packed adapter-api consumer passed 1 test and session passed 14 with 1 pre-existing Windows skip. These built/installed production bytes are unchanged by the final test-only diagnostic message correction. No SDK API, package version, busy-timeout, lease TTL, test deadline or workflow changed; no npm publication occurred.
