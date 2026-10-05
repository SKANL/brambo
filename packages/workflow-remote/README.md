# @brambodev/workflow-remote

Injected clients for a host-operated `/v1/workflow` protocol endpoint. No service,
credentials, storage, execution runtime or automatic local fallback is supplied.

```ts
import { createRemoteRunStore, createRemoteArtifactProvider, replayRun } from '@brambodev/workflow-remote'

const options = { endpoint, fetch, authorizeRequest: hostAuthorizationHeaders, signal }
const store = createRemoteRunStore(options)
const artifacts = createRemoteArtifactProvider(options)
const page = await replayRun(store, key, cursor, 256)
cursor = page.nextCursor // Never use latestCursor to skip a truncated page.
await store.close() // Cancels this client's requests, not the server-owned store.
```

The host acquires authorization headers afresh per request. Actor/owner IDs are
expectations, not credentials: the coordinator authenticates its own principal.
Claims require that authenticated subject to match the requested owner. Artifact
staging uses the authenticated namespace; configure a matching identity explicitly.
Use host TLS/authentication/authorization in production. Endpoint credentials,
queries and fragments are refused; redirect following is disabled. Error messages
never include transport exceptions, response text, URLs or authorization values.
Injected fetch implementations must honor these transport options.

All responses have validated version/envelopes and operation-specific scope/shape.
Default response cap is 1 MiB; hosts may configure 1–64 MiB. Requests remain bounded
to the coordinator's 1 MiB ceiling. Uploads traverse at most 10,000 entries and
128 levels, with 4,096-byte paths and 768 KiB raw data plus envelope overhead.
Oversized data is refused, not silently chunked. The supplied signal bounds host
authorization, fetch and streaming response waits; there is no implicit deadline.

No mutations are automatically retried. After a dropped create/admit response,
the host may explicitly submit the identical durable command/idempotency key to
obtain its original receipt. Query authoritative state before retrying uncertain
commit/claim/publication. Disconnect never creates a local writer or merges edits.
Reads are replay-safe but this client does not add hidden automatic retries.
Retention is authority-owned: overflow must include a matching snapshot and new
cursor; replay is observation only and never executes tools.

Artifact reads verify SHA-256 and sizes against the immutable manifest. Uploads
check returned entries against local bytes. Materialization creates a new private
directory with independent exclusive writes; caller owns its later cleanup.
Portable filesystem checks are not an OS sandbox against hostile same-user races.
Reference coordinator publication still checks current scoped lease authority.

Tests use injected, socketless transports and a test-only non-SQLite authority.
Public conformance covers two connections to that host; coordinator compatibility
is separate because its authenticated subject/namespace policy is stricter than
the generic port. No external deployment or distributed-durability proof is implied.

See the [deployment guide](../../docs-site/docs/guides/remote-orchestration.md).
Packed consumer/build/frozen-install and hosted platform acceptance remain pending;
source-condition imports are not proof of installed package resolution.
