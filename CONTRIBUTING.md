# Contributing to brambo

Thank you for helping improve brambo. Keep each change focused, explain its outcome, and make it easy to verify.

## Quick path

1. Install Node `>=24` and pnpm `11.23.0`.
2. Run `pnpm install`.
3. Read the relevant package documentation and tests for architecture and verification context.
4. Use the planning guidance below, then make the smallest change that owns the behavior.
5. Run `pnpm check`, and run `pnpm build && pnpm proof:consumer-install` when package exports or publishable artifacts change.
6. Add a changeset only for a consumer-visible package change.
7. Open a pull request and ensure required CI passes.

## Planning and review

| Change | Planning expectation | Delivery |
| --- | --- | --- |
| Documentation, maintenance, or a focused fix | An issue is optional. | Pull request and required CI. |
| Planned feature, API or behavior change, security change, breaking change, or cross-cutting work | Start with an issue or equivalent planning record. | Pull request and required CI. Maintainer review is recommended for high-risk or security-sensitive work. |
| Emergency change | An issue may follow when a retrospective record would be useful. | Narrow pull request with CI and review. |

`status:approved` is planning metadata, not a universal pull-request gate. Maintainer review is also recommended for release and publication changes, but repository documentation does not claim that GitHub enforces it.

## Pull requests

- Explain the user-visible outcome and the boundaries of the change.
- Keep code, tests, and the documentation that explains the behavior together.
- Do not commit secrets, generated `dist/`, or local `.brambo/` state.
- Use Conventional Commits. Do not add AI attribution or `Co-Authored-By` trailers.

## Releases

[RELEASING.md](RELEASING.md) is the canonical release-policy page. In brief:

- Before 1.0, patch is the default release level, including corrections to flawed designs that require migration.
- Minor releases are reserved for deliberate accumulated milestones; 1.0 requires an explicit stability decision.
- Changesets are only for consumer-visible package changes.
- Release pull requests merge for intentional milestones, not merely because compatible changes accumulated.

Do not publish manually from a developer workstation.

## Documentation

English is canonical. Spanish translations live under `docs-site/i18n/es/`. When adding a public documentation page, add the corresponding Spanish route and run `pnpm docs:check`.
