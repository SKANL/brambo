# Release preparation

## Objective and authority
Prepare the 0.5.0 fixed-package release candidate for review and publication, without publishing, merging the release PR, creating tags, dispatching publication workflows, or probing credentials. Source correction push/PR delivery and protected merge are explicitly authorized; publication remains separate.

## Constraints
Strict TDD enabled by explicit user instruction. Runner: pnpm --filter @brambodev/contracts exec vitest run test/versions.test.ts; full gate pnpm check, pnpm build, pnpm proof:consumer-install. Preserve all 28 fixed package versions, engines and workspace dependency policy. English artifacts. RDD remains off.

## Tasks
- [x] R1: Replace pending-only release-note assertion with validated pending/consumed lifecycle proof (delegated; reading and tests across release artifacts). RED on actual consumed release candidate; GREEN on pending and generated candidate. Rollback: release-note lifecycle tests only.
- [x] R2: Add truthful provider controls changeset, root consumer release notes and accurate release workflow documentation (delegated; multi-file preparation). Validate generated Changesets candidate versions and changelogs. Rollback: these release notes only.
- [x] R3: Run full source/build/packed-consumer and generated-candidate verification; record exact results and independent-review handoff. No publication claim.

## Delivery
Two focused stacked-to-main source slices, explicitly authorized. Guard slice PR #70 merged at a4264e0fcc9dd4bd47ece31b1ec988fb57503b91 after all 17 applicable PR checks passed; no size exception or protection bypass. Remaining notes/lifecycle slice stays below 400 authored lines. Generated candidate manifests/changelogs are verification-only, never committed to preparation branch.

## Progress
Initial exploration completed: current test requires a changeset Changesets consumes; canonical release docs refer to a nonexistent workflow. Release lifecycle tests and truthful consumer notes are implemented; immutable automation guard is now in main.

R1 verification: exact consumed release RED 19 passed/1 failed; future patch RED 23 passed/1 failed. Pending and actual generated 0.5.0 candidate GREEN 24/24. Missing, undeclared, empty, stale and future milestone evidence reject. Consumed notes remain attached to the 0.5.0 milestone across later patches. No test removed or skipped.

## Verified local candidate
- R1 commit: 6720ccd53cfe2fb004991b240745e94fdac543ad.
- Installed Changesets 3.0.3 generated all 28 fixed packages at 0.5.0, consumed both notes and emitted all eight provider-controls changelog entries. Manifests retain existing engines, exports and workspace policy. BRAMBO_VERSION synchronized with the same replacement as the Linux version-packages script; generated files restored byte-for-byte after verification, not committed here.
- Final generated-candidate pnpm check: exit 0, 3068 package tests and 13 root guard tests passed; 16 existing platform/capability skips unchanged. Full typecheck and lint passed.
- Full generated-candidate pnpm build: exit 0, including English and Spanish documentation. Test-only future-patch refinement after this build changes no publishable artifacts.
- Actual packed consumer-install proof: API 1/1; session 14 passed with only the inactive opt-out sentinel skipped. No opt-out used.
- Actual release pack-publishable and plain Node consumer-smoke: exit 0 for all 28 packages on isolated Node 24.19.0. No npm upload.
- Git whitespace/source-byte checks passed; direct focused pending/candidate lifecycle suites 24/24.

## Historical preparation limits and retained diagnostics (before PR #71 delivery)
- Raw Windows docs:validate-versions reports 152 snapshot mismatches caused solely by core.autocrlf checkout conversion. Every file matches its historical tag after CRLF-to-LF comparison. The unchanged validator passed against temporary Linux-equivalent snapshot bytes; every original Windows byte restored. This is not a fix to that Windows checkout behavior or a live Linux deployment claim.
- No live provider/model/version qualification, credentials, npm publication, provenance, registry-write or environment-approval proof.
- Release PR #57 has not been updated, pushed, merged or published. Its historical action_required runs with zero jobs are not successful check evidence. Regenerated release-candidate checks and independent review remain required.
- Changesets main-push workflow may create a new version tag and dispatch release.yml automatically after version PR merge. That is a publication boundary, not preparation.
- Verification logs and actual generated manifests/changelogs/tarballs are retained under ignored .scratch/release-preparation/.

## Historical next step (before PR #71 delivery)
Deliver the remaining notes/lifecycle slice for independent review and all applicable checks. Only after corrections are merged, regenerate/review the release candidate and require every applicable check before authorizing the publication boundary.
## Work-unit evidence
- R1: 6720ccd53cfe2fb004991b240745e94fdac543ad, consumed milestone lifecycle regression fix and controls.
- R2/R3: cc1784750f9d1887b5971101ab4c2583bb1d846e, consumer release notes and verified generated-candidate preparation report.

