# Release preparation

## Objective and authority
Prepare the 0.5.0 fixed-package release candidate for review and publication, without publishing, merging the release PR, pushing, creating tags, dispatching workflows, or probing credentials.

## Constraints
Strict TDD enabled by explicit user instruction. Runner: pnpm --filter @brambodev/contracts exec vitest run test/versions.test.ts; full gate pnpm check, pnpm build, pnpm proof:consumer-install. Preserve all 28 fixed package versions, engines and workspace dependency policy. English artifacts. RDD remains off.

## Tasks
- [x] R1: Replace pending-only release-note assertion with validated pending/consumed lifecycle proof (delegated; reading and tests across release artifacts). RED on actual consumed release candidate; GREEN on pending and generated candidate. Rollback: release-note lifecycle tests only.
- [ ] R2: Add truthful provider controls changeset, root consumer release notes and accurate release workflow documentation (delegated; multi-file preparation). Validate generated Changesets candidate versions and changelogs. Rollback: these release notes only.
- [ ] R3: Run full source/build/packed-consumer and generated-candidate verification; record exact results and independent-review handoff. No publication claim.

## Delivery
Local conventional work-unit commits only; remote delivery awaits explicit authorization. Forecast approximately 200 authored changed lines; no inherited size exceptions. Generated candidate manifests/changelogs are verification-only, never committed to preparation branch.

## Progress
Initial exploration completed: current test requires a changeset Changesets consumes; canonical release docs refer to a nonexistent workflow. No production source changes yet.

R1 verification: exact consumed release RED 19 passed/1 failed; future patch RED 23 passed/1 failed. Pending and actual generated 0.5.0 candidate GREEN 24/24. Missing, undeclared, empty, stale and future milestone evidence reject. Consumed notes remain attached to the 0.5.0 milestone across later patches. No test removed or skipped.
