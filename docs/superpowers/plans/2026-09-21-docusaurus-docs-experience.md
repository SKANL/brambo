# Release-Aware Docusaurus Documentation Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve issue #40 and turn Brambo's English/Spanish Docusaurus site into an accurate, complete, approachable, and visually polished developer documentation experience.

**Architecture:** Keep Docusaurus 3 and the existing bilingual content/validation pipeline. Use package manifests and release tags as sources of truth, preserve stable routes where possible, and make coverage checks prevent docs drift. Improve the content architecture and styling with built-in Docusaurus features before adding dependencies.

**Tech Stack:** Docusaurus 3.10.2, React, TypeScript, Markdown/MDX, CSS, pnpm, Vitest, Mermaid through the official Docusaurus integration.

**Spec:** `docs/superpowers/specs/2026-09-21-docusaurus-docs-experience-design.md`

## Global Constraints

- Preserve English and Spanish route parity and the existing page frontmatter contract.
- Treat `v0.3.0` as the latest published stable release and current `0.3.1` workspace docs as the unreleased `Next` version.
- Do not hardcode package counts or stale unreleased versions in README/docs; derive coverage from package manifests.
- Reconstruct the `0.3.0` version snapshot from the `v0.3.0` Git tag, not from newer current docs.
- Preserve existing useful routes and local search; do not add a blog or external runtime dependency for visuals.
- Keep source docs and developer-facing instructions in English with complete, professionally translated Spanish counterparts.
- Keep the documentation validator's required metadata, locale parity, heading-depth, and code-fence checks passing.

## Review Focus

- A missing or newly added publishable package must fail docs coverage validation instead of silently drifting; test with a manifest-derived expected set and a simulated missing page.
- A package directory that is private/non-publishable must not be required in public docs; test coverage against the publishable manifest source.
- Historical docs must not accidentally include post-0.3.0 behavior; verify version snapshot content against `git show v0.3.0:<path>`.
- Spanish pages must retain the same routes, metadata structure, heading hierarchy, and code examples as English; run the existing bilingual validator after each content batch.
- Visual enhancements must remain usable in light/dark themes, narrow viewports, and keyboard navigation; verify rendered pages in both themes and at desktop/mobile widths.

---

## File Map

| Path | Responsibility |
|---|---|
| `README.md` | Accurate release/install links without brittle version/package-count claims. |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | Reproducible, version-aware issue intake. |
| `docs-site/docusaurus.config.ts` | Locale, version, Mermaid, navbar, footer, SEO, and theme configuration. |
| `docs-site/sidebars.ts` | Task-oriented documentation information architecture. |
| `docs-site/src/pages/index.tsx` | High-impact documentation landing page and entry points. |
| `docs-site/src/css/custom.css` | Accessible visual system and responsive site styling. |
| `docs-site/docs/**` | English current guides, tutorials, package references, and diagrams. |
| `docs-site/i18n/es/docusaurus-plugin-content-docs/current/**` | Spanish current docs with route and structure parity. |
| `docs-site/versioned_docs/version-0.3.0/**` | Archived content copied from the release tag. |
| `docs-site/versioned_sidebars/version-0.3.0-sidebars.json` | Sidebar snapshot matching the archived 0.3.0 docs. |
| `docs-site/versions.json` | Version selector order and stable/Next versions. |
| `scripts/validate-docs.mjs` | Bilingual metadata, route, heading, and code structure validation; extend only if a concrete coverage check belongs here. |
| `scripts/docs-validation.test.mjs` | Docs-tooling regression tests for package coverage and release-version validation, using Node's built-in test runner. |
| `scripts/validate-doc-versions.mjs` | Explicit release-time check that versioned docs correspond to release tags; must not add network dependence to ordinary docs checks. |
| `.github/workflows/release.yml` | Invoke the explicit version/tag validation with complete tag history before publication. |

## Implementation Tasks

### Task 1: Repair Issue #40's release and issue-reporting accuracy

**Files:**
- Modify: `README.md`
- Modify: `.github/ISSUE_TEMPLATE/bug_report.yml`

- [x] **Step 1: Record the required observable behavior.** README must direct users to live release/install sources instead of a stale unreleased version or fixed package count; the bug form must collect the installed package/CLI version and reproduction details.
- [x] **Step 2: Update README release guidance and bug template.** Link to GitHub Releases and/or npm package pages; request the relevant `--version` output or package version, plus environment and minimal reproduction steps.
- [x] **Step 3: Verify the edits against the issue's failure cases.** Search changed user-facing text for stale `0.1.0` latest claims and hardcoded package counts, then inspect the bug template to confirm it asks for version and reproduction information; expected: no stale release claim and reporters can identify the affected release.