## Historical guard delivery and handoff (before blocker resolution)
- Guard PR #70: exact reviewed head 27398c746b149e80efd3eef76b2ca507e74f7c90; 343 authored lines, seven files. Full local check: 3064 package + 34 root tests passed; 16 existing package skips. Actual checkout-depth fixture RED on shallow history, GREEN on full history.
- Post-merge main a4264e0: CI 38180402767, Documentation 38180402760, Security 38180402716 and Changesets 38180402796 all succeeded. Actual Changesets final-step output was ready=false, reason=unchanged, version=0.4.0 at that exact main SHA, so tag creation and publication dispatch did not execute.
- Existing v0.5.0 tag points to a commit with 0.4.0 manifests and remains untouched. Correct tag disposition requires a deliberate maintainer decision before publication.
- Future release dispatch actions:write permission is a known publication blocker; no permission or credential policy change is included here.
- Original preparation commits above are historical evidence; notes/lifecycle work is reapplied on the guarded main without overwriting its workflow or RELEASING.md.

## Publication blocker resolution (authorized follow-up)
- [x] R4: Delete only the incorrect remote v0.5.0 ref after immutable evidence capture; verify absence. Preserve tag object evidence; no replacement tag or publication.
- [x] R5: Add least-privilege job-scoped Actions write permission for release dispatch with strict RED/GREEN workflow-contract proof; run full checks/build/packed proof before preparation delivery. Delegated route: multi-file workflow/test/tracker correction. No PR #57 merge or publication dispatch.
Checks: node --test scripts/release-version-guard.test.mjs; pnpm check; pnpm build; pnpm proof:consumer-install; actual pack and consumer smoke. Live dispatch remains unexecuted because it would publish.

## Current blocker-resolution evidence
- Preparation PRs #70 and #71 are merged on main 673110711d86846550d02c320b38eebafabcd5c5. Release PR #57 was regenerated at ca24724 and all 17 applicable checks passed at that revision; this is historical, not proof for a later regenerated head.
- Explicit human authorization permits deleting only the incorrect remote v0.5.0 ref. DELETE returned success; immediate GitHub ref readback returned HTTP 404. Original annotated object 5d9fa6e0855f51d8482774dbf975a15fd599b0f9 and target 5afe8db5c6146bf5df91bde98538d990127d374f remain recorded; target contracts manifest is 0.4.0. No replacement tag was created.
- All 28 exact public npm 0.5.0 metadata endpoints and the exact GitHub release returned HTTP 404 before deletion. This proves current absence, not historical nonpublication.
- Changesets run 38101528061 failed release dispatch with HTTP 403 after creating the incorrect tag. Job-scoped actions: write is the minimum documented dispatch permission; other workflow/job permissions and release guards remain unchanged.
- Strict TDD: actual workflow permission contract RED 21 passed/1 failed (missing actions: write); focused GREEN 1/1. Fresh full checks passed on isolated Node 24.19.0 and pinned pnpm 11.23.0: 3068 package tests, 35 root tests, 16 unchanged existing package skips; typecheck and lint passed. No live dispatch test: it would cross the still-unauthorized publication boundary.
- Current next step: independently review the narrow preparation PR and wait for every applicable check before protected merge. Reverify the regenerated release PR afterward; do not merge release PR #57 or publish npm.

- R5 final local proof: policy RED 10 passed/1 failed, then GREEN 11/11; root full guard GREEN 22/22 within the 35-test root suite. Full pnpm build passed both documentation locales. Actual packed consumer-install proof passed API 1/1 and session 14 with only the unchanged inactive opt-out sentinel skipped. No opt-out used. All 28 packages packed successfully; plain Node consumer smoke passed contracts/session/CLI 0.4.0. Existing DEP0190 shell deprecation warning retained, not fixed or hidden.
- Retained initial diagnostics: aborted default Node 24.14.1 invocation; bundled pnpm 11.25 rejected an existing workspace task cycle; pinned 11.23.0 on 24.19.0 resolved the tooling mismatch without installation or global configuration changes. Initial full gate caught two policy assertions, then the precise authorized Changesets.release allowlist and exact expected permissions were updated with observed RED/GREEN. No tests were removed or skipped.
- Remote ref readback is still HTTP 404; all 28 exact npm 0.5.0 public metadata endpoints again returned HTTP 404 after deletion. No credentials or npm registry writes were used.
- Rollback boundary: remove only Changesets.release Actions write and its two permission-contract expectations; immutable tag guards, package code/versions and release checks are independent and unchanged. The remote tag deletion is separately authorized history repair, not an automatic rollback or authorization to recreate a tag.

- R4/R5 work-unit commit: 4e60a212473d3875af6b1127ba235936a9e51ae7 (scoped dispatch permission, exact policy contracts and verified blocker-resolution evidence). Protected preparation PR delivery remains the next step; no release publication authorization is inferred from these completed preparation tasks.
