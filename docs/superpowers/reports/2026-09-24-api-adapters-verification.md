# API adapter release-surface verification

## Deterministic checks

| Command | Observed result |
| --- | --- |
| `pnpm check` | Exit 0: workspace typecheck, deterministic tests, six live-guard tests, and ESLint passed. |
| `pnpm build` | Exit 0: package builds and both Docusaurus locales passed. |
| `pnpm proof:consumer-install` | Exit 0: adapter API packed/offline consumer proof 1/1; session consumer proof 13 passed, 1 skipped. |
| `pnpm docs:check` | Exit 0: 23 TypeDoc entrypoints, 51 English and 51 Spanish routes, 14 documentation tests, links, metadata, and executable fake-provider examples passed. |
| `pnpm --filter brambo-docs build` | Exit 0: English and Spanish production builds passed after the final guide edits. |
| `pnpm exec changeset status` | Exit 0: changesets resolve the three new API packages and public contract changes. |
| `pnpm --dir packages/adapter-api pack --pack-destination $dest`; repeated for `packages/adapter-openai` and `packages/adapter-anthropic` | All three tarballs contained package metadata, README, JavaScript entrypoint, and declarations; adapter-api also contained its `./testing` entrypoint. |
| `pnpm test:api-live` without opt-in | Exit 0 with explicit skip diagnostic; no provider request launched. |
| Direct OpenAI and Anthropic live Vitest files without opt-in | Each reported one skipped test; no provider request launched. |

The initial `pnpm check` failed only because the new live suites and publishable packages were absent from the repository's explicit roster/count tests. The initial consumer proof failed because its bundle-surface golden table lacked the three packages and changed contracts export count. Those expectations were updated to observed values; subsequent full runs passed. These were task-induced failures, not claimed pre-existing baseline failures.

## Live checks

- OpenAI: **not run**. Live execution, credentials, and billed remote requests were not authorized for this task.
- Anthropic: **not run** for the same reason.
- The manual-only workflow requires an explicit `RUN` confirmation and a protected `api-adapters-live` environment. Actual environment protection and provider behavior remain unverified until an authorized operator runs it.

## Known limits

- The Spanish routes are present and structurally validated but marked `translationStatus: pending`; they preserve the English technical instructions rather than claim an unreviewed translation.
- Fixture and package checks do not establish real model availability, billing behavior, provider-side tool support, or hosted-resource cleanup under live credentials.
- The live harness caps each provider at four requests, two tool-loop steps, one local tool dispatch, and a 30-second configured deadline in CI; a provider that does not request the harmless fixture tool fails the live proof rather than creating false-positive evidence.
