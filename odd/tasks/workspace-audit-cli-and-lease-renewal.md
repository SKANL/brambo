# Workspace audit command and session lease renewal

## Objective and authorized scope
Close the loop the previous unit opened: make a session renew the lease it holds, and expose the audit as `brambo workspace audit`. Strict TDD. Scope is one optional member on the workspace port with its clause, the git-worktree implementation, one call site in the session, the session re-export, the CLI noun, and the tests for each. No removal, no reclamation, no scheduling.

## Problem and classification
`WorktreeLedger.touch` and `expiredWorktrees` existed with nothing calling them, so a lease was a field no process ever wrote: every worktree would have read as lapsed the moment the feature shipped, which is worse than having no lease at all because the plan would look authoritative. Separately, `auditWorktrees` had no consumer, so the only way to see what a machine is carrying was to write the same shell script the audit itself replaced.

## Constraints and route
Strict TDD: observed RED -> GREEN -> REFACTOR. `renew` is OPTIONAL on the port: a provider with no expiry has nothing to renew, and requiring a no-op would make every provider pretend to hold a lease it does not have. A provider that implements it must refuse an id it does not own with the coded unknown-id error, because a renewal that answers for a stranger keeps a tree nobody is watching alive. Renewal is best effort inside the session: a finished turn is never failed by bookkeeping, and the removal path's dirty-tree refusal is untouched. The CLI measures nothing, classifies nothing and removes nothing. Initial forecast: 240-320 authored changed lines.

## Tasks
- [x] T1: Observe RED for provider renewal on its own package.
- [x] T2: GREEN for `renew` on `WorkspaceProvider`, the contract clause and the git-worktree implementation.
- [x] T3: Observe RED for session renewal after a successful turn.
- [x] T4: GREEN for the session call site, including the failed-turn and refusing-provider cases.
- [x] T5: GREEN for `brambo workspace audit`, its flag parsing and its JSON shape.
- [x] T6: Re-run every applicable gate: package suites, repository check, build, consumer proof, docs check.

## Applicable checks and acceptance
- `pnpm --filter @brambodev/contracts test`
- `pnpm --filter @brambodev/workspace-git-worktree test`
- `pnpm --filter @brambodev/session test`
- `pnpm --filter @brambodev/cli test`
- `pnpm check`, `pnpm build && pnpm proof:consumer-install`, `pnpm docs:check`

Acceptance: a provider without `renew` passes the clause; a provider with it renews a live id and refuses an unknown one with the coded error; a session renews exactly once after a successful turn, never after a failed one, and still completes when the provider refuses; `brambo workspace audit` prints one entry per owned record with a repository-scoped identity, exits 0 on success, and exits 2 on an invalid or unknown flag. No skipped tests, no test removals.

## Progress and evidence
- RED observed for T1: `test/renew.test.ts` failed 3/3 with `TypeError: provider.renew is not a function`.
- GREEN: provider renewal 3/3; the workspace contract suite passes for both shipped providers (the new clause passes on absence for `workspace-local`); `contracts` 381 tests.
- RED observed for T3 by construction: the session call site did not exist, so the two new assertions could not pass; they were written before the call was added.
- GREEN: `session` `run-session.test.ts` 23 passed, including renew-once-on-success, never-on-failure, and still-completes-when-renew-throws.
- GREEN for T5: `cli` `workspace-audit.test.ts` 4 passed against the documented on-disk store layout — one expired entry that is `absent` and therefore never reclaimable, an explicit window that reads `held`, an invalid window and an unknown flag both exit 2.
- The repository's printed-command invariant (`printed-commands.test.ts`) dispatches every `brambo …` string the shipped source prints; `cli` passes 235 tests with the new noun in the usage block.
- `cli`, `session` and `contracts` typecheck and lint all exit 0.
- Not authorised here: reclaiming an expired lease automatically, and scheduling or admission control.
- Rollback boundary: drop `renew` from the port and its clause, the provider method, the session call, and the CLI noun; every stored record stays readable.
