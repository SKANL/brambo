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

The main-push `Changesets` workflow maintains the release candidate with `pnpm version-packages`. Its final step reads immutable main-push Git objects, validates the complete fixed package set and BRAMBO_VERSION, and requires a first-parent semver advance. Generated Changesets working-tree versions never authorize tagging. If that committed version's tag does not exist, it creates `vX.Y.Z` and explicitly dispatches `release.yml` at the tag. The `Release` workflow also accepts tag pushes; the explicit dispatch avoids relying on a tag created with GitHub's workflow token to trigger another workflow.

An existing release tag must point to the exact immutable release commit; a conflicting target fails closed and is never automatically deleted or rewritten. An unchanged main version exits before any tag lookup or release dispatch.

**Publication boundary:** merging a version-changing release PR can create the tag and dispatch npm publication automatically. Review the complete release candidate and all required checks BEFORE merging it; merging is not a preparation-only action. Do not create the tag, dispatch the release workflow, or publish manually from a developer workstation.

The tagged release workflow re-runs source checks, build, packed consumer smoke and consumer-install proof, verifies manifest/tag agreement, and publishes through the configured `npm` environment. Successful local preparation does not prove environment approval, credentials, registry upload, provenance or publication. The registry assertion and GitHub Release creation provide post-publication evidence.

## Review and exceptions

- A release or publication change still uses a pull request and required CI.
- Maintainer review is recommended for high-risk, security, release, and publication changes. This is project guidance; this document does not claim that GitHub enforces it.
- `status:approved` records planning state and is not a universal pull-request gate.
- For an emergency, prefer the narrowest viable pull request with CI and review. Create a retrospective issue afterward when it would preserve useful context or follow-up work.

## Finalizing an already-published release

If npm artifacts are already present but a post-publication registry check failed, do not rerun the publication job. Dispatch `release-finalize.yml` **from main** with the existing tag (for example `v0.5.0`). This recovery workflow has no npm credentials, publication command or tag-write step. It preserves the original failed run as history and creates a separate verifiable finalization run.

It checks the existing remote tag target and main ancestry, re-runs all tagged source/build/packed consumer gates, and verifies all 28 exact public npm versions, `latest`, tarball SHA-512 integrity and fresh installations/imports before creating the GitHub Release and attaching `CHANGELOG.md`. A registry failure prevents GitHub Release creation. A conflicting or existing GitHub Release stops for explicit inspection rather than overwriting it. Registry publication and provider/model qualification are not performed by finalization.

## Documentation snapshot

The documentation site serves `current` (the `main` branch) as its default version, labeled with the active package line (for example `0.5.x`). No frozen snapshot exists until one is cut from a release tag.

To freeze the documentation for a published release, after the release tag `vX.Y.Z` exists:

1. Check out the tag on a branch from `main` (never edit the tag itself).
2. From `docs-site/`, run `pnpm docusaurus docs:version X.Y.Z`, then copy `i18n/es/docusaurus-plugin-content-docs/current/` to `i18n/es/docusaurus-plugin-content-docs/version-X.Y.Z/`.
3. Bring the generated `versioned_docs/`, `versioned_sidebars/`, `versions.json` and Spanish `version-X.Y.Z/` tree back to `main` in a pull request, and set the `current` label in `docusaurus.config.ts` to the next package line.
4. Run `pnpm docs:validate-versions`; it requires every snapshot page to be byte-identical to the documentation at tag `vX.Y.Z`.
