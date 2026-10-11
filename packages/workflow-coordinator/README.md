# @brambodev/workflow-coordinator

Host-composed, authenticated HTTP control plane for the neutral workflow ports.
The package returns a Node `RequestListener`; it does not create or bind a
server, read environment variables, provide authentication defaults, or deploy
TLS. The host owns transport security and deployment.

```ts
import { createWorkflowCoordinator } from '@brambodev/workflow-coordinator'

const coordinator = createWorkflowCoordinator({
  store,
  artifacts,
  authenticate: authenticateRequest,
  authorize: authorizeWorkflowOperation,
  workerAllowed: isWorkflowWorker,
})

server.on('request', coordinator.handler)
```

Every request is authenticated and authorized before a store or artifact port
is called. The host must return a stable canonical principal. Run namespace and
lease owner identity come from that principal, never from the request body.
Worker-only operations additionally require the worker callback and bind every
lease token to both the principal namespace and subject. A successful claim
returns its lease token only to that authorized owner; denied responses and
errors do not echo tokens, and the coordinator does not log or persist them.

The version-1 protocol is transport-neutral in `@brambodev/contracts`. The
coordinator accepts JSON `POST /v1/workflow` requests, caps streamed bodies at
1 MiB (hosts may configure a lower limit), and supports run commands, replay,
fenced lease operations, and artifact access. Upload paths are artifact-relative
paths staged through a private generated temporary directory; clients cannot
choose a host filesystem path. The control plane never executes workflow tools.

`close()` releases no host-owned stores or providers. Hosts close their own
resources and must use a secure transport appropriate to their deployment.

## Launch a worker separately

The host starts workers explicitly in its execution processes, not inside the
HTTP control plane. Supply the same authenticated remote authority/artifact
clients, registered workflow definitions and drivers, and current host services.
The worker composes the existing durable engine; it does not introduce a second
scheduler or automatically spawn processes.

```ts
import { createWorkflowWorker } from '@brambodev/workflow-coordinator'
import { runDurableWorkflow } from '@brambodev/orchestration'
import { createRemoteRunStore, createRemoteArtifactProvider } from '@brambodev/workflow-remote'
import { createLocalExecutionRuntime } from '@brambodev/runtime-local'

// The host supplies endpoint, fetch and fresh authorization headers. Never
// transfer another client's credentials or approval decisions to this worker.
const store = createRemoteRunStore(remoteOptions)
const artifacts = createRemoteArtifactProvider(remoteOptions)
const runtimeOptions = { rootDir: workerPrivateRoot, artifacts, ttlMs: 30_000, renewalMs: 10_000 }
const worker = createWorkflowWorker({
  workerId: workerInstanceId,
  principal: authenticatedWorkerPrincipal,
  store,
  artifacts,
  definitions,
  drivers,
  services: currentAuthorizedServices,
  execute: runDurableWorkflow,
  runtime: createLocalExecutionRuntime({ ...runtimeOptions, store }),
  runtimeForTask: context => createLocalExecutionRuntime({ ...runtimeOptions, store: context.store }),
  leaseTtlMs: 30_000,
  renewalMs: 10_000,
  concurrency: 1,
})

// One bounded pass; false means no eligible receipt or contended ownership.
// The host owns polling/backoff, shutdown signals and process supervision.
await worker.runOnce(shutdownSignal)
await worker.stop()
await store.close()
```

### Renewal ownership and effects

The worker renews the parent run/workspace lease and serializes its renewal with
parent commits and validity checks. Only a lease with the exact same parent
namespace, owner, token and full resource/epoch set follows this worker's renewal;
expiry changes never substitute another capability. Child leases are validated
unchanged, and takeover still denies validity and commit. The injected runtime
is the ONLY child-lease renewal owner.
Every renewing runtime must use `runtimeForTask`: each call receives a fresh
task-scoped store that serializes raw child renewal and exact lease handoff with
that task's journal admission/completion. Create a separate runtime closure per
task using `context.store`; never rebind a shared runtime/store to another task.
The effect itself runs outside this queue so its lease can renew while it waits.
A rejected handoff aborts that task and cannot produce a successful publication.
The plain `runtime` path is appropriate only if it does not renew before effect
settlement. Both paths require truthful context-reconstruction capabilities.

