# Contributing to brambo

Thank you for helping improve brambo. Start with a focused issue or discussion, then keep the change small enough to review as one work unit.

## Quick path

1. Install Node `>=24` and pnpm `11.23.0`.
2. Run `pnpm install`.
3. Read [AGENTS.md](AGENTS.md) for architecture and verification rules.
4. Make the smallest change that owns the behavior.
5. Run `pnpm check`, and run `pnpm build && pnpm proof:consumer-install` when package exports or publishable artifacts change.
6. Add a Changeset for user-visible package changes.
7. Open a pull request using the template.

## Releases

Releases use Changesets as the version source. A user-visible change adds a
Changeset; after the Changesets `Version Packages` pull request is merged, the
`Tag Release` workflow validates that every publishable package has the same
version and creates `vX.Y.Z` automatically. That tag starts the release
workflow, which runs the full verification and publishes the exact tagged
artifacts to npm. Do not publish manually from a developer workstation.

## Pull requests

- Explain the user-visible outcome and the boundaries of the change.
- Keep code, tests, and the documentation that explains the behavior together.
- Do not commit secrets, generated `dist/`, or local `.brambo/` state.
- Use Conventional Commits. Do not add AI attribution or `Co-Authored-By` trailers.

## Documentation

English is canonical. Spanish translations live under `docs-site/i18n/es/`. When adding a public documentation page, add the corresponding Spanish route and run `pnpm docs:check`.
