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

## How it works

**Write order and failure containment.** `runProjection` reads the ownership ledger, then runs each target sequentially; a failing target never affects its siblings, and failures return as typed results instead of throwing. The native file lands before the ledger records it, so a crash between the two under-claims rather than over-claims. A file modified externally between read and write fails that target instead of landing stale content. brambo never marks a vendor file to prove ownership; ledger writes merge one target's claims, and an unreadable ledger is reported and left alone.

| Factory | Writes |
|---|---|
| `createClaudeMcpTarget` | `mcpServers` in `~/.claude.json` (or `.mcp.json` for project scope), `{type: 'stdio', command, args}` |
| `createOpenCodeConfigTarget` | `mcp.<id>` in `opencode.json`, `{type: 'local', command: argv}` |
| `createCodexConfigTarget` | `[mcp_servers.<id>]` in `config.toml`, `command` and `args` only, so `--strict-config` has nothing to reject |
| `createClaudeSkillsTarget` | copies each skill's `entryPath` to `~/.claude/skills/<id>/SKILL.md` |
| `createCodexSkillsTarget` | `~/.codex/skills/<id>/SKILL.md` |
| `createOpenCodeSkillsTarget` | `~/.config/opencode/skills/<id>/SKILL.md` |

Skill roots were verified by executing each binary under an injected home (`test/skills-discovery.live.test.ts`). OpenCode also scans `~/.config/opencode/skill`, `~/.opencode/skills` and `~/.opencode/skill`, and with the same id in two roots `~/.opencode/skills` wins while brambo still reports its own write; it also reads `~/.claude/skills`. Claude Code names a skill after its directory, while codex and opencode use the source's frontmatter `name:`, so a registry id that differs from that name appears under two names. Entries a target cannot express are reported in `skippedEntryIds` with the target's reason, never approximated.

**Remediation.** `runRemediation` is the way out of a state projection reports. One subject per call, and the same call describes or performs (`mode: 'inspect' | 'apply'`, default `'inspect'`), so a preview cannot disagree with the act. A refusal is returned as `BRAMBO_PROJECTION_REMEDIATION_REFUSED`, not thrown.

| Verb | Effect |
|---|---|
| `adopt` | brambo takes ownership of what is at its location, writing only the ledger; the description names every path a later run could replace or remove |
| `release` | brambo stops claiming a location; the file is not opened |
| `repair` | rewrites brambo's own ledger to hold exactly the records it can read |
| `discard` | removes brambo's own prior output from a vendor file: a `$.brambo` key whose members are all brambo vocabulary, or a `# BEGIN brambo-managed` block |

Every remediated path is resolved and proven inside the location brambo owns; a link at any depth disqualifies it, and `adopt` builds its claim from the target's plan, never from a directory listing.

## See also

- [ADR-009](../explanation/decisions/adr-009)
- [Architecture and topology](../explanation/architecture)
