---
title: Known limitations
audience: Developers evaluating or operating brambo
prerequisites: None
outcome: Know every documented limit of 0.5.x in one place before you depend on it
scope: Limits of the 0.5.x SDK, stated as brambo does X and your host does Y
compatibility: brambo 0.5.x
translationStatus: original
---
# Known limitations

Every limit below is also stated on the page of the feature it bounds. This page collects them so you can review them at once. Each one is phrased as what brambo does and what remains your host's job.

## Isolation and permissions

| brambo does | Your host does |
|---|---|
| Runs CLI executors as ordinary child processes in the workspace directory. | Provides isolation (OS account, container, VM). brambo is not a sandbox. |
| Launches `claude-code` with `--dangerously-skip-permissions`, because a headless run has no approver. | Decides whether that posture is acceptable and confines the process. |
| Validates sandbox policies against provider evidence and fails closed. | Picks a provider and platform that can prove the controls it needs. |
| Reports `sandbox-local` evidence honestly: Linux process and resource controls `none`, macOS filesystem only, Windows only with an external broker. | Relaxes `requiredCapabilities` to what it accepts, or supplies another provider. |
| Ships no remote sandbox protocol. | Implements the `RemoteSandboxTransport`. |

Optional real-host sandbox conformance runs only on Linux and macOS, and only when dispatched manually; Windows host conformance is not run in CI.

## Time, cancellation and retries

| brambo does | Your host does |
|---|---|
| Sets no deadline on executor runs, API requests or git commands. | Sets deadlines and cancels through `onInterrupt` or the request signal. |
| Makes one attempt per API request (`maxAttempts: 1`); never retries CLI runs or tools. | Retries only work it knows is idempotent. |
| Refuses runs before they start when a budget cap is reached. | Stops a run in progress with its own deadline. |

## Persistence and cleanup

| brambo does | Your host does |
|---|---|
| Leaves workspace directories on disk after a session. | Removes them with the removal helpers on its own schedule. |
| Persists no transcript of a run. | Captures `envelope.data`, stream events or an `eventLog` if it needs a record. |
| Never prunes durable events, receipts or orphaned staged artifacts. | Decides retention, backups and orphan cleanup. |
| Refuses stores with another format version instead of migrating them. | Installs a build at least as new as the data. |

## Durable world

| brambo does | Your host does |
|---|---|
| Guarantees fenced, CAS-checked commits on one authoritative SQLite host. | Avoids shared network mounts, clustering and failover, or implements another `RunStore`. |
| Requires Node.js >=24.15.0 for the SQLite store. | Runs that package on a matching Node.js. |
| Replays completed effects and blocks uncertain ones. | Enforces exactly-once in external systems and decides what to do with `blocked` tasks. |
| Ships a coordinator request handler with no TLS, listener or authentication. | Provides TLS, identity, authorization policy, deployment and worker supervision. |

Several durable failures (engine preconditions, import refusals, artifact limits, remote client errors) are plain `Error` instances without a code.

## Session world

- `runSession` has no `signal` option; cancellation is `onInterrupt`.
- Supplying `sandboxProvider` or `toolExecutor` to `runSession` configures the tool seam but does not route a CLI executor's own tools through it.
- Cost caps compare against the token figure the executor reported after each run, and runs are admitted at a flat cost of 1, so caps trip on the run after the one that crossed them. `maxConcurrent` is not meaningfully exercised by a single session.
- `ExecutorRegistry.create` types its options argument to include `selection`, so TypeScript callers pass the selection twice.

## Packages with limited reach

- `memory-filesystem` and `memory-sqlite` pass their contract suite but have no consumer inside brambo; `runSession` never reads or writes memory. `memory-sqlite` is measured on Node.js 24.14.1 and 26.8.1 only.
- `delegation` is a minimal lifecycle with no retry, scheduling or listing.
- `adapter-acp` is frozen and is not an `ExecutorAdapter`.

## Release and evidence

- Packages are published without npm provenance attestations; see [Claims and evidence](./claims-and-evidence).
- brambo is pre-1.0. Breaking changes are possible and are recorded in the changelog.
- This documentation describes 0.5.x and is built from `main`; there is no frozen 0.5.x snapshot yet.
