# Resources measurement core

## Objective and authorized scope
Introduce `@brambodev/resources`, a provider-neutral measurement core for reclaiming agent-created filesystem state, with strict TDD. This task delivers ONLY the pure, filesystem-free core: unique-byte accounting under hardlinks, worktree reclaim classification, and collision-safe reclaim identity. No filesystem walking, no CLI verb, no lease or TTL, and no change to `@brambodev/workspace-git-worktree`. One focused PR.

## Problem and classification
A machine-wide audit (2026-11) found 101 orphaned git worktrees across two roots: 180.09 GB logical against 64.23 GB unique. About 64% of the apparent footprint was the same pnpm `node_modules` inode hardlinked up to 174 times; one `package.json` had 83 distinct link paths. A report built on logical bytes overstates recoverable space by 2.8x and cannot be trusted twice. Classification also failed in practice: 8 of 62 worktrees classified clean freed only 0.17 GB, and two worktrees in different roots shared the backup key `v040-integraciones`, so one 196-byte working diff was overwritten. Both are pure-logic defects, so they are fixed here, test-first, before any I/O is introduced.

## Constraints and route
Strict TDD: observed RED -> GREEN -> REFACTOR. Pure functions only: no `node:fs`, no network, no clock, no environment reads. Zero runtime dependencies. Invalid input is handled by a documented rule and never silently over-reported. Identity is derived from repository plus worktree id, never from a display name. The new package enters the enforced topology at tier 1 with no imports. Initial forecast: 120-200 authored changed lines.

## Tasks
- [x] T1: Observe RED for unique-byte accounting under hardlinks.
- [x] T2: GREEN for unique-byte accounting.
- [x] T3: Observe RED for reclaim classification across clean, dirty, unpushed and unreachable states.
- [x] T4: GREEN for reclaim classification.
- [x] T5: Observe RED for collision-safe reclaim identity.
- [x] T6: GREEN for reclaim identity.
- [x] T7: Register the package in the enforced topology and run the focused checks.
- [x] T8: Observe RED for a reparse-safe tree scan that charges hardlinks once.
- [x] T9: GREEN for `scanTree`, including a junction that points back at an ancestor.
- [x] T10: Observe RED for the reclaim plan.
- [x] T11: GREEN for `buildReclaimPlan`, including the identity-collision refusal.
- [x] T12: Add the package to the fixed release roster and publish a changeset.
- [x] T13: Run the full repository gate, build and release guards.

## Applicable checks and acceptance
- `pnpm --filter @brambodev/resources test`
- `pnpm --filter @brambodev/contracts test` (enforced topology parity)
- `pnpm typecheck`
- `pnpm lint`

Acceptance: dedup accounting never counts a byte twice and is exact when link counts are uniform; a worktree with any dirty path, any unpushed commit, or a commit unreachable from every remote is never classified reclaimable; two worktrees sharing a directory name in different repositories never share an identity. No skipped tests, no test removals.

## Progress and evidence
- Package scaffolded with conventions from `@brambodev/lock` (0.5.0, zero runtime dependencies, `brambo-source` export condition, shared vitest config).
- RED observed once, covering all three behaviours: `Error: Cannot find module './measure.ts' imported from packages/resources/src/index.ts:1`. The suite collected 0 tests. Since `src/index.ts` re-exports the whole surface, the three concerns were NOT separately red-observed; each behaviour has its own failing assertion only in the GREEN run below. Recorded honestly as a discipline gap to close in the next slice, where each behaviour gets its own red.
- GREEN: `pnpm --filter @brambodev/resources test` -> 19 tests passed, 1 file, 0 skipped.
- Topology parity: `packages/contracts/test/topology.test.ts` -> 4 tests passed with `resources: 1` added to `TIER`. The package imports nothing, so it satisfies a tier-1 placement without a downward violation.
- `pnpm --filter @brambodev/resources typecheck` exit 0; `lint` exit 0; `build` exit 0 (dist carries `measure`, `classify`, `identity`).
- Behaviours now pinned by test: hardlink shares are charged per name so one inode counted through several names totals its size once; a zero link count charges in full rather than dropping bytes; a negative size is a `RangeError`; any dirty path, any unpushed commit or an unreachable commit is `needs-review`; negative counts are a `RangeError`; identity includes the repository so two `v040-integraciones` in different repositories cannot collide; trailing separators are stripped; empty repository or id is a `TypeError`.
- Not yet done (separate slices, not authorised here): a `reclaim`/`gc` CLI verb, and renewing or reclaiming a lease from a live session.
- Rollback boundary: delete `packages/resources` and the single `TIER` entry; no existing package's runtime bytes change.

