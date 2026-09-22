# Changesets

Add a changeset only when a pull request changes consumer-visible published behavior or public API. Do not add one for repository-only documentation, tests, maintenance, or internal refactoring.

Use `pnpm changeset` and write a concise release note. The fixed package set moves together, and breaking changes require migration notes even for 0.x patches.

See the canonical [Brambo beta release policy](../RELEASING.md) for versioning, exceptions, and release milestones.
