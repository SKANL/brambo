# API adapter release-surface verification

Deterministic candidate: `86d3444` (scheduled live workflow and its policy test). The commands below ran locally against those source bytes. This is a historical deterministic snapshot, not the current live outcome; see the [later redacted smoke report](2026-09-24-api-adapters-live-smoke.md).

## Deterministic checks

| Command | Observed result |
| --- | --- |
| `pnpm --filter @brambodev/contracts exec vitest run test/workflow-policy.test.ts` | RED before the workflow change: exit 1, 1 of 9 tests failed because the `schedule` trigger was absent. GREEN after the change: exit 0, 9 of 9 passed. |
| `pnpm check` | Exit 0: source-byte check, workspace typecheck, package tests, 11 live-guard tests, and ESLint passed. Package suites retained their reported skips; no live provider suite ran. |
| `pnpm build` | Exit 0: all package builds and Docusaurus production builds for English and Spanish passed. |
| `pnpm proof:consumer-install` | Exit 0: adapter-api packed consumer proof 1/1 passed; session packed consumer proof 13 passed, 1 skipped. |
| `pnpm docs:check` | Exit 0: 23 API entrypoints, 51 English and 51 Spanish routes, 14 documentation tests, links, metadata, and fake-provider examples passed. |
| `pnpm lint` | Exit 0. Also included in `pnpm check`. |
| `$env:BRAMBO_RUN_LIVE_API_TESTS='0'; pnpm test:api-live` | Exit 0 with the explicit opt-out skip message. No provider call was launched. |
| `pnpm exec changeset status` | Exit 0; the three new API packages and public-contract changes appear in the pending release set. |
| `git diff --check` | Exit 0 before the workflow work-unit commit. |

`actionlint` was not installed locally, so no `actionlint` result is claimed. The parsed workflow policy test validates the scheduled/manual trigger set, main-branch job guard, protected environment binding, credential references, model source selection, and request/deadline caps.

## Live checks at this candidate

- OpenAI real API: **not yet run at the time of this snapshot**. No live execution or credential use was authorized for this local task.
- Anthropic real API: **not yet run at the time of this snapshot** for the same reason.
- The Tuesday 06:17 UTC scheduled workflow and confirmed manual dispatch are configured in source, but neither has executed as part of this verification. The job is restricted to `main` and references `api-adapters-live`; actual environment protection, model variables, isolated keys, and provider behavior require operator setup and an authorized run.

## Known limits

- Deterministic fixtures and packed-consumer proofs cannot establish real model availability, billing behavior, provider-side capability support, or remote cleanup under live credentials.
- The Spanish routes remain marked `translationStatus: pending`; their structure was validated, not a completed translation.
- No terminal native review receipt for the current final candidate is established by these deterministic checks.
