---
title: environment
audience: Developers integrating @brambodev/environment
prerequisites: Node.js >=20
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/environment 0.5.x'
compatibility: Node.js >=20
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/environment

<Badge status="stable">Stable</Badge>

*Stable: covered by its tests (and its contract suite where the port has one) and exercised by brambo's own session or CLI path. brambo is pre-1.0, so breaking changes remain possible and are called out in the changelog.*

Machine and project environment operations behind `brambo init`, `brambo doctor` and `brambo remediate`: executor detection, projection orchestration, a diagnosis with typed finding kinds, and inspect-first remediation. Its source never touches the file system directly; it composes `registry` and `projection`.

| | |
|---|---|
| World | Environment world |
| Topology tier | 3 |
| Node.js | `>=20` |
| Depends on | [`contracts`](./contracts), [`kernel`](./kernel), [`projection`](./projection), [`registry`](./registry) |

## Install

```bash
npm install @brambodev/environment
```

## Example

```ts
import { diagnose, hasProblem } from '@brambodev/environment'

const diagnosis = await diagnose({ scope: 'machine' })
console.log(hasProblem(diagnosis))
for (const finding of diagnosis.findings) console.log(finding.severity, finding.kind, finding.executorId ?? '')
```

## Ports

- **Implements:** `initMachine`, `initProject`, `diagnose`, `remediate`, `detectExecutors`, `ingestMachine`; `@brambodev/environment/api-executors`.
- **Consumes:** `registry`, `projection`, `kernel`.

## Errors

`BRAMBO_ENVIRONMENT_SCOPE_UNAVAILABLE`, `BRAMBO_REGISTRY_STORE_UNAVAILABLE`, `BRAMBO_PROJECTION_LEDGER_UNAVAILABLE`, `BRAMBO_PROJECTION_REMEDIATION_REFUSED`.

## Limits

- `remediate` defaults to `mode: 'inspect'`; it applies only when asked.
- Detects only `claude-code`, `codex` and `opencode`.

## See also

- [CLI appendix](../how-to/run-cli)
