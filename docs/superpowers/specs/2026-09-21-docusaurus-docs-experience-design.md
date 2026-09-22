# Brambo documentation experience design

## Status

Approved by the maintainer on 2026-09-21. Implementation may proceed according to this design and its reviewed implementation plan.

## Problem and outcome

Brambo's documentation is technically grounded but makes new developers reconstruct its architecture and capabilities across a minimal landing page, prose-heavy explanations, and incomplete package navigation. It also contains stale release/version statements that can make a published SDK appear unavailable. The outcome is a truthful, release-aware, bilingual developer portal that helps SDK consumers, extension authors, and contributors complete common tasks and understand Brambo's boundaries without reverse-engineering the repository first.

## Evidence observed

- The public GitHub issue [#40](https://github.com/SKANL/brambo/issues/40) requests synchronizing stale release/version claims, the docs snapshot, bug-report placeholder, and package count.
- `npm view @brambodev/session version dist-tags.latest --json` returned `0.3.0` / `0.3.0` during discovery. The repository has the `v0.3.0` Git tag. The current workspace manifests are all `0.3.1`, so current source docs represent a later workspace state than the published registry version.
- `scripts/publishable-packages.json` contains 19 packages. `README.md` currently says sixteen packages at `0.1.0`; `docs-site/versions.json` contains only `0.1.0`.
- `docs-site` is on Docusaurus 3.10.2, has English and Spanish locales, local search, edit links, strict broken-link handling, and an existing documentation validation pipeline.
- The home page in `docs-site/src/pages/index.tsx` is a title/tagline/button shell; `docs-site/src/css/custom.css` only defines a primary color. `docs-site/sidebars.ts` lists 16 package pages. The architecture guide relies on ASCII diagrams.
- Comparing the current docs tree with `v0.3.0` shows newer sandbox documentation has landed after that tag. Therefore, copying current docs into a `0.3.0` archive would misrepresent the released documentation.

## Goals

1. Resolve issue #40 without confusing the current published release (`0.3.0`) with the local next workspace (`0.3.1`).
2. Establish a release-snapshot procedure whose archived content is sourced from the release tag, while current unreleased documentation remains visibly marked as next.
3. Reorganize navigation around reader tasks and cover all 19 publishable packages.
4. Improve the first-run path, conceptual model, API/package discovery, troubleshooting, and contribution workflow.
5. Create a distinct, responsive visual system that supports both color modes and preserves accessibility.
6. Use Docusaurus features where they directly improve learning: Mermaid diagrams, native MDX tabs/admonitions/code blocks, version navigation, localized content, local search, SEO metadata, and edit links.
7. Preserve truthful security and capability claims; documentation examples must match shipped contracts and tests.

## Non-goals

- Changes to runtime packages, public SDK contracts, sandbox enforcement, executor behavior, registry behavior, or release publication.
- Replacing Docusaurus or adding a separate docs hosting platform.
- Adding a blog solely to exercise a Docusaurus feature.
- Querying npm during normal docs builds or making builds depend on live registry/network state.
- Claiming all platform sandbox behaviors are enforced when current providers cannot prove them.

## Release and versioning design

### Version truth

- Treat `0.3.0` as the published stable docs version because the live registry reports it as `latest` and the repository has tag `v0.3.0`.
- Treat the current workspace's `0.3.1` package manifests as a next/unreleased source state unless the registry/tag evidence changes before implementation.
- Do not hardcode a package count or an install version in prose when a durable link or generated validation can serve the reader better.
- Keep `npm install @brambodev/session` unpinned in the getting-started path and link to npm/release details for exact versions. Ask bug reporters for the output of `brambo --version` (or the package version field), rather than a stale example placeholder.

### Docusaurus version model

- Retain release-based versioning because users need documentation corresponding to published package versions, but keep only supported/relevant snapshots.
- Rebuild the `0.3.0` archive from the documentation sources at Git tag `v0.3.0`, not from today's `docs-site/docs` tree and not by merely renaming the old `0.1.0` folder.
- Keep current `docs/` sources as the next workspace documentation, visibly labeled `Next`/unreleased. Configure the docs plugin so normal docs navigation defaults to the latest published snapshot (`0.3.0`) while the next version remains browsable.
- Remove the false `0.1.0` archive only after confirming its routes/content have been represented by the correctly reconstructed `0.3.0` snapshot. Preserve stable route redirects or links if existing external routes require them; do not silently strand users.
- Establish a release checklist/script or validator that verifies versioned-doc labels correspond to real Git release tags and that the docs default is the latest published version. The normal `docs:check` must remain deterministic and offline; the release/tag comparison may be an explicit release-time check.

The Docusaurus versioning guide cautions that versioning adds build and maintenance complexity and recommends it only when separate historical docs are useful. Brambo qualifies for a small release history; it does not need every patch snapshot if docs did not change.

## Information architecture

Organize the portal by what a developer is trying to do, rather than mirroring repository directories:

1. **Start here** — what Brambo is, supported Node/runtime floor, install, first session, and next steps.
2. **Build with Brambo** — host integration, configuration/provenance, executor selection, workspaces, memory, delegation/orchestration, tools, and troubleshooting.
3. **Extend Brambo** — author an executor adapter, workspace provider, tool provider, skill source, memory provider, or sandbox provider; contract suite and package boundaries.
4. **Understand the system** — architecture, runtime/session lifecycle, registry-to-projection data flow, ownership ledger, security model and explicit non-guarantees.
5. **Reference** — public API, errors, configuration keys/layers, capabilities, CLI commands, package map (all 19 publishable packages), and release compatibility.
6. **Contribute** — repository setup, test commands, docs workflow/locales, coding conventions, and release process.

Existing content should be reorganized and expanded in place when that preserves useful links. New English pages must have Spanish counterparts and the expected route, heading, and code-fence parity required by `scripts/validate-docs.mjs`.

## Content requirements

- Rewrite the home page as a clear product entry point: concise value proposition; primary SDK quickstart; task/persona cards; a system diagram; safety/guarantee callout; and links to package/API reference and contribution docs.
- Make the quickstart genuinely executable: prerequisites, install, minimum code, expected result, cleanup/cancellation behavior, and a failure/troubleshooting path. Keep Node consumer support (>=20) distinct from repository development (>=24).
- Replace high-level ASCII architecture pictures with accessible Mermaid diagrams for (a) session composition/execution/cleanup and (b) canonical registry → ingest → projection target/ledger. Add accompanying prose and text alternatives so the diagram is not the only explanation.
- Add practical tutorials that build incrementally: first session, layered configuration, selecting executor/workspace, authoring an adapter/provider, policy and tool execution, sandbox evidence/limits, consumer install, and diagnosing failures. Do not promise unsupported platform isolation.
- Document every publishable package in a package map generated or validated from `scripts/publishable-packages.json` and each package manifest. Describe purpose, public entry surface, key dependencies, intended consumer, and links to detailed guides. Avoid claiming every package is an end-user feature.
- Use Docusaurus native Tabs for materially different commands/platforms and code examples; use titles/highlights to orient readers. Use admonitions for cautions, constraints, and tips—not to decorate ordinary prose.
- Add explicit facts/limitations to security and sandbox pages, including exact-argv behavior, injected remote transport boundaries, capability evidence, and provider-specific non-guarantees.
- Add page descriptions, useful titles, meaningful image alt text, and appropriate metadata for search and social previews. Keep local search and its EN/ES indexing.

## Visual and interaction design

- Develop a small visual system in the existing classic theme: design tokens for spacing, typography, surface/background, borders, focus, and Brambo accent colors; corresponding light/dark values; readable content width and hierarchy; responsive navigation and content cards.
- Design a strong landing-page hero and consistent cards/steps/callouts. Prefer theme-supported components and CSS modules/custom CSS; avoid ejecting theme components. Swizzle only if CSS and supported config cannot deliver the necessary behavior.
- Render Mermaid with the official `@docusaurus/theme-mermaid` theme and configure readable light/dark Mermaid palettes. This adds a docs-only dependency and should be limited to diagram use that materially clarifies architecture.
- Ensure focus visibility, keyboard access, reduced-motion respect, semantic heading order, sufficient contrast, meaningful link text, diagram text alternatives, and mobile readability.
- Keep the local search implementation; improve search entry discoverability and verify keyboard operation rather than adding a second search provider.

## Architecture and change boundaries

The work stays within the documentation site and its validators. Likely areas:

- `README.md`, `.github/ISSUE_TEMPLATE/bug_report.yml` — resolve #40.
- `docs-site/docusaurus.config.ts`, `docs-site/versions.json`, versioned English/Spanish docs and sidebars — release-aware version model and Mermaid theme.
- `docs-site/sidebars.ts`, `docs-site/src/pages/index.tsx`, `docs-site/src/css/custom.css`, optionally page-scoped components/styles — information architecture and visual system.
- `docs-site/docs/**`, `docs-site/i18n/es/docusaurus-plugin-content-docs/current/**` — complete, bilingual content.
- `scripts/validate-docs.mjs` and a focused docs/package/version validator if required — prevent route, coverage, and stale-version regressions.
- `docs-site/package.json`, `pnpm-lock.yaml` — add only the official Mermaid theme if approved by the implementation plan.
- `package.json` / `.github/workflows/docs.yml` only if an offline deterministic validator needs wiring into existing docs gates.

Do not update historical snapshots to current implementation claims. Versioned pages and current pages must remain distinct sources when their release contents differ.

## Acceptance criteria

1. Issue #40's inaccurate “unreleased/unpublished 0.1.0” claim is gone from consumer-facing install docs; README links readers to the published package and release/tag information without a hardcoded package count.
2. The bug report template requests a reproducible version value without a stale package-version example.
3. The `0.3.0` archived docs are reconstructed from `v0.3.0`; current `0.3.1`-workspace docs are clearly labeled next/unreleased and not served as stable docs by default.
4. A check detects docs references/version snapshot entries without matching published release/tag evidence; regular docs checks remain deterministic and offline.
5. Navigation covers the six task-oriented areas above and every publishable package is represented exactly once in the package catalog/navigation as intended.
6. The homepage materially improves discovery and conveys Brambo's use case, SDK path, architectural model, and honest safety boundaries.
7. Architecture diagrams render in both color modes and are accompanied by text explanations/alternatives.
8. New/modified documentation preserves the existing English/Spanish structure and all Docusaurus docs validators pass.
9. `pnpm docs:check`, docs-site typecheck, docs build, and `git diff --check` pass. A visual review checks desktop and mobile plus light/dark mode; a keyboard/contrast/accessibility review is recorded.
10. No runtime package or public API behavior changes.

## Verification approach

- Run the existing docs validators first to identify baseline failures before changing content.
- Add focused tests for any validator expansion (package coverage/version validation) before implementation.
- Run `pnpm docs:check`, `pnpm --filter brambo-docs typecheck`, and `pnpm docs:build`; inspect generated routes/version selector and search results.
- Run a local site and perform screenshot-based visual review at desktop/mobile sizes and in light/dark modes. Verify keyboard navigation and reduced motion.
- Run `git diff --check` and review all source/docs changes; ensure no package runtime behavior or claims changed inadvertently.

## Risks and mitigations

- **False historical docs:** source the archive directly from `v0.3.0` and verify locale content rather than renaming current files.
- **Release drift recurring:** avoid hardcoded prose, add deterministic validators and release checklist guidance.
- **Scope/translation cost:** limit first pass to the core journeys and keep route parity requirements explicit; prioritize accurate content over decorative breadth.
- **Visual regression or theme coupling:** use classic theme config and CSS first; keep custom components small, accessible, and isolated.
- **Security claim inflation:** require every security statement to link to a contract/provider test or clearly label it as an inference/limitation.
- **Route churn:** preserve existing IDs/permalinks where possible and validate links/redirects before removing old routes.

## Research references

- [GitHub issue #40](https://github.com/SKANL/brambo/issues/40)
- [Docusaurus versioning](https://docusaurus.io/docs/versioning)
- [Docusaurus sidebar/autogeneration](https://www.docusaurus.io/docs/sidebar)
- [Docusaurus diagrams/Mermaid](https://www.docusaurus.io/docs/markdown-features/diagrams)
- [Docusaurus code blocks and tabs](https://docusaurus.io/docs/markdown-features/code-blocks)
- [Docusaurus styling and layout](https://current.docusaurus.io/docs/styling-layout)
- [Docusaurus SEO](https://current.docusaurus.io/docs/seo)
