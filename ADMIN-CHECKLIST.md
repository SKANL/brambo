# GitHub administrator checklist

These actions cannot be represented safely by repository files and must be completed by a repository administrator:

- [ ] Configure `main` branch protection: required CI, review count, stale approval policy, and no force pushes.
- [ ] Enable private vulnerability reporting / Security Advisories.
- [ ] Configure the repository Discussions categories and moderation settings.
- [ ] Configure npm trusted publishing for `.github/workflows/release.yml` and the `npm` environment; do not commit an npm token.
- [ ] Set the `NPM_TOKEN` secret only if trusted publishing is not used by the organization.
- [ ] Review CODEOWNERS owners and grant the intended team access.
- [ ] Enable GitHub CodeQL default setup or confirm the workflow has permission to upload results.
- [ ] Enable dependency graph, Dependabot alerts, and secret scanning where available.
- [ ] Require SHA-pinned GitHub Actions globally only after Pages artifact dependencies support transitive SHA pinning; direct workflow actions are currently pinned by commit.
- [x] Keep Scorecard and other externally billed security services disabled; use CodeQL, Dependency Review, Dependabot, and repository-local checks instead.
- [ ] Configure GitHub Pages to use the `github-pages` environment and publish through `.github/workflows/docs.yml`; the workflow builds with `pnpm docs:check` and `pnpm docs:build`, uploads `docs-site/build`, and the deploy job requires only `pages: write` and `id-token: write`.
