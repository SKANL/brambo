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
- [x] CI-3: Created/attached PR #68, completed independent review and all applicable checks, then protected merge as `b57f245ff60f80933ec06bc68f5eae5c2ec1c864`.

## Acceptance and rollback
All existing tests remain in unmodified full pnpm check on supported runtimes. Node 22 runs all compatible package tests, coordinator runtime-independent tests, and actual workflow SQLite refusal. The full runtime matrix runs on PRs before merge; consumer-floor matrix remains unchanged. Rollback removes only the CI runner/tests/workflow integration and this evidence document.

## Historical implementation evidence
Baseline main run 38127745975 and pre-feature run 38103865806 fail Node 22 persistence suites with BRAMBO_WORKFLOW_STORE_UNAVAILABLE. Production floor is declared and enforced >=24.15.0. Next: push the verified work unit, create the PR, and await the complete CI matrix and independent review.

CI-1 evidence: RED node --test scripts/ci-runtime-check.test.mjs: 0 pass, 2 assertion failures (missing capability runner), exit 1. GREEN same command: 2 pass, zero failures/skips, exit 0. Runtime floors and full-suite routing are unchanged production contracts. Matrix expands PR coverage to gates/build-pack/consumer-floor before merge.

## Functional verification — preserved implementation results
- Strict RED: capability runner absent -> 2 assertion failures, exit 1. GREEN -> 2/2, exit 0.
- Workflow regression RED against original workflow -> 9 pass/2 fail. GREEN updated policy -> 11/11.
- Full `pnpm check` with Node 26.8.1 lifecycle runtime -> exit 0: 3064 package tests plus 13 root tests; 16 unchanged platform/capability skips (adapter-cli 5, sandbox-local 7, projection 4). SQLite 29/29 and coordinator 98/98.
- `node scripts/ci-runtime-check.mjs` on Node 22.18.0 -> exit 0: 3012 package tests plus 13 root tests and actual unavailable-SQLite contract. Coordinator 75/75. The 52 SQLite-backed tests deferred from this lane all passed in the supported lane above. No new skips.
- Full `pnpm build` -> exit 0, including English/Spanish docs and every package.
- Actual `pnpm proof:consumer-install` -> exit 0: API 1/1; session 14 passed/1 inactive opt-out-reporting sentinel (BRAMBO_CONSUMER_INSTALL=0 was not used; the actual proof executed).
- `git diff --check` and ESLint -> exit 0. No mutating normalizer is configured or needed.
- Windows shell used isolated PATH prefixes, not a global Node change. `pnpm exec node -v` confirmed lifecycle Node 26.8.1 /22.18.0. The global pnpm CLI shim itself remains on Node 24.14.1 and emits an expected optional-package engine warning.
- Existing main protection readback: `required`, strict=true, enforce_admins=true; unchanged. No provider calls, credentials, protection changes, deadlines, or SDK behavior tests modified. The CI policy test explicitly includes the new floor and PR qualification.
- CI-1/CI-2 form one coherent rollback/work-unit: runner, regression policy, workflow and explanatory docs. CI-3 remains a delivery handoff until all remote checks pass.
Implementation work-unit commit: 4cdf27b5a316fb69563c43787e850229eb5e5c8c (CI-1 and CI-2). Source verification above preceded this commit. Delivery scope: one PR, 177 authored changed lines before this evidence update, no size exception. Parent independent review/merge pending.

## Current closure and remote qualification

All CI-1–CI-3 tasks are complete. [PR #68](https://github.com/SKANL/brambo/pull/68) passed 17 checks and independent review before normal protected merge to main `b57f245ff60f80933ec06bc68f5eae5c2ec1c864`. No source suite, package runtime floor or protection was weakened. Earlier pending-delivery prose above is historical, superseded by this closure.

Post-merge [CI 38168786210](https://github.com/SKANL/brambo/actions/runs/38168786210), [documentation build/deploy 38168786201](https://github.com/SKANL/brambo/actions/runs/38168786201), [security 38168786178](https://github.com/SKANL/brambo/actions/runs/38168786178), and [Changesets 38168786156](https://github.com/SKANL/brambo/actions/runs/38168786156) all succeeded. Main checks total 16 successes and two legitimate PR-only skips (`required`, `dependency-review`); these skips are not test proof.

Node 22/22.18 runs runtime-independent suites and actual unsupported-SQLite rejection. The 52 SQLite-backed tests (29 store and 23 coordinator) run fully on supported 24.15.0/24/26 lanes. Existing 16 platform/capability skips are unchanged and disclosed. Consumer-floor 20/22.13.0/22.18.0/24 and actual packed-install checks passed. This qualifies the recorded CI/runtime matrix, not live providers, arbitrary model versions, universal deployment parity or npm publication.

Documentation closure: delegated passive documentation-only reconciliation shared with `odd/tasks/provider-capability-coverage.md`; structural readback and diff checks, no new functional execution claimed. Local work-unit locator: `git log -1 --format=%H --grep='^docs: reconcile provider controls and CI closure$'`. No new remote delivery authorized. Next step: none for implementation/CI; this local documentation commit remains unpublished until separately authorized.