### Task 2: Make package documentation coverage manifest-driven

**Files:**
- Modify: `scripts/validate-docs.mjs`
- Create: `scripts/docs-validation.test.mjs`
- Modify: root `package.json`
- Modify: `docs-site/sidebars.ts`
- Create/Modify: English package pages under `docs-site/docs/**`
- Create/Modify: matching Spanish package pages under `docs-site/i18n/es/docusaurus-plugin-content-docs/current/**`

- [x] **Step 1: Add a failing docs-tooling test using Node's built-in test runner.** Extract the package coverage comparison into a small pure helper; prove that a missing publishable package is reported and a non-publishable package is ignored.
- [x] **Step 2: Run only the focused test to confirm it detects missing pages.** Run `node --test scripts/docs-validation.test.mjs`; expected: the new missing-package assertion fails before the helper is wired into docs validation.
- [x] **Step 3: Add reference pages for the missing publishable packages.** Add the delegation, orchestration, and provenance package guides, with purpose, public surface, minimal usage, extension points, constraints, and links to relevant tutorials. Match the page metadata contract.
- [x] **Step 4: Add corresponding Spanish pages and sidebar entries.** Keep the same route IDs, heading hierarchy, examples, and parity metadata; translate terminology consistently.
- [x] **Step 5: Re-run coverage and bilingual validation.** Run `node --test scripts/docs-validation.test.mjs` and `pnpm docs:check`; expected: every publishable package is documented and EN/ES route/structure parity passes.

### Task 3: Correct the release selector and archive the real 0.3.0 documentation

**Files:**
- Modify: `docs-site/versions.json`
- Create/Modify: `docs-site/versioned_docs/version-0.3.0/**`
- Create/Modify: `docs-site/i18n/es/docusaurus-plugin-content-docs/version-0.3.0/**`
- Create/Modify: `docs-site/versioned_sidebars/version-0.3.0-sidebars.json`
- Create/Modify: `docs-site/i18n/es/docusaurus-plugin-content-docs/version-0.3.0.json` (only if Docusaurus locale metadata requires a versioned label)
- Modify: `docs-site/docusaurus.config.ts`

- [x] **Step 1: Capture the release-tag docs inventory and both locale source trees.** Use `git ls-tree -r --name-only v0.3.0 -- docs-site/docs docs-site/sidebars.ts docs-site/i18n/es/docusaurus-plugin-content-docs/current`; obtain each archived English and Spanish file from `git show v0.3.0:<path>`, not current workspace docs.
- [x] **Step 2: Replace the false 0.1.0 snapshot with authentic 0.3.0 English and Spanish snapshots.** Copy content from the release tag without copying post-tag changes. Generate the version sidebar from the 0.3.0 sidebar/content and preserve old URLs where Docusaurus permits.
- [x] **Step 3: Configure version display intentionally.** Set the published `0.3.0` snapshot as the stable version and the current 0.3.1 workspace docs as `Next`; do not label unreleased content as a published npm release.
- [x] **Step 4: Build the site and inspect selector behavior.** Run `pnpm docs:build`; expected: both `Next` and `0.3.0` render, all docs links resolve, and the historical snapshot contains no post-tag changes.

### Task 4: Build clear developer journeys and actionable guides

**Files:**
- Modify: `docs-site/sidebars.ts`
- Modify: `docs-site/docs/tutorials/first-session.md`
- Modify: `docs-site/i18n/es/docusaurus-plugin-content-docs/current/tutorials/first-session.md`
- Modify: `docs-site/docs/guides/install.md`
- Modify: `docs-site/i18n/es/docusaurus-plugin-content-docs/current/guides/install.md`
- Modify: `docs-site/docs/how-to/create-adapter.md`
- Modify: `docs-site/i18n/es/docusaurus-plugin-content-docs/current/how-to/create-adapter.md`
- Modify: `docs-site/docs/how-to/use-workspace-provider.md`
- Modify: `docs-site/i18n/es/docusaurus-plugin-content-docs/current/how-to/use-workspace-provider.md`
- Create: `docs-site/docs/guides/configuration.md`
- Create: `docs-site/i18n/es/docusaurus-plugin-content-docs/current/guides/configuration.md`
- Create: `docs-site/docs/guides/executors-and-workspaces.md`
- Create: `docs-site/i18n/es/docusaurus-plugin-content-docs/current/guides/executors-and-workspaces.md`
- Create: `docs-site/docs/guides/tools-and-sandbox.md`
- Create: `docs-site/i18n/es/docusaurus-plugin-content-docs/current/guides/tools-and-sandbox.md`
- Modify: `docs-site/docs/reference/troubleshooting.md`
- Modify: `docs-site/i18n/es/docusaurus-plugin-content-docs/current/reference/troubleshooting.md`

