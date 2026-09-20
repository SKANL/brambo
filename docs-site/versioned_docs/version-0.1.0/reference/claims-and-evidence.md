---
title: Claims and evidence
audience: Developers, maintainers, and reviewers evaluating panda
prerequisites: Familiarity with the public package and documentation surfaces
outcome: Trace public claims to executable repository evidence and identify what remains unverified
scope: Public claims about compatibility, packaging, architecture, API boundaries, sandbox limits, and release provenance
compatibility: Published packages are measured from Node.js >=20; repository development requires Node.js >=24
translationStatus: original
---
# Claims and evidence

This page is the evidence matrix for panda's public claims. It separates an executable repository guarantee from a documented design intention, a measured but bounded result, and an administrative or external fact that this repository cannot prove by itself.

## How to read the matrix

```text
VERIFIED       A test, workflow, or executable proof fails when the claim is violated.
MEASURED       A bounded run exercises the claim, but the result is limited to its stated matrix.
PARTIAL        Repository evidence covers part of the claim; the remaining boundary is explicit.
UNVERIFIED     The repository contains no sufficient executable evidence for the claim.
ADMIN-ONLY     The fact depends on GitHub, npm, registry, or host configuration outside this repository.
```

Paths below are repository-relative. Test names identify the executable clause to inspect; prose in a README or architecture document is context, not a substitute for a failing gate.

## Evidence matrix

| Public claim | Status | Concrete evidence | Boundary or limitation |
| --- | --- | --- | --- |
| **Published Node floor:** publishable packages support Node.js `>=20`. | VERIFIED / MEASURED | `packages/contracts/test/versions.test.ts` checks every package manifest and the `consumer-floor` matrix; `.github/workflows/ci.yml` runs the packed consumer smoke on `20`, `22.13.0`, `22.18.0`, and `24`; `scripts/consumer-smoke.mjs` imports the packed tarballs in a plain Node consumer. | This is the measured package/consumer floor. It is not the repository's development floor, and it does not prove every optional provider on every Node release. |
| **Development Node floor:** repository checks and builds require Node.js `>=24`. | VERIFIED | Root `package.json` declares `engines.node: ">=24"`; `packages/contracts/test/versions.test.ts` checks the root floor against the `build-pack` CI leg; `.github/workflows/ci.yml` builds on Node `24`. | This is a developer/tooling constraint, not a claim that consumers need Node 24. |
| **Consumer packaging:** packed artifacts contain the built public surface and import cleanly outside the repository. | VERIFIED | `scripts/pack-publishable.mjs` packs the declared publishable roster; `packages/session/test/consumer-install.proof.ts` installs packed artifacts in an isolated consumer and checks declarations/runtime; `scripts/consumer-smoke.mjs` exercises plain Node imports; `.github/workflows/ci.yml` runs both the install proof and consumer-floor job. | The proof covers the repository's declared package roster and candidate Node matrix. It does not prove arbitrary bundlers, operating systems, or consumer applications. |
| **Package topology:** package imports flow strictly downward, and the kernel has no runtime package dependency. | VERIFIED | `packages/contracts/test/topology.test.ts` scans every package source import against the declared tier order and drives upward, sibling, unknown-package, and kernel violations; `packages/kernel/test/guard.test.ts` enforces the kernel boundary; package-specific guards add local restrictions. | The universal topology rule and the package-specific guards cover different risks; a package without its own guard is not exempt from the universal test. |
| **Typed errors:** callers can route on stable `PandaError` codes rather than parse messages. | VERIFIED | `packages/contracts/src/errors.ts` defines `PandaError` and `PANDA_ERROR_CODES`; `packages/contracts/test/errors.test.ts` checks the stable shape and naming convention; provider tests such as `packages/workspace-local/test/provider.test.ts` assert real coded failures. | A code is stable only when it is part of the exported contract and its behavior remains covered; free-form error text is not a routing API. |
| **Projection ownership:** panda records ownership in its ledger and does not claim an invented marker namespace inside vendor files. | VERIFIED | `packages/contracts/test/projection.test.ts` rejects the retired marker vocabulary, versions the ledger, and checks target/file/native-location/content-hash authority; `packages/projection/test/ledger.test.ts`, `packages/projection/test/drift.test.ts`, and `packages/projection/test/native-projection.test.ts` exercise ledger, drift, and native-location behavior. | The guarantee is about panda's ownership decisions and writes. It does not mean panda controls files or locations that the vendor does not read. |
| **Sandbox and platform limits:** policy validation is explicit, path containment is checked, and host implementations are tested per platform. | PARTIAL / MEASURED | `packages/contracts/test/sandbox.test.ts` drives policy, capability, path, snapshot, resource-limit, and exact-argv validation; `packages/sandbox-local/test/host-conformance/linux.test.ts`, `macos.test.ts`, and `windows.test.ts` cover host-specific behavior; `.github/workflows/sandbox-conformance.yml` runs the conformance suites on their native substrates. | Panda does **not** claim universal OS-level isolation, unrestricted vendor-process control, or identical enforcement on every host. A host or vendor capability must be treated as unavailable when it cannot be proved. |
| **API surface:** generated API documentation reflects public package entrypoints rather than an invented hand-written inventory. | VERIFIED | `scripts/publishable-packages.json` defines the roster; `scripts/generate-api-docs.mjs` generates TypeDoc output from package entrypoints; `scripts/validate-api-docs.mjs` validates those entrypoints; `docs-site/docs/reference/api.md` describes the generated surface. | Generated HTML is a build artifact and is not itself a source-controlled guarantee. Internal files are not public API merely because they exist. |
| **Release provenance:** the release workflow requests npm provenance and checks the registry result before completing. | PARTIAL | `.github/workflows/release.yml` packs and smoke-tests before publishing, publishes with `--provenance`, and runs `scripts/assert-provenance.mjs`; that script reads registry metadata and distinguishes missing packages from packages published without an attestation. | The repository proves the workflow and checker, not the current public registry state or the configuration of the GitHub/npm accounts that execute it. |

## Unverified and admin-only claims

The following statements must not be presented as repository-proven facts unless their external evidence is attached:

- **ADMIN-ONLY:** GitHub branch protection, required reviewers, environment approvals, secret storage, or required status checks are configured as intended.
- **ADMIN-ONLY:** The npm organization, package access policy, publishing identity, two-factor policy, and trusted-publisher relationship are configured as intended.
- **ADMIN-ONLY:** A particular public release is live, complete, and associated with the intended commit. The release workflow can check its own steps, but registry state still requires the registry assertion.
- **UNVERIFIED:** Any OS-level sandbox guarantee stronger than the platform-specific conformance evidence above.
- **UNVERIFIED:** Vendor executor behavior, authentication, rate limits, or permission defaults outside panda's adapter and contract tests.

## Review rule

When a public statement changes, update the claim and its concrete evidence together. If no executable gate can enforce the statement, label it `PARTIAL`, `UNVERIFIED`, or `ADMIN-ONLY` instead of upgrading prose into a guarantee.
