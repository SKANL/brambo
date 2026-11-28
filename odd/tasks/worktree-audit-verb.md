# Worktree audit verb

## Objective and authorized scope
Add `auditWorktrees` to `@brambodev/workspace-git-worktree`: the SDK verb that composes the ledger, real git observation and `@brambodev/resources` measurement into entries plus a `ReclaimPlan`. Strict TDD. Scope is one module, one dependency on `@brambodev/resources` at tier 1, and the export. No CLI binding, no removal, no session renewal.

## Problem and classification
`expiryOf` answers when a lease lapsed and `buildReclaimPlan` answers what a set of measurements totals, but nothing joins them to git's own view of a tree. The 2026-11 audit had to shell out by hand, and the hand-written tooling was wrong twice: it counted 89 worktrees when there were 101, and it reported logical bytes until hardlinks were modelled. An audit that a host can call once, with the same rules the tests pin, replaces a PowerShell script that nobody can review.

## Constraints and route
Strict TDD: observed RED -> GREEN -> REFACTOR. Observation is read-only: `git status --porcelain`, `git rev-list --count HEAD --not --remotes`, `git branch -r --contains HEAD`. No fetch, no prune, no write to the repository. A worktree whose directory is gone cannot be observed, and unobservable is never reclaimable: it is reported as `absent` with `needs-review`. A lease that lapsed only makes a worktree a candidate; `removeWorktree` remains the only removal path and its refusals are untouched. Initial forecast: 180-260 authored changed lines.

## Tasks
- [ ] T1: Observe RED for observing one worktree's git state.
- [ ] T2: GREEN for `observeWorktree`.
- [ ] T3: Observe RED for the composed audit over a real repository with a bare remote.
- [ ] T4: GREEN for `auditWorktrees`, including absent, dirty, held and expired cases.
- [ ] T5: GREEN for the plan verdict rule: lapsed AND clean-only is reclaimable.
- [ ] T6: Re-run the package suite, the repository gate, the consumer proof and the docs gate.

## Applicable checks and acceptance
- `pnpm --filter @brambodev/workspace-git-worktree test`
- `pnpm check`
- `pnpm build && pnpm proof:consumer-install`
- `pnpm docs:check`

Acceptance: a worktree with any dirty path, any unpushed commit or a commit no remote-tracking ref contains is `needs-review`; a worktree whose path is absent is `absent` and `needs-review`; a held lease is never reclaimable even when the tree is clean; a lapsed lease on a clean, remotely-reachable tree is `reclaimable`; every entry carries an identity built from repository and id, never from a directory name. No skipped tests, no test removals.

## Progress and evidence
- RED observed: all 9 tests in `test/audit.test.ts` failed because `auditWorktrees` and `observeWorktree` were not exported.
- Fixture is a real bare remote plus a real repository and real `git worktree add --detach` checkouts, not mocks: reachability is proved by `git push` to the bare remote followed by `git fetch`, so `branch -r --contains HEAD` has something true to report.
- GREEN: 9/9. A clean detached checkout pushed to a remote observes `dirtyPaths: 0, unpushedCommits: 0, commitReachableFromRemote: true`; an untracked file raises `dirtyPaths`; a commit made on the detached HEAD reports `unpushedCommits: 1` and unreachable; a removed directory observes `absent`.
- Composed audit: a held lease keeps a clean tree out of `plan.reclaimable`; a lapsed lease on a clean reachable tree lands there with identity `${repoPath}::w-1`; a lapsed dirty tree stays in `needsReview`; a missing directory is `absent` and `needs-review`; two records produce two distinct identities and a positive unique-byte total.
- `pnpm --filter @brambodev/workspace-git-worktree test` -> 43 passed (34 pre-existing + 9 audit). `typecheck` exit 0, `lint` exit 0 after removing an unused test helper.
- Topology: `workspace-git-worktree` (tier 2) now depends on `resources` (tier 1) — the same downward shape as `lock`. `contracts` topology 4/4.
- Consumer proof: the bundling table moved `workspace-git-worktree` `runs:11 -> runs:14`, which is the three `resources` modules the graph now reaches. The value was read from the failing proof, not guessed; the proof then passed 14 tests with 1 pre-existing Windows skip.
- One self-inflicted defect, caught and fixed: a PowerShell regex rewriting `package.json` wrote a literal `\n` and produced invalid JSON. Detected by parsing the file before install, repaired by an explicit edit, and `pnpm install` then completed.
- Not authorised here: a `brambo` CLI binding for the audit, and renewing or reclaiming from a live session.
- Rollback boundary: remove `src/audit.ts`, its export and its test, and the dependency on `@brambodev/resources`; the ledger and expiry surfaces are untouched.

## Remote gate findings
- First CI run failed `gates` in `@brambodev/sandbox-local`, a package this change does not touch. Root cause found rather than assumed: `createLinuxSandboxProvider` wrapped argv with bubblewrap whenever its REAL probe succeeded, and the prlimit test asserted the unwrapped shape. GitHub's `ubuntu-latest` now ships a working `bwrap`, so the assertion changed underneath a test that had passed for months. On this Windows machine the probe is skipped by platform, which is why the failure was invisible locally.
- Fixed at the cause, not by skipping: `LinuxSandboxProviderOptions` gained `bubblewrapProbe` and `bubblewrapEvidenceProbe`, so a host-discovered capability becomes an input a test states. The existing test now declares the no-backend case explicitly, and a new test covers the nested `prlimit --fsize=... -- bwrap ...` shape that no host-independent test covered before. Coverage went from one branch to two; `sandbox-local` passes 72 tests with 7 pre-existing skips.
- A patch changeset was added for `@brambodev/sandbox-local`, because optional public options are consumer-visible.
