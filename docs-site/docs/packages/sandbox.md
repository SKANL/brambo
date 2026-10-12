---
title: sandbox
audience: Developers integrating @brambodev/sandbox
prerequisites: Node.js >=20
outcome: Know what the package does, how to use it, which ports it touches, and its limits
scope: '@brambodev/sandbox 0.5.x'
compatibility: Node.js >=20
translationStatus: original
---
import Badge from '@site/src/components/Badge'

# @brambodev/sandbox

<Badge status="experimental">Experimental</Badge>

*Experimental: tested and usable, but its surface may still change, and it has less platform evidence or fewer in-repo consumers than the stable packages.*

Provider-neutral sandbox selection: given registered `SandboxProvider`s and a policy, `createSandboxProviderResolver` picks the first provider whose capability evidence proves every required control and returns a managed session with idempotent disposal and policy checks.

| | |
|---|---|
| World | Session world |
| Topology tier | 1 |
| Node.js | `>=20` |
| Depends on | [`contracts`](./contracts) |

## Install

```bash
npm install @brambodev/sandbox
```

## Example

```ts
import { createDefaultSandboxPolicy, validateSandboxPolicy } from '@brambodev/contracts'
import { createSandboxProviderResolver } from '@brambodev/sandbox'
import { createLocalSandboxProvider } from '@brambodev/sandbox-local'

const policy = validateSandboxPolicy({ ...createDefaultSandboxPolicy(process.cwd()), requiredCapabilities: { filesystem: 'full' } })
const resolver = createSandboxProviderResolver([await createLocalSandboxProvider()])
const session = await resolver.createSession({ policy, snapshots: [] })
try {
  console.log(await session.execute({ argv: ['git', 'status', '--short'], cwd: process.cwd(), environment: {}, policy }))
} finally {
  await session.dispose()
}
```

## Ports

- **Implements:** Session management over `SandboxProvider` (`ResolvedSandboxSession`).
- **Consumes:** One or more `SandboxProvider`s.

## Errors

`BRAMBO_SANDBOX_UNAVAILABLE`, `BRAMBO_SANDBOX_CAPABILITY_UNAVAILABLE`, `BRAMBO_SANDBOX_REQUEST_INVALID`, `BRAMBO_SANDBOX_RESPONSE_INVALID`.

## Limits

- Isolation is only as strong as the selected provider's evidence.
- A session whose provider threw becomes uncertain and cannot be reused.

## See also

- [Tools and sandbox](../guides/tools-and-sandbox)