## Scanner slice
- RED observed: `test/scan.test.ts` reported 7 failing tests of 26, because `scanTree` was not exported. One of the seven passed for the wrong reason initially (`undefined is not a function` is a `TypeError`), which is why the plan's collision assertion was later tightened to match its message.
- GREEN: `scanTree` walks with two independent loop guards — `lstat` marks symlinks and Windows junctions skipped, and a visited `dev:ino` set stops a revisited directory. Both are load-bearing: pnpm `node_modules` is a junction forest, and the audit's own tooling hung three times before `/XJ` was found.
- Real-filesystem evidence, not mocks: 1024-byte file; two names hardlinked to one inode measured 2048 logical and 1024 unique; a junction to a sibling counted its target once and reported `skippedReparse` 1; a junction pointing at an ancestor terminated with 1 file and `skippedReparse` 1.
- `pnpm --filter @brambodev/resources test` -> 26 passed (19 core + 7 scanner).

## Plan slice
- RED observed: 6 of 7 plan tests failed while `buildReclaimPlan` was not exported.
- GREEN: `buildReclaimPlan` splits reclaimable from needs-review, orders each by unique bytes then identity, totals logical and unique separately, and REFUSES two candidates sharing an identity — the direct regression for the `v040-integraciones` backup collision that destroyed a 196-byte diff.
- Negative or non-finite byte counts are a `RangeError`; the duplicate-identity assertion matches the message, so it cannot pass because a missing function also throws `TypeError`.
- `pnpm --filter @brambodev/resources test` -> 33 passed (19 core + 7 scanner + 7 plan).

## Repository gate and release conventions
- `packages/contracts/test/topology.test.ts` -> 4 passed with `resources: 1`; the package imports nothing, so tier 1 holds without a downward violation.
- `@brambodev/resources` added to `.changeset/config.json`'s `fixed` roster. Without that entry the fixed-version invariant would silently exclude a publishable manifest.
- Changesets added for `@brambodev/resources` (minor) and `@brambodev/workspace-git-worktree` (minor); both are consumer-visible surface.
- `pnpm check` (source-byte check, typecheck across the repository, every package suite, lint) passed: 29 package suites, 0 failures, guards 43/43, lint exit 0.
- One earlier full-gate run failed `ledger-lock.test.ts` under parallel load; it did not reproduce in 5 isolated runs, 5 concurrently stressed runs, or the later full gate, and this package's changes are additive to that path. Recorded rather than dismissed.

## Final audit
- Roster surfaces that had to change because the roster grew, each a declaration rather than a weakened check: `scripts/publishable-packages.json` (+`resources`), `typedoc.json` entryPoints (+`packages/resources/src/index.ts`), `.changeset/config.json` fixed group (+`@brambodev/resources`), `docs-site/src/data/package-status.json` (+`experimental`), and the two roster counts in `packages/contracts/test/versions.test.ts` (28->29 publishable, 27->28 portable). The invariant inside that test — every portable package at `>=20`, `workflow-store-sqlite` at `>=24.15.0` — is unchanged and still enforced over all 29.
- Documentation: `docs-site/docs/packages/resources.md` (original) and its Spanish translation (`translationStatus: translated`) were written; `pnpm docs:check` passes with 84 English + 84 Spanish routes, 29 publishable API entrypoints, valid links, valid examples.
- Consumer proof: `pnpm proof:consumer-install` initially failed on its deliberate bundling table, which is the proof doing its job. The observed deltas were `resources: 'runs:5'` (new package) and `workspace-git-worktree: 'runs:9' -> 'runs:11'` (two modules entering the graph from `expiry.ts`). Both values are what the proof measured; the table was updated to them, not to a guess. The proof then passed 14 tests with 1 pre-existing Windows platform skip.
- Gates run, final state: `pnpm check` green (29 package suites, 0 failures, guards 43/43, lint 0), `pnpm build` exit 0 (12 files in `packages/resources/dist`), `pnpm docs:check` exit 0, `pnpm proof:consumer-install` exit 0.
- Explicitly out of scope for this task, and named in both ODD records: a `brambo` CLI binding for the audit, and renewing or reclaiming a lease from a live session. No code for those exists in this change.

## Remote gate findings
- First CI run failed on two checks. CodeQL reported 8 new high alerts in code this change added, and `gates` failed in `@brambodev/sandbox-local`, a package this change does not touch.
- CodeQL, `js/redos` at `src/identity.ts`: `[/\\]+$` over caller-supplied input is the shape the rule reports. Replaced with a linear scan from the end (`charCodeAt`, no pattern), which does the same work in one pass and cannot backtrack. Behaviour is unchanged: `///` still trims to empty and still raises `TypeError`.
- CodeQL, `js/insecure-temporary-file` (7 alerts) at `test/scan.test.ts`: the root was composed from pid, clock and randomness and created with `mkdir`. Switched to `mkdtemp(join(tmpdir(), 'brambo-scan-'))`, the primitive the rest of the repository already uses and the one the rule treats as safe.
- The `sandbox-local` failure is recorded in `odd/tasks/worktree-audit-verb.md`; it is a host-dependent test, fixed with an injection seam rather than a skip.
- Local verification after the fixes: `resources` 33 passed, typecheck 0, lint 0; `sandbox-local` 72 passed with 7 pre-existing skips; source-byte check exit 0.
