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
