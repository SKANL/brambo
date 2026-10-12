---
title: projection
audience: Developers integrating @brambodev/projection
prerequisites: Node.js >=20
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/projection 0.5.x'
compatibility: Node.js >=20
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/projection

<Badge status="stable">Stable</Badge>

*Stable: covered by its tests (and its contract suite where the port has one) and exercised by brambo's own session or CLI path. brambo is pre-1.0, so breaking changes remain possible and are called out in the changelog.* [Status criteria](../reference/package-status).

Writes registry entries into each executor's native configuration (Claude Code `~/.claude.json`, Codex `~/.codex/config.toml`, OpenCode `~/.config/opencode/opencode.json`, and their skills roots) and owns the ledger (`~/.brambo/projection-ledger.json`) that records what brambo wrote, so drift is reported and reversal touches only brambo's output.

| | |
|---|---|
| World | Environment world |
| Topology tier | 2 |
| Node.js | `>=20` |
| Depends on | [`contracts`](./contracts), [`lock`](./lock), `jsonc-parser` |

## Install

```bash
npm install @brambodev/projection
```

## Example

```ts
import { RegistryStore } from '@brambodev/registry'
import { ProjectionLedger, createClaudeMcpTarget, groupByKind, runProjection } from '@brambodev/projection'

const registry = new RegistryStore()
const run = await runProjection({
  entries: groupByKind(await registry.list('global')),
  targets: [createClaudeMcpTarget()],
  ledger: new ProjectionLedger(),
  mode: 'inspect', // nothing is written; results say what would change
})
console.log(run.results, run.failures, run.warnings)
await registry.dispose()
```

## Ports

- **Implements:** `ProjectionTarget`s for Claude Code, Codex and OpenCode; `ProjectionLedger`; remediation.
- **Consumes:** Registry entries; `@brambodev/lock`.

## Errors

`BRAMBO_PROJECTION_*` (native malformed, target failed, traits invalid, ledger unavailable or contention, native unclaimable, mode invalid, remediation refused).

## Limits

- Single writer per file: concurrent projection of one file is unsupported.
- Project-scope skills are not projected; Codex has no verified project MCP location.
- Drift is reported, never resolved by writing.

## See also

- [ADR-009](../explanation/decisions/adr-009)
- [Architecture and topology](../explanation/architecture)