Children have separate task/workspace tokens and epochs, even when all leases
share the worker's canonical `Principal.subject`. Children never receive the
parent lease; the durable engine alone integrates reports through its owning
parent transition queue. `workerId` identifies an instance, not authentication.

Custom tools are conservatively journaled as non-idempotent. Completed effects
replay recorded redacted results without dispatch; unfinished effects remain
uncertain. Host `WorkerServices` receive a third `WorkerAuthorizationContext`
argument with the frozen initiating `CommandReceipt.actor`, worker identity,
receipt/run and task IDs. Reauthorize that actor against current policy at each
new effect or secret lookup; never derive authorization from tool arguments or
substitute the worker principal. Host services must validate arguments,
enforce approvals and redact secrets/results before returning. This adapter is
not a tool schema registry or an OS sandbox. Drivers receive reconstructed
durable context, not another provider's native-resume authority.

### Stop, cancellation and deployment limits

`runOnce` refuses overlapping calls on one worker. Accepted receipts become
running under a fenced run/workspace claim, then completed or blocked with a
durable outcome. Queued cancellation takes precedence; active cancellation is
observed on renewal using a run-and-cancel-kind query, independent of unrelated
or earlier non-cancel receipt pages. `RunStore.pending(namespace, limit, filter)`
applies the optional RunKey/kind filter before its page limit. Filtered remote
responses acknowledge the exact filter; older peers that reject or ignore it
fail closed, with no unfiltered fallback. Authority/transport failure leaves the receipt pending for
recovery rather than completing an unknown outcome. A new owner rechecks the
receipt after acquiring its own lease; expired workers cannot commit or publish.

`stop()` prevents new admission, requests cancellation and waits for runtime
handback plus in-flight renewal. It closes no injected resource. Abort is intent,
not process-termination proof: an uncooperative runtime may leave stop pending.
Hosts must supervise their own processes and renew with sufficient timing
headroom. Already completed task checkpoints and immutable revisions are reused
after reconnect; no offline fallback writer or automatic merge is introduced.

The integration fixtures use independently launched coordinator/workers on one
host, ephemeral loopback ports/directories and explicit synthetic credentials.
They are not external deployment, distributed SQLite or host-isolation proof.
SQLite requires its documented Node runtime floor; unsupported-runtime tests
skip explicitly rather than replacing the authority. Windows/Linux hosted CI
and external deployment still require separate execution evidence.

See the [deployment guide](../../docs-site/docs/guides/remote-orchestration.md)
for typechecked separate-process host composition and the deployment checklist.
No coordinator executable or Brambo-operated account is supplied.

### Configured replay compatibility

Configured tasks use only the admission-owned `executionConfigurations` snapshot
entries. Before configured factory/runtime construction, the worker checks the
registered driver ID/version and validates the stored controls against its current
contract. Replay never calls a model-support resolver or reevaluates defaults.

When an entry contains `executorVersion`, declare the current trusted host version
with the synchronous `executorVersionForTask(task)` worker option. Missing,
invalid, throwing or unequal declarations block execution before factory/adapter
construction. Declare this at CLI worker composition; do not infer it from driver
wrapper versions or silently select another binary. This host declaration is a
compatibility check, not proof of an installed binary's identity or qualification.
API configurations without an executor version need no version callback. Legacy
unconfigured workers never call it. Renewals, policy and lease ownership are unchanged.

Stored run overrides and support receipts survive checkpoint/reopen and explicit
import. Current policy must still authorize execution and each new effect; a
`supported` receipt is not an approval, credential or lease. A changed host default
does not silently mutate an admitted run. Admit a new run to change its controls.

The configured replay fixture uses the production SQLite store on supported Node,
closes/reopens it, then executes the real worker/engine with a synthetic custom
driver. It verifies version refusal before construction and a throwing former
resolver that replay never calls. It does not qualify installed CLIs, live API
models, distributed SQLite or external worker deployment. Package engine/runtime
requirements remain enforced; tests do not substitute another authority to bypass them.
