# @brambodev/contracts

## 0.5.1

### Patch Changes

- e848837: The `BRAMBO_SANDBOX_CAPABILITY_UNAVAILABLE` rejection now also reports the evidence the provider gave for the unmet control and how to proceed.

## 0.5.0

### Minor Changes

- 5afe8db: Add provider-neutral durable orchestration, fenced state/artifact publication,
  host-authenticated coordinator and worker ports, explicit frozen-source import,
  and public backend/driver conformance. Existing synchronous APIs remain supported.
  The optional SQLite reference requires Node >=24.15.0 and one authoritative host;
  other published package floors remain Node >=20. Deployment, authentication,
  secrets, storage and retention are host choices, not a Brambo-operated service.
  Local synthetic API/process fixtures do not establish live provider, native
  resume, distributed backend, or hosted Windows/Linux deployment guarantees.
- 6731107: Add opt-in provider-neutral execution controls with registered schemas, layered
  configuration resolution, host-supplied model support evidence and frozen support
  receipts. Custom providers can register namespaced controls without a core vendor
  enum. Configured API and CLI drivers preserve validated effective controls across
  atomic workflow admission, durable replay and explicit snapshot import.
  
  Map supported OpenAI and Anthropic model-behavior/output controls to native request
  fields, and Codex effort, Claude Code effort and OpenCode variant to evidenced CLI
  arguments. Unknown support fails closed unless the host explicitly permits optional
  unverified controls; required support still rejects unknown evidence. Native mappers
  cannot grant credentials, tools, workspace access, network access or approval policy.
  Legacy unconfigured paths remain supported. CLI model controls on Windows require
  a direct executable rather than a shell-interpreted command shim.
  
  Validation covers schemas, synthetic request bodies/argv, real local process entry,
  replay/persistence and packed consumer imports. It does not qualify every live model,
  provider or CLI version. Hosts own support evidence and native compatibility.

## 0.4.0

### Minor Changes

- 1c95819: Publish the API executor provider contract, registry, bounded tool loop, allowlisted discovery, and conformance entrypoint.

## 0.3.1

No changes in this release.

## 0.3.0

### Minor Changes

- b08d603: Add provider-agnostic delegation contracts and handoff lifecycle tracking.
- b08d603: Add typed session lifecycle events with an append-only in-memory event log and deterministic replay.

## 0.2.0

### Minor Changes

- dacf53e: Add public executor isolation options and observational JSONL stream events, re-export the stream contract through the session API, and document the host-owned memory boundary.

## 0.1.1

### Patch Changes

- 43704f7: Harden provider-unavailability classification for live executor tests and make workflow policy validation portable across platforms.
