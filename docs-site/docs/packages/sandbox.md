---
title: sandbox
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Choose and manage a sandbox provider through the SDK
scope: This page
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# @brambodev/sandbox

`@brambodev/sandbox` is the provider-neutral SDK layer for selecting a sandbox, creating a managed session, and validating the boundary around execution. It does **not** implement operating-system isolation itself.

## Quick path

1. Register one or more `SandboxProvider` implementations.
2. Create a resolver with `createSandboxProviderResolver`.
3. Request a session with a validated policy and snapshots.
4. Dispose the session when the host-owned lifecycle ends.

```ts
import { createSandboxProviderResolver } from '@brambodev/sandbox'

const resolver = createSandboxProviderResolver([provider])
const session = await resolver.createSession({ policy, snapshots: [] })

try {
  const result = await session.execute({ argv, cwd, environment, policy })
  console.log(result.status, result.enforcement)
} finally {
  await session.dispose()
}
```

## What the resolver guarantees

| Concern | Behavior |
| --- | --- |
| Provider selection | Chooses the first registered provider whose declared capabilities prove the requested policy. |
| Policy identity | Execution must use the same policy as session creation, including capabilities and resource limits. |
| Result validation | Provider results are normalized and validated before they leave the managed session. |
| Unsupported capability | Fails closed with a coded error instead of silently weakening the policy. |
| Lifecycle | A session becomes unusable when disposal starts; repeated disposal reuses the same promise. |
| Optional surfaces | `openStdio`, `snapshot`, and `restore` are unavailable when the provider does not expose them. |

## Execution surfaces

`execute()` accepts an exact argv vector. The resolver does not parse shell commands or add a shell. `openStdio()` is an optional provider surface for long-lived stdio communication. Snapshot methods are file-only: directory metadata and process state are not restored, and unknown snapshot identities must fail closed.

The package validates provider identity in returned enforcement evidence. A result that names another provider, has malformed fields, or cannot be validated is rejected and the managed session becomes uncertain rather than being reused as if it were safe.

## What this package does not claim

- It is not an OS sandbox and does not create one.
- Provider discovery is not proof that a host can enforce every control.
- A successful resolver selection is not proof of network, filesystem, process, or resource isolation beyond the provider's validated evidence.
- The package does not define a remote protocol.

Use `@brambodev/sandbox-local` for conservative host-backed providers or `@brambodev/sandbox-remote` for an injected remote transport.

Remote providers may implement file-only snapshot/restore through their transport. A logical resume must create or attach a new process session; the sandbox contract makes no process-restore claim.
## Capability evidence and Linux limits

Capability facts are control-specific. Detecting Bubblewrap or Landlock, or successfully running `/bin/true`, does not prove filesystem, network, process, or resource isolation; unsupported controls are reported as `none` and required capabilities fail closed. Landlock discovery is diagnostic only until a control-specific enforcement probe exists.

Linux reports filesystem `full` only after the production Bubblewrap wrapper proves workspace writes, read-only mount rejection, outside-file and symlink isolation, secret-environment removal, and unchanged host fixtures. Network `full` additionally requires a host loopback listener to be reachable in unrestricted mode and refused in deny mode. These checks use temporary fixtures and no Internet service. Process and resource evidence remain `none`; helper success alone never promotes them.

The Linux local provider supports network denial through an isolated namespace. Network allowlists are **not** implemented by translating them to namespace denial and are rejected. Resource limits are also rejected when the available cgroup path cannot contain startup before the child executes; partial post-spawn attachment is never reported as full enforcement.
