---
title: Package status
audience: Developers choosing which brambo packages to depend on
prerequisites: None
outcome: Know what Stable, Experimental and Frozen mean and which evidence backs each package's badge
scope: Status badges of the 28 packages in 0.5.x
compatibility: All 0.5.x packages
translationStatus: original
---

# Package status

Every package page carries one status badge. The badge is a claim about evidence, not about quality or popularity. brambo is pre-1.0 for every status: breaking changes remain possible and are called out in the changelog.

## Definitions

| Status | Meaning | Evidence required |
|---|---|---|
| Stable | The surface is expected to hold; changes are deliberate and documented. | The package's own test suite passes in CI; its port's contract suite runs against it where one exists; brambo's own session or CLI path exercises it. |
| Experimental | Tested and usable, but the surface may still change. | The package's own test suite passes in CI. It lacks at least one Stable criterion: an in-repo consumer on the session/CLI path, or platform evidence (for example host conformance that CI does not run). |
| Frozen | Kept working, not developed. | Verified protocol defects are fixed with a failing-then-passing test; no new features are planned. |

A package moves from Experimental to Stable only when the missing evidence exists in the repository; the move is recorded in the changelog. Status is not stored in `package.json`.

## Machine-readable source

Every badge is checked against `docs-site/src/data/package-status.json`. `pnpm docs:check` fails when a package page's badge disagrees with that file. The table below was written from the same file.

## Current status

| Package | Status |
|---|---|
| [`@brambodev/adapter-acp`](../packages/adapter-acp) | Frozen |
| [`@brambodev/adapter-anthropic`](../packages/adapter-anthropic) | Experimental |
| [`@brambodev/adapter-api`](../packages/adapter-api) | Experimental |
| [`@brambodev/adapter-cli`](../packages/adapter-cli) | Stable |
| [`@brambodev/adapter-openai`](../packages/adapter-openai) | Experimental |
| [`@brambodev/cli`](../packages/cli) | Stable |
| [`@brambodev/contracts`](../packages/contracts) | Stable |
| [`@brambodev/delegation`](../packages/delegation) | Experimental |
| [`@brambodev/environment`](../packages/environment) | Stable |
| [`@brambodev/kernel`](../packages/kernel) | Stable |
| [`@brambodev/lock`](../packages/lock) | Stable |
| [`@brambodev/memory-filesystem`](../packages/memory-filesystem) | Experimental |
| [`@brambodev/memory-sqlite`](../packages/memory-sqlite) | Experimental |
| [`@brambodev/orchestration`](../packages/orchestration) | Experimental |
| [`@brambodev/projection`](../packages/projection) | Stable |
| [`@brambodev/provenance`](../packages/provenance) | Experimental |
| [`@brambodev/registry`](../packages/registry) | Stable |
| [`@brambodev/runtime-local`](../packages/runtime-local) | Experimental |
| [`@brambodev/sandbox-local`](../packages/sandbox-local) | Experimental |
| [`@brambodev/sandbox-remote`](../packages/sandbox-remote) | Experimental |
| [`@brambodev/sandbox`](../packages/sandbox) | Experimental |
| [`@brambodev/session`](../packages/session) | Stable |
| [`@brambodev/workflow-coordinator`](../packages/workflow-coordinator) | Experimental |
| [`@brambodev/workflow-remote`](../packages/workflow-remote) | Experimental |
| [`@brambodev/workflow-store-sqlite`](../packages/workflow-store-sqlite) | Experimental |
| [`@brambodev/workspace-artifacts-local`](../packages/workspace-artifacts-local) | Experimental |
| [`@brambodev/workspace-git-worktree`](../packages/workspace-git-worktree) | Stable |
| [`@brambodev/workspace-local`](../packages/workspace-local) | Stable |

## Next step

See [known limitations](./known-limitations) for what each Experimental package does not yet prove.