- [x] **Step 1: Establish user journeys and route map.** Guide new users from installation to a first real session, and guide plugin authors from public contracts to implementation and verification. Provide clear prerequisites, expected outcomes, next steps, and links to generated API/package references.
- [x] **Step 2: Strengthen first-session and installation docs.** Explain the supported package install paths, runnable minimal examples, workspace setup, configuration inputs, failure modes, and how to confirm the installed release. Keep code/examples aligned with the current public API and pin versioned stable docs separately.
- [x] **Step 3: Add configuration, executor/workspace, and tools/sandbox guides.** Document actual configuration keys/defaults and supported executor/workspace choices. Explain that local/remote MCP tools are invoked through explicit sandbox/session boundaries, describe capability/enforcement limits, and distinguish API contracts from available built-in implementations.
- [x] **Step 4: Improve adapter and workspace-provider how-tos.** Give extension authors ordered steps, type-correct examples, lifecycle/cleanup expectations, tests to add, and links to package pages. Avoid claiming unexported or unsupported extension points.
- [x] **Step 5: Turn troubleshooting into diagnosis paths.** Organize by observable symptom/error code, likely cause, evidence to collect, and safe next action; link each diagnosis to the relevant guide/reference.
- [x] **Step 6: Organize the sidebar by task and progressive disclosure.** Separate Learn, Guides, How-to, Concepts, Package reference, API, and Troubleshooting while retaining stable route IDs and English/Spanish parity.
- [x] **Step 7: Validate documentation integrity.** Run docs coverage/i18n tests, `pnpm docs:check`, and `pnpm docs:build`; expected: all routes resolve, EN/ES route and structure checks pass, examples match current exports, and production MDX build succeeds.

### Task 5: Use Docusaurus-native rich documentation features

**Files:**
- Modify: `docs-site/docusaurus.config.ts`
- Modify: relevant English and Spanish Markdown/MDX guides from Task 4

- [x] **Step 1: Enable Mermaid through Docusaurus' supported Markdown diagram integration.** Use the Docusaurus 3-compatible Mermaid theme dependency/configuration only if not already present; keep it pinned using the repository's package-manager conventions.
- [x] **Step 2: Add a session lifecycle diagram and a registry ingestion-to-projection/ledger diagram.** Use Mermaid source, descriptive captions/alt text, and adjacent prose that explains the important transitions and boundaries.
- [x] **Step 3: Use built-in tabs for equivalent npm/pnpm and TypeScript/JavaScript examples where the choice matters.** Use admonitions for warnings, compatibility, security/sandbox boundaries, and version notes; add heading anchors and concise in-page navigation on long guides.
- [x] **Step 4: Provide translated/parallel diagrams and instructional content.** Keep visual meaning equivalent in both locales and ensure code samples stay structurally aligned.
- [x] **Step 5: Validate Mermaid and MDX in production build.** Run `pnpm docs:build`; expected: no MDX parse errors and both diagrams render in generated pages.

### Task 6: Deliver a polished, responsive, accessible documentation landing experience

**Files:**
- Modify: `docs-site/src/pages/index.tsx`
- Modify: `docs-site/src/css/custom.css`
- Modify: `docs-site/docusaurus.config.ts`

