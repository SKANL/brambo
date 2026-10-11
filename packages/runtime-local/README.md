# Local execution runtime

`@brambodev/runtime-local` runs an injected `ExecutionDriver` against a fresh
workspace materialized by an injected `ArtifactProvider`. It depends only on
contracts and Node built-ins and supports Node >=20.

## Quick path

```ts
import { createLocalExecutionRuntime } from '@brambodev/runtime-local'

const runtime = createLocalExecutionRuntime({ rootDir: '/private/runtime', artifacts, store })
const result = await runtime.execute(driver, request, taskAndWorkspaceLease)
// The caller decides whether to publish result.staged using result.publicationLease.
```

The supplied lease must cover exactly `task:<runId>:<taskId>` and
`workspace:<workspaceId>` in the request namespace. The runtime does not claim
or release that lease, renew a shared parent lease, publish artifacts, or commit
workflow state. It returns the latest renewed child lease only after draining
any renewal already in flight.

## Cancellation and handback

Caller cancellation and lease loss are delivered to the driver as an `AbortSignal`,
but they are intent, not proof that a process tree has stopped. `ExecutionDriver.run`
has no disposal or termination operation in its contract. The runtime therefore
awaits its promise to settle before staging or removing the runtime-created
workspace. A never-settling driver keeps execution pending and its workspace
present. Only an `ok` result with a still-valid lease is staged; failed, cancelled,
invalid, cancelled-before-stage, and lease-lost results are not staged.
Lease liveness is checked immediately before and after staging. If authority is
lost during the provider's non-cancellable stage operation, immutable staged
data may remain unreferenced, but the runtime returns no publication lease.

Promise settlement is a trusted, conforming-driver handback—not independent
evidence of OS/process-tree termination. A custom or hostile same-user driver is
not sandboxed: a defective driver could settle while retaining background access
to the workspace. Hosts requiring adversarial isolation must enforce it outside
this package, for example with separate OS credentials and platform controls.

## Filesystem boundary

Each execution uses a runtime-created private container and an absent child
destination for materialization. The runtime verifies the returned workspace
identity and resolved path, and cleans only the container it created after the
driver has settled. The configured `rootDir` is caller-owned and is never
removed. These checks are not a race-free boundary against a hostile concurrent
same-user process; Node's Windows directory mode is not an ACL guarantee.

The runtime installs no process-global signal handlers. Lease renewal callbacks
are serialized, loss is irreversible, and `stop()` drains an active renewal
without releasing authority.

For worker composition, see the [deployment guide](../../docs-site/docs/guides/remote-orchestration.md).
Renewing child runtimes must use a fresh `runtimeForTask` closure over that task's
store. Cached local tests do not prove packed installation or hosted Windows/Linux.

## Execution controls

An optional `RuntimeRequest.executionConfiguration` is validated and copied into
an owned, deeply frozen envelope before the first asynchronous store/workspace
operation. The runtime forwards this snapshot to the driver, so caller mutation
during materialization cannot change admitted model controls. It never evaluates
model resolvers, adds capabilities or grants host policy. Configured drivers
independently reject a different envelope before invoking their adapter.

Local synthetic composition tests use public package exports, owned temporary
workspaces and fake API transports. They are not native-provider qualification or
packed-install consumer evidence.
