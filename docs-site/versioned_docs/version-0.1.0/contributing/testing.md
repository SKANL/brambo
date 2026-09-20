---
title: Testing
audience: Contributors and maintainers
prerequisites: Node.js >=24 and pnpm 11
outcome: Run focused and repository-level verification for changes
scope: Contributor testing workflow
compatibility: Repository checks require Node.js >=24; CI also exercises the documented version matrix
translationStatus: original
---
# Testing

Keep a behavior change, its test, and its explanation in the same work unit. Start with the narrowest proof, then run gates relevant to the changed boundary.

## Quick path

```bash
pnpm check
pnpm build
pnpm proof:consumer-install
pnpm docs:check
```

`pnpm check` runs source-byte validation, typechecking, tests, and linting. It does not replace consumer-install or documentation checks.

## Contract suites

Providers and adapters should run shared clauses from `@brambodev/contracts`:

```ts
import { runWorkspaceContractSuite } from '@brambodev/contracts'

const report = await runWorkspaceContractSuite(provider)
if (!report.passed) throw new Error(JSON.stringify(report.violations))
```

The runner executes every clause and names each violation; one failure does not hide later failures.

## Focused package checks

```bash
pnpm --filter @brambodev/contracts exec vitest run
pnpm --filter @brambodev/session exec vitest run
pnpm docs:check
```

When a recursive command stops early, run the affected package's Vitest binary directly so later packages are not mistaken for verified.

## Consumer and documentation gates

Changes to exports, import specifiers, declarations, or package metadata require `pnpm build && pnpm proof:consumer-install`. Documentation changes require `pnpm docs:check`; it validates route parity, frontmatter, links, API output, and example structure.

## Next step

Read [Contributing](../guides/contributing) for repository workflow and review expectations.