- [x] **Step 1: Add a clear hero and prioritized calls to action.** Introduce Brambo in one sentence, link to quick start and architecture, and include a secondary API/reference route.
- [x] **Step 2: Build visual feature/pathway cards from real docs routes.** Make the landing page useful for first-time adopters and extension authors without duplicating the entire sidebar.
- [x] **Step 3: Establish a responsive design-token layer.** Style light/dark color tokens, typography, spacing, card surfaces, code blocks, navbar, footer, active navigation, and focus states; use CSS variables compatible with Docusaurus theme modes.
- [x] **Step 4: Add restrained visual hierarchy and motion.** Use gradients/texture only where they support hierarchy; respect `prefers-reduced-motion`, avoid layout shifts, and do not introduce remote asset/runtime requirements.
- [x] **Step 5: Verify layout and keyboard/accessibility behavior.** Run typecheck/build, then inspect the landing page and representative guide at desktop and mobile widths, in light and dark themes, including keyboard focus and reduced motion.

### Task 7: Improve discovery metadata and developer-facing quality gates

**Files:**
- Modify: `docs-site/docusaurus.config.ts`
- Modify: `scripts/validate-docs.mjs`
- Modify: root `package.json`
- Modify: `scripts/docs-validation.test.mjs`
- Create: `scripts/validate-doc-versions.mjs`
- Modify: `.github/workflows/release.yml`

- [x] **Step 1: Configure useful page metadata and social/SEO defaults.** Add a consistent site title template, canonical/base URL correctness, descriptions, and social preview metadata without inventing unsupported product claims.
- [x] **Step 2: Ensure generated package coverage validation runs from the existing docs-check workflow.** Keep errors actionable by listing the missing or unexpected package-to-page mappings.
- [x] **Step 3: Add regression cases for locale parity, package coverage, and required metadata.** Cover missing English page, missing Spanish counterpart, malformed required frontmatter, and a private package exclusion using the existing validator's extracted pure helpers or temporary fixture directories.
- [x] **Step 4: Implement an explicit offline release-tag consistency check.** `scripts/validate-doc-versions.mjs` must compare `versioned_docs/version-<version>` and `docs-site/versions.json` against local `v<version>` tags, fail with actionable missing/mismatched paths, and require no network. Keep it out of routine `docs:check`; invoke it in release validation after ensuring tags are fetched.
- [x] **Step 5: Add focused tag-validator tests and wire the test runner into docs checks.** Test an existing tag, missing tag, missing snapshot, and a `Next` version that must not be treated as published. Add `node --test scripts/docs-validation.test.mjs` to the deterministic offline `docs:check` chain.
- [x] **Step 6: Wire the explicit version/tag check into release validation.** Update `.github/workflows/release.yml` to fetch complete tag history and run `node scripts/validate-doc-versions.mjs` before publication; do not add npm/network lookups.
- [x] **Step 7: Run the complete documentation quality gates.** Run `pnpm docs:check`, `pnpm --filter brambo-docs typecheck`, `pnpm docs:build`, the release-tag validator against the available full tag set, and `git diff --check`; expected: all pass with the published snapshot and current `Next` version both buildable.

## Final Acceptance

- Issue #40 is addressed: README no longer makes the stale release claim, bug reports capture actual version, and version selector reflects real releases.
- Every publishable package has current EN/ES reference documentation; non-publishable packages are not required.
- Historical 0.3.0 docs reproduce the release tag rather than current docs.
- First-run and extension journeys explain prerequisites, outcomes, public API boundaries, and troubleshooting.
- Docusaurus-native diagrams/tabs/admonitions improve comprehension without unnecessary plugins or remote runtime dependencies.
- Homepage and docs chrome feel intentional, responsive, accessible, and coherent in both themes.
- All relevant commands in Task 7 pass; no unresolved broken links or locale structure drift remain.

## Docusaurus References

- [Versioning](https://docusaurus.io/docs/versioning) — snapshot maintenance and version labels/defaults.
- [Diagrams with Mermaid](https://www.docusaurus.io/docs/markdown-features/diagrams) — supported Mermaid integration and configuration.
- [Code blocks, tabs, and MDX](https://docusaurus.io/docs/markdown-features/code-blocks) — native presentation for equivalent command/code variants.
- [Styling and layout](https://current.docusaurus.io/docs/styling-layout) and [SEO](https://current.docusaurus.io/docs/seo) — theme-aware styles and page metadata.

## Delivery Notes

- Keep the implementation in one writer's hands; tasks are ordered because issue/version source-of-truth decisions affect the docs navigation and examples.
- Use small, reviewable commits after each independently passing task if repository policy permits; do not commit until the native review lifecycle has selected the intended untracked design/plan files and validated the candidate.
- After implementation, run a fresh bounded review only through the repository's native review lifecycle; never bypass missing intended-untracked selection by inventing selectors or staging artifacts early.
