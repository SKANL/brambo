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

## Pull requests

- Explain the user-visible outcome and the boundaries of the change.
- Keep code, tests, and the documentation that explains the behavior together.
- Do not commit secrets, generated `dist/`, or local `.brambo/` state.
- Use Conventional Commits. Do not add AI attribution or `Co-Authored-By` trailers.

## Documentation

English is canonical. Spanish translations live under `docs-site/i18n/es/`. When adding a public documentation page, add the corresponding Spanish route and run `pnpm docs:check`.
