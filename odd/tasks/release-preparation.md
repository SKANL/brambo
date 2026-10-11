# Release preparation

## Objective and authority
Prepare the 0.5.0 fixed-package release candidate for review and publication, without publishing, merging the release PR, pushing, creating tags, dispatching workflows, or probing credentials.

## Constraints
Strict TDD enabled by explicit user instruction. Runner: pnpm --filter @brambodev/contracts exec vitest run test/versions.test.ts; full gate pnpm check, pnpm build, pnpm proof:consumer-install. Preserve all 28 fixed package versions, engines and workspace dependency policy. English artifacts. RDD remains off.

## Tasks
- [x] R1: Replace pending-only release-note assertion with validated pending/consumed lifecycle proof (delegated; reading and tests across release artifacts). RED on actual consumed release candidate; GREEN on pending and generated candidate. Rollback: release-note lifecycle tests only.
- [x] R2: Add truthful provider controls changeset, root consumer release notes and accurate release workflow documentation (delegated; multi-file preparation). Validate generated Changesets candidate versions and changelogs. Rollback: these release notes only.
- [x] R3: Run full source/build/packed-consumer and generated-candidate verification; record exact results and independent-review handoff. No publication claim.

## Delivery
Local conventional work-unit commits only; remote delivery awaits explicit authorization. Forecast approximately 200 authored changed lines; no inherited size exceptions. Generated candidate manifests/changelogs are verification-only, never committed to preparation branch.

## Progress
Initial exploration completed: current test requires a changeset Changesets consumes; canonical release docs refer to a nonexistent workflow. No production source changes yet.

R1 verification: exact consumed release RED 19 passed/1 failed; future patch RED 23 passed/1 failed. Pending and actual generated 0.5.0 candidate GREEN 24/24. Missing, undeclared, empty, stale and future milestone evidence reject. Consumed notes remain attached to the 0.5.0 milestone across later patches. No test removed or skipped.

## Verified local candidate
- R1 commit: 6720ccd53cfe2fb004991b240745e94fdac543ad.
- Installed Changesets 3.0.3 generated all 28 fixed packages at 0.5.0, consumed both notes and emitted all eight provider-controls changelog entries. Manifests retain existing engines, exports and workspace policy. BRAMBO_VERSION synchronized with the same replacement as the Linux version-packages script; generated files restored byte-for-byte after verification, not committed here.
- Final generated-candidate pnpm check: exit 0, 3068 package tests and 13 root guard tests passed; 16 existing platform/capability skips unchanged. Full typecheck and lint passed.
- Full generated-candidate pnpm build: exit 0, including English and Spanish documentation. Test-only future-patch refinement after this build changes no publishable artifacts.
- Actual packed consumer-install proof: API 1/1; session 14 passed with only the inactive opt-out sentinel skipped. No opt-out used.
- Actual release pack-publishable and plain Node consumer-smoke: exit 0 for all 28 packages on isolated Node 24.19.0. No npm upload.
- Git whitespace/source-byte checks passed; direct focused pending/candidate lifecycle suites 24/24.

## Limits and retained diagnostics
- Raw Windows docs:validate-versions reports 152 snapshot mismatches caused solely by core.autocrlf checkout conversion. Every file matches its historical tag after CRLF-to-LF comparison. The unchanged validator passed against temporary Linux-equivalent snapshot bytes; every original Windows byte restored. This is not a fix to that Windows checkout behavior or a live Linux deployment claim.
- No live provider/model/version qualification, credentials, npm publication, provenance, registry-write or environment-approval proof.
- Release PR #57 has not been updated, pushed, merged or published. Its historical action_required runs with zero jobs are not successful check evidence. Remote candidate checks and independent review are still required.
- Changesets main-push workflow may create a new version tag and dispatch release.yml automatically after version PR merge. That is a publication boundary, not preparation.
- Verification logs and actual generated manifests/changelogs/tarballs are retained under ignored .scratch/release-preparation/.

## Next step
Independent review of this preparation branch, then explicit authorization for source PR delivery. Only after corrections are merged, regenerate/review the release candidate and require every applicable check before authorizing the publication boundary.