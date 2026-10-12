---
title: sandbox-local
audience: Developers integrating @brambodev/sandbox-local
prerequisites: Node.js >=20
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/sandbox-local 0.5.x'
compatibility: Node.js >=20
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/sandbox-local

<Badge status="experimental">Experimental</Badge>

*Experimental: tested and usable, but its surface may still change, and it has less platform evidence or fewer in-repo consumers than the stable packages.*

A conservative local `SandboxProvider` that claims only what it can prove on this machine: Linux uses bubblewrap after a functional probe (plus cgroup v2 and `prlimit` for limits), macOS uses a Seatbelt profile with filesystem evidence only, and Windows delegates to an external `brambo-windows-sandbox-broker`. Unproven controls are reported as `none`.

| | |
|---|---|
| World | Session world |
| Topology tier | 1 |
| Node.js | `>=20` |
| Depends on | [`contracts`](./contracts) |

## Install

```bash
npm install @brambodev/sandbox-local
```

## Example

```ts
import { createLocalSandboxProvider } from '@brambodev/sandbox-local'

const provider = await createLocalSandboxProvider()
console.log(provider.id, provider.capabilities.enforcement, provider.capabilities.controls)
```

## Ports

- **Implements:** `SandboxProvider` (`local-linux`, `local-macos`, `local-windows`).
- **Consumes:** `bwrap`, `sandbox-exec` or the Windows broker when present.

## Errors

Results use `SANDBOX_ERROR_CODES` (`BRAMBO_SANDBOX_TIMED_OUT`, `_ABORTED`, `_UNAVAILABLE`, `_COMMAND_DENIED`, `_RUNNER_FAILED`); session creation throws `BRAMBO_SANDBOX_CAPABILITY_UNAVAILABLE` for an unprovable network mode. Unsupported platforms throw a plain `Error`.

## Limits

- Linux process and resource controls report `none`; Windows resources are `partial`; so `createDefaultSandboxPolicy` cannot be satisfied as is.
- `allowlist` networking is not implemented.
- Default wall time 5 minutes; output capped at 1 MiB per stream; secret-looking environment variables are scrubbed.
- Host conformance on Linux, macOS and Windows is not claimed as executed in CI.

## See also

- [Tools and sandbox](../guides/tools-and-sandbox)
- [Security boundaries](../explanation/security-boundaries)
