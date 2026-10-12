# @brambodev/orchestration

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

### Patch Changes

- Updated dependencies [5afe8db]
- Updated dependencies [6731107]
  - @brambodev/contracts@0.5.0
  - @brambodev/delegation@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [1c95819]
  - @brambodev/contracts@0.4.0
  - @brambodev/delegation@0.4.0

## 0.3.1

### Patch Changes

- @brambodev/contracts@0.3.1
  - @brambodev/delegation@0.3.1

## 0.3.0

### Minor Changes

- b08d603: Add orchestration helpers that execute delegated handoffs through the task graph.
- b08d603: Add provider-agnostic task graph orchestration with dependency validation, bounded concurrency, cancellation, and explicit blocked task states.

### Patch Changes

- Updated dependencies [b08d603]
- Updated dependencies [b08d603]
  - @brambodev/contracts@0.3.0
  - @brambodev/delegation@0.3.0
