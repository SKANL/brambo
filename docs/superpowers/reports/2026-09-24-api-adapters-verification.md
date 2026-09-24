# API adapter release-surface verification

## Deterministic checks

| Command | Observed result |
| --- | --- |
| `pnpm check` | Passed after the first direct-suite guard correction (nine guard tests). Follow-up recheck: workspace typecheck passed, but unrelated projection hooks exceeded 10 seconds before lint/guard tests ran; see below. |
| `pnpm build` | Exit 0: package builds and both Docusaurus locales passed. |
| `pnpm proof:consumer-install` | Exit 0: adapter API packed/offline consumer proof 1/1; session consumer proof 13 passed, 1 skipped. |
| `pnpm docs:check` | Exit 0: 23 TypeDoc entrypoints, 51 English and 51 Spanish routes, 14 documentation tests, links, metadata, and executable fake-provider examples passed. |
| `pnpm --filter brambo-docs build` | Exit 0: English and Spanish production builds passed after the final guide edits. |
| `pnpm exec changeset status` | Exit 0: changesets resolve the three new API packages and public contract changes. |
| `pnpm --dir packages/adapter-api pack --pack-destination $dest`; repeated for `packages/adapter-openai` and `packages/adapter-anthropic` | All three tarballs contained package metadata, README, JavaScript entrypoint, and declarations; adapter-api also contained its `./testing` entrypoint. |
| `pnpm test:api-live` without opt-in | Exit 0 with explicit skip diagnostic; no provider request launched. |
| Direct OpenAI and Anthropic live Vitest files without opt-in | Each reported one skipped test; no provider request launched. |
| `node --test scripts/live-api-guard.test.mjs` | Exit 0: 11 tests, including direct invocation of both live suites for missing shared setup, non-decimal bounds, and complete fake setup reaching a test-only blocked fetch. No provider I/O occurred. |
| `pnpm lint` | Exit 0 after the fixture and numeric-bound correction. |
| `pnpm --filter @brambodev/projection exec vitest run test/materialise.test.ts test/remediate.test.ts --hookTimeout=60000` | Exit 0: 94 tests passed with a raised hook timeout; the regular 10-second timeout failed under current machine load. |

The initial `pnpm check` failed only because the new live suites and publishable packages were absent from the repository's explicit roster/count tests. The initial consumer proof failed because its bundle-surface golden table lacked the three packages and changed contracts export count. Those expectations were updated to observed values; subsequent full runs passed. These were task-induced failures, not claimed pre-existing baseline failures.

The initial direct-suite guard test failed because a suite with opt-in but incomplete shared setup exited as a skip (status 0). The corrected suites enforce the runner's shared prerequisites and fail non-zero before any transport call. A first correction iteration failed ESLint's cross-package import rule; the small direct-suite checks now remain local to each package. A 15-second child-test timeout also failed under the full workspace test load, so the test-only process limit was raised to 60 seconds; the final full check passed. The runner continues to run providers serially; its Vitest invocation no longer selects an unsupported `basic` reporter.

Follow-up RED tests exposed two live-readiness defects: the OpenAI fixture's empty strict object lacked `required: []`, so complete fake setup failed during `provider.create`, and direct-suite numeric parsing accepted exponent strings such as `2e0` that the runner rejects. Both fixtures now include the explicit empty required list, and both suites use the runner's digit-only bounded parsing. With fake credentials and a test-only fetch blocker, each suite reaches its transport boundary without making a network call. All 11 guard tests passed. The follow-up `pnpm check` failed in unrelated projection suite hooks: `materialise.test.ts` `beforeAll` and `afterAll`, and `remediate.test.ts` `beforeAll` exceeded the repository's 10-second hook timeout (251 passed, 98 skipped in that package). An isolated projection rerun reproduced the timeout; with `--hookTimeout=60000`, all 94 affected tests passed. This failure was not observed on the preceding commit's `pnpm check`, so it is not claimed as a pre-existing baseline failure.

## Live checks

- OpenAI: **not run**. Live execution, credentials, and billed remote requests were not authorized for this task.
- Anthropic: **not run** for the same reason.
- The manual-only workflow requires an explicit `RUN` confirmation and a protected `api-adapters-live` environment. Actual environment protection and provider behavior remain unverified until an authorized operator runs it.

## Known limits

- The Spanish routes are present and structurally validated but marked `translationStatus: pending`; they preserve the English technical instructions rather than claim an unreviewed translation.
- Fixture and package checks do not establish real model availability, billing behavior, provider-side tool support, or hosted-resource cleanup under live credentials.
- The live harness caps each provider at four requests, two tool-loop steps, one local tool dispatch, and a 30-second configured deadline in CI; a provider that does not request the harmless fixture tool fails the live proof rather than creating false-positive evidence.
