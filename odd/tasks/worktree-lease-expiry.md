# Worktree lease renewal and expiry

## Objective and authorized scope
Give a brambo-owned git worktree a renewable lease and a lapse verdict, with strict TDD, so an abandoned worktree becomes a measurable reclaim candidate instead of an invisible one. Scope is the ledger and one pure verdict: optional `lastSeenAt` on `WorktreeRecord`, `WorktreeLedger.touch`, `WorktreeLedger.listRecords`, `expiryOf` and `expiredWorktrees`. No removal is authorised here, no session wiring, no CLI verb, no change to `WorkspaceProvider`'s published port. One focused PR.

## Problem and classification
The 2026-11 audit found 101 worktrees brambo had created and never retired, across two roots, holding 180.09 GB logical. Nothing in the record said when a session last had a reason for a tree to exist, so the only available rule was "old", and old is not evidence: 8 of 62 worktrees classified merely clean freed 0.17 GB while others held 679 uncommitted paths. A lease is the missing fact, not another heuristic.

## Constraints and route
Strict TDD: observed RED -> GREEN -> REFACTOR. `expiryOf` is pure: the clock is injected, never read. Additive only: `lastSeenAt` is optional so every record written before this change stays readable, and `isRecordShape` accepts it only when it is a string. Expiry FAILS CLOSED: a record whose timestamps cannot be parsed is `held`, because an `expired` verdict feeds a removal and `git worktree remove` destroys a commit on a detached HEAD without a word. A lapsed lease is a candidate, never a decision: the removal path is still `removeWorktree`, whose dirty-tree refusal is untouched. Initial forecast: 120-180 authored changed lines.

## Tasks
- [x] T1: Observe RED for `expiryOf` across held, boundary, stale, missing-stamp, corrupt and invalid-window cases.
- [x] T2: GREEN for `expiryOf`.
- [x] T3: Observe RED for `WorktreeLedger.touch` and `listRecords`.
- [x] T4: GREEN for `touch` and `listRecords`, keeping every pre-existing record readable.
- [x] T5: Observe RED for `expiredWorktrees` over a real ledger directory.
- [x] T6: GREEN for `expiredWorktrees`, id-ordered.
- [x] T7: Re-run the package suite, the full repository gate, typecheck and lint.

## Applicable checks and acceptance
- `pnpm --filter @brambodev/workspace-git-worktree test`
- `pnpm check`
- `pnpm --filter @brambodev/workspace-git-worktree typecheck`
- `pnpm --filter @brambodev/workspace-git-worktree lint`

Acceptance: a renewing session keeps its lease; a lease at or past its window is a candidate; a record written before leases existed is dated by `createdAt`; a record with unparseable timestamps is never expired; an unknown id is answered with absence and no record is created; an id carrying only a removal intent is never reported as owned. No skipped tests, no test removals.

## Progress and evidence
- RED observed: `test/expiry.test.ts` failed to resolve `../src/expiry.ts`, so the suite collected no expiry tests while the four pre-existing files still passed 23 tests.
- GREEN: `pnpm --filter @brambodev/workspace-git-worktree test` -> 5 files, 34 tests passed, 0 skipped (23 pre-existing + 11 new).
- `typecheck` exit 0, `lint` exit 0.
- One test in this package was corrected during the slice, not weakened: `listRecords` initially asserted that an id with a removal intent had no record, which is false — `claimRemoval` leaves the record until `retire`. The test now reproduces the real crash window by removing the record file after claiming, which is the state the method actually has to answer.
- Full repository gate (`pnpm check`, source-byte check + typecheck + every package suite + lint) passed with 29 package suites and 0 failures. One earlier run of the same gate failed `ledger-lock.test.ts` under full parallel load; it did not reproduce in 5 isolated runs, in 5 concurrently stressed runs (30 child processes), and did not recur in the full gate. `git diff` confirms this slice touched no `reserveOrdinal` or `#withProcessLock` line, so the failing path is unchanged. Recorded rather than dismissed.
- Not authorised here: renewing the lease from a live session, and reclaiming an expired one. Both consume this primitive and are separate slices.
- Rollback boundary: revert `expiry.ts`, the two ledger methods and the optional field; no record on disk becomes unreadable.
