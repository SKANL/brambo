---
title: sandbox-local
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Run commands through a conservative local sandbox provider
scope: This page
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# @brambo/sandbox-local

`@brambo/sandbox-local` provides platform-specific local sandbox providers for Linux, macOS, and Windows. It probes for a usable enforcement substrate and fails closed when the requested policy cannot be proven.

## Quick path

```ts
import { createLocalSandboxProvider } from '@brambo/sandbox-local'

const provider = await createLocalSandboxProvider()
const session = await provider.createSession({ policy, snapshots: [] })

try {
  const result = await session.execute({
    argv: ['node', 'script.mjs'],
    cwd: policy.workspaceRoot,
    environment: {},
    policy,
  })
  console.log(result.status)
} finally {
  await session.dispose()
}
```

Pass `platform` only for deterministic tests. In normal use, the factory dispatches from `process.platform`.

## Platform backends

| Platform | Verified substrate | Limitation when unavailable |
| --- | --- | --- |
| Linux | Functional bubblewrap probing; optional `prlimit` for file-size limits and cgroup v2 for resource setup. | Safe execution has no verified backend without bubblewrap. Resource-limited execution is refused when the required controllers or startup containment cannot be proven. |
| macOS | Functional `sandbox-exec` Seatbelt probing. | Safe execution is unavailable unless the functional Seatbelt probe succeeds. |
| Windows | `brambo-windows-sandbox-broker` version probe plus an isolation self-test. | The provider returns typed `unavailable` and does not fall back to an uncontained child when the broker is absent. |

The platform tests under `test/host-conformance/` are opt-in with `BRAMBO_RUN_SANDBOX_CONFORMANCE=1` and run only on their matching platform. They are not a claim that every host has passed the matrix.

## Common local safeguards

- The child is spawned with `shell: false` and the exact argv supplied by the caller.
- The physical working directory must be proven inside the physical workspace root; symlink and junction escapes are refused before spawn.
- Sensitive environment variable names are removed, and the execution-supplied `PATH` is not used for wrapper lookup.
- Timeout, cancellation, output limits, and teardown produce typed results.
- A verified backend is required for safe modes. `danger-full-access` is an explicit acknowledged mode, not OS isolation.
- In `danger-full-access`, an injected audit callback can receive validated `execution-started` and `execution-completed` events. Audit delivery is best effort and does not change execution behavior.

## Resource limits and cgroups

The Linux cgroup implementation writes limits to cgroup v2 and attaches the child after `spawn()` returns. Because that direct implementation cannot contain the pre-exec startup window, memory, process, and CPU-limited execution is refused when startup containment is not available. An attachment failure terminates the child when possible; a session with an uncertain teardown or attachment outcome is not treated as healthy.

## Honest boundary

This package exposes local capability evidence; it does not turn executable discovery into enforcement evidence. A missing helper, failed functional probe, unsupported limit, or unsupported network mode becomes a coded unavailable/capability failure instead of a weaker execution path.
