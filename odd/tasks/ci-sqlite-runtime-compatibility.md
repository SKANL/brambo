# CI SQLite runtime compatibility

## Objective and authorization
Fix the pre-existing Node 22 CI/runtime mismatch without dropping tests, raising package floors, changing protections, or bypassing checks. The user authorized push, a focused PR, independent review, and protected merge after all checks pass.

## Root cause and scope
The CI gates call the full source suite on Node 22, while workflow-store-sqlite deliberately rejects Node <24.15.0. Its persistence tests and SQLite-backed coordinator tests cannot succeed there. Keep Node 22 coverage of runtime-independent behavior and real unsupported-runtime rejection; qualify every SQLite-backed test on supported runtimes. Retain packed consumer floors unchanged.

## Workflow
- Route: delegated direct; multi-file CI/runner/test work assigned to one writer.
- TDD: strict, explicitly requested by user. Runner: node --test scripts/ci-runtime-check.test.mjs, then pnpm check.
- Delivery: one focused PR, forecast below 400 authored changed lines; no size exception.
- RDD: off; do not enable.
- Artifacts: English; no credentials, AI attribution, or generated distributions.

## Tasks
- [x] CI-1: Add failing regression tests, implement capability-aware source checks, and preserve all suites on supported lanes. Prove RED then GREEN.
- [x] CI-2: Run full checks, build and actual packed consumer proof; verify Node 22 and supported-runtime execution. Normalize and commit the coherent fix.
- [ ] CI-3: Push, create/attach focused PR, and wait all applicable checks. Independent parent review and merge remain pending.

## Acceptance and rollback
All existing tests remain in unmodified full pnpm check on supported runtimes. Node 22 runs all compatible package tests, coordinator runtime-independent tests, and actual workflow SQLite refusal. The full runtime matrix runs on PRs before merge; consumer-floor matrix remains unchanged. Rollback removes only the CI runner/tests/workflow integration and this evidence document.

## Evidence and next step
Baseline main run 38127745975 and pre-feature run 38103865806 fail Node 22 persistence suites with BRAMBO_WORKFLOW_STORE_UNAVAILABLE. Production floor is declared and enforced >=24.15.0. Next: push the verified work unit, create the PR, and await the complete CI matrix and independent review.

CI-1 evidence: RED node --test scripts/ci-runtime-check.test.mjs: 0 pass, 2 assertion failures (missing capability runner), exit 1. GREEN same command: 2 pass, zero failures/skips, exit 0. Runtime floors and full-suite routing are unchanged production contracts. Matrix expands PR coverage to gates/build-pack/consumer-floor before merge.

## Functional verification
- Strict RED: capability runner absent -> 2 assertion failures, exit 1. GREEN -> 2/2, exit 0.
- Workflow regression RED against original workflow -> 9 pass/2 fail. GREEN updated policy -> 11/11.
- Full `pnpm check` with Node 26.8.1 lifecycle runtime -> exit 0: 3064 package tests plus 13 root tests; 16 unchanged platform/capability skips (adapter-cli 5, sandbox-local 7, projection 4). SQLite 29/29 and coordinator 98/98.
- `node scripts/ci-runtime-check.mjs` on Node 22.18.0 -> exit 0: 3012 package tests plus 13 root tests and actual unavailable-SQLite contract. Coordinator 75/75. The 52 SQLite-backed tests deferred from this lane all passed in the supported lane above. No new skips.
- Full `pnpm build` -> exit 0, including English/Spanish docs and every package.
- Actual `pnpm proof:consumer-install` -> exit 0: API 1/1; session 14 passed/1 existing platform skip.
- `git diff --check` and ESLint -> exit 0. No mutating normalizer is configured or needed.
- Windows shell used isolated PATH prefixes, not a global Node change. `pnpm exec node -v` confirmed lifecycle Node 26.8.1 /22.18.0. The global pnpm CLI shim itself remains on Node 24.14.1 and emits an expected optional-package engine warning.
- Existing main protection readback: `required`, strict=true, enforce_admins=true; unchanged. No provider calls, credentials, protection changes, deadlines, or test bodies modified.
- CI-1/CI-2 form one coherent rollback/work-unit: runner, regression policy, workflow and explanatory docs. CI-3 remains a delivery handoff until all remote checks pass.