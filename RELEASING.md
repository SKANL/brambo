# Brambo Beta Release Policy

**Policy:** Until 1.0, patch releases are the default. Minor releases are reserved for deliberate accumulated milestones, and 1.0 requires an explicit stability decision.

## Versioning

- Before 1.0, the public API may evolve.
- When a release is needed, use a patch for fixes, maintenance, and corrections to flawed designs, even when consumers must migrate.
- Use a minor only for an intentional, accumulated product milestone or capability release.
- Release 1.0 only after an explicit stability decision. After 1.0, incompatible public API changes require a major release.
- The fixed package set always moves together on one version.

## Changesets

- Add a changeset only when a pull request changes published behavior or public API in a consumer-visible way.
- Do not add a changeset for repository-only documentation, tests, maintenance, or internal refactoring.
- Include migration notes for every breaking change, including changes shipped in a 0.x patch.
- Do not add a semantic-version auto-rewrite plugin or workflow. The release intent described here remains authoritative.

## Release milestones

Compatible work may accumulate without publication. The automated Changesets `Version Packages` pull request is a release candidate, not a requirement to publish immediately; merge it only for an intentional milestone.

After that pull request merges, the `Tag Release` workflow validates that publishable packages share one version and creates `vX.Y.Z`. The tag starts the release workflow, which runs verification and publishes the tagged artifacts to npm. Do not publish manually from a developer workstation.

## Review and exceptions

- A release or publication change still uses a pull request and required CI.
- Maintainer review is recommended for high-risk, security, release, and publication changes. This is project guidance; this document does not claim that GitHub enforces it.
- `status:approved` records planning state and is not a universal pull-request gate.
- For an emergency, prefer the narrowest viable pull request with CI and review. Create a retrospective issue afterward when it would preserve useful context or follow-up work.
