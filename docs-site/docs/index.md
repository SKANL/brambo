---
sidebar_position: 1
title: Overview
slug: /
audience: Developers evaluating or adopting the brambo SDK
prerequisites: Node.js >=20
outcome: Know what brambo is, which path fits your job, and where to start
scope: Documentation entry point for the 0.5.x SDK
compatibility: Published packages support Node.js >=20
translationStatus: original
---
import {Card, CardGrid} from '@site/src/components'
import Diagram from '@site/src/components/Diagram'
import ThreeWorlds from '@site/src/components/diagrams/ThreeWorlds'

# brambo

**brambo is an SDK-first microkernel for embedding AI coding agents in your own product.** It runs executor sessions (Claude Code, Codex, OpenCode, or the OpenAI and Anthropic APIs) behind one typed result, orchestrates durable workflows with fenced leases and idempotent receipts, and projects one canonical registry into each vendor's native configuration. Every boundary is a typed port in `@brambodev/contracts`, and every port ships a runnable contract suite.

The SDK is a library, not a service: there is no brambo account, no hosted control plane, and no daemon. Your process owns authority, credentials, scheduling and cleanup policy; brambo owns the contracts and the fail-closed checks around them.

## Pick your path

<CardGrid columns={3}>
  <Card eyebrow="Embed" title="Run an agent from your host" to="/docs/tutorials/first-session">
    Call `runSession`, get a typed `ResultEnvelope`, cancel through your own signal.
  </Card>
  <Card eyebrow="Orchestrate" title="Run durable workflows" to="/docs/guides/durable-orchestration">
    Compose a SQLite run store, leases, fencing epochs and artifacts into resumable runs.
  </Card>
  <Card eyebrow="Extend" title="Add a provider or port" to="/docs/guides/third-party-executor-providers">
    Write an `ExecutorProvider`, register it explicitly and prove it with conformance.
  </Card>
</CardGrid>

| You are... | Start with | Then read |
|---|---|---|
| A host integrator adding an agent turn to a product | [Your first session](tutorials/first-session) | [Executors and workspaces](guides/executors-and-workspaces), [Tools and sandbox](guides/tools-and-sandbox) |
| A platform engineer running long, resumable work | [Durable orchestration](guides/durable-orchestration) | [Remote orchestration](guides/remote-orchestration), [Custom drivers and tools](guides/custom-drivers-and-tools) |
| A provider or port author | [Third-party executor providers](guides/third-party-executor-providers) | [Kernel contracts](guides/kernel-contracts), [Create an adapter](how-to/create-adapter) |
| Evaluating brambo | [Architecture](explanation/architecture) | [Security boundaries](explanation/security-boundaries), [Claims and evidence](reference/claims-and-evidence) |

## Three worlds, one kernel

brambo's 28 packages fall into three worlds that share the contracts package and the zero-dependency kernel. You only install the world you need.

<Diagram><ThreeWorlds /></Diagram>

- **Session world**: one executor turn in one workspace. `@brambodev/session` with `adapter-cli` or `adapter-api` (+ `adapter-openai`, `adapter-anthropic`), local or git-worktree workspaces, and sandbox providers.
- **Durable world**: runs that survive crashes and takeovers. `@brambodev/orchestration` with `runtime-local`, `workflow-store-sqlite`, `workflow-coordinator`, `workflow-remote` and `workspace-artifacts-local`.
- **Environment world**: one canonical registry projected into native vendor configuration with an ownership ledger. `registry`, `projection`, `environment`.

## Install

```bash
npm install @brambodev/session
```

The session package re-exports every type and helper its surface needs, so you do not install `@brambodev/contracts` or `@brambodev/kernel` separately. See [Install](guides/install) for the full package set and [Compatibility](reference/compatibility) for Node.js versions per package.

## Honest boundaries

brambo states its limits next to its features:

- **brambo validates and records; your host decides.** Approval, credentials, scheduling and retention policy are host responsibilities.
- **brambo is not a sandbox.** The CLI adapter launches vendor binaries with their own permission prompts disabled (Claude Code runs with `--dangerously-skip-permissions`); isolation comes from the workspace and sandbox provider you choose, and no OS isolation is claimed where a provider has not demonstrated it.
- **The SDK sets no timeouts and retries nothing by default.** Cancellation reaches a run only through the interrupt or signal your host wires in.
- **No concrete remote protocol is bundled** for sandboxes; the remote sandbox provider is a transport adapter you supply.

The evidence behind each claim lives in [Claims and evidence](reference/claims-and-evidence).
