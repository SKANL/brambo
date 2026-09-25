# API adapter release-surface verification

Deterministic candidate: `86d3444`. The commands below ran locally against those historical source bytes. The GitHub-hosted live workflow and its policy were later removed in favor of a manual local operator procedure; this report is not evidence of the current workflow policy. See the [later redacted smoke report](2026-09-24-api-adapters-live-smoke.md).

## Deterministic checks

| Command | Observed result |
| --- | --- |
| `pnpm --filter @brambodev/contracts exec vitest run test/workflow-policy.test.ts` | At this historical candidate: exit 0, 9 of 9 passed. The policy has since changed to forbid GitHub-hosted API live execution. |
| `pnpm check` | Exit 0: source-byte check, workspace typecheck, package tests, 11 live-guard tests, and ESLint passed. Package suites retained their reported skips; no live provider suite ran. |
| `pnpm build` | Exit 0: all package builds and Docusaurus production builds for English and Spanish passed. |
| `pnpm proof:consumer-install` | Exit 0: adapter-api packed consumer proof 1/1 passed; session packed consumer proof 13 passed, 1 skipped. |
| `pnpm docs:check` | Exit 0: 23 API entrypoints, 51 English and 51 Spanish routes, 14 documentation tests, links, metadata, and fake-provider examples passed. |
| `pnpm lint` | Exit 0. Also included in `pnpm check`. |
| `$env:BRAMBO_RUN_LIVE_API_TESTS='0'; pnpm test:api-live` | Exit 0 with the explicit opt-out skip message. No provider call was launched. |
| `pnpm exec changeset status` | Exit 0; the three new API packages and public-contract changes appear in the pending release set. |
| `git diff --check` | Exit 0 before the workflow work-unit commit. |

`actionlint` was not installed locally, so no `actionlint` result is claimed. The current workflow policy forbids GitHub-hosted API live execution; the local live guard validates opt-in, credential/model presence, and request/deadline bounds.

## Live checks at this candidate

- OpenAI real API: **not yet run at the time of this snapshot**. No live execution or credential use was authorized for this local task.
- Anthropic real API: **not yet run at the time of this snapshot** for the same reason.
- No live provider call was made for this deterministic candidate. The later manual local smoke results are recorded separately; GitHub-hosted live execution is no longer part of the project.

## Known limits

- Deterministic fixtures and packed-consumer proofs cannot establish real model availability, billing behavior, provider-side capability support, or remote cleanup under live credentials.
- The Spanish routes remain marked `translationStatus: pending`; their structure was validated, not a completed translation.
- No terminal native review receipt for the current final candidate is established by these deterministic checks.
