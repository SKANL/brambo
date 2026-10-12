# @brambodev/session

## 0.5.1

### Patch Changes

- Updated dependencies [9f94df5]
- Updated dependencies [038975b]
- Updated dependencies [12e332f]
- Updated dependencies [e848837]
- Updated dependencies [370458e]
  - @brambodev/adapter-cli@0.5.1
  - @brambodev/kernel@0.5.1
  - @brambodev/provenance@0.5.1
  - @brambodev/contracts@0.5.1
  - @brambodev/workspace-git-worktree@0.5.1
  - @brambodev/workspace-local@0.5.1
  - @brambodev/orchestration@0.5.1
  - @brambodev/sandbox@0.5.1

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
  - @brambodev/orchestration@0.5.0
  - @brambodev/adapter-cli@0.5.0
  - @brambodev/provenance@0.5.0
  - @brambodev/sandbox@0.5.0
  - @brambodev/workspace-git-worktree@0.5.0
  - @brambodev/workspace-local@0.5.0
  - @brambodev/kernel@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [1c95819]
  - @brambodev/contracts@0.4.0
  - @brambodev/adapter-cli@0.4.0
  - @brambodev/provenance@0.4.0
  - @brambodev/sandbox@0.4.0
  - @brambodev/workspace-git-worktree@0.4.0
  - @brambodev/workspace-local@0.4.0
  - @brambodev/kernel@0.4.0

## 0.3.1

### Patch Changes

- 577caec: Reject execution and tool contexts whose network allowlists differ from the session policy, and expose validated file snapshot/restore seams for injected remote providers.
- Updated dependencies [577caec]
  - @brambodev/sandbox@0.3.1
  - @brambodev/adapter-cli@0.3.1
  - @brambodev/contracts@0.3.1
  - @brambodev/kernel@0.3.1
  - @brambodev/workspace-git-worktree@0.3.1
  - @brambodev/workspace-local@0.3.1
  - @brambodev/provenance@0.3.1

## 0.3.0

### Minor Changes

- b08d603: Add typed session lifecycle events with an append-only in-memory event log and deterministic replay.
- b08d603: Expose session receipt creation bound to the session event stream and provenance target.

### Patch Changes

- Updated dependencies [b08d603]
- Updated dependencies [b08d603]
- Updated dependencies [b08d603]
- Updated dependencies [b08d603]
- Updated dependencies [b08d603]
  - @brambodev/provenance@0.3.0
  - @brambodev/contracts@0.3.0
  - @brambodev/adapter-cli@0.3.0
  - @brambodev/sandbox@0.3.0
  - @brambodev/workspace-git-worktree@0.3.0
  - @brambodev/workspace-local@0.3.0
  - @brambodev/kernel@0.3.0

## 0.2.0

### Minor Changes

- dacf53e: Add public executor isolation options and observational JSONL stream events, re-export the stream contract through the session API, and document the host-owned memory boundary.

### Patch Changes

- Updated dependencies [dacf53e]
  - @brambodev/adapter-cli@0.2.0
  - @brambodev/contracts@0.2.0
  - @brambodev/sandbox@0.2.0
  - @brambodev/workspace-git-worktree@0.2.0
  - @brambodev/workspace-local@0.2.0
  - @brambodev/kernel@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [43704f7]
  - @brambodev/adapter-cli@0.1.1
  - @brambodev/contracts@0.1.1
  - @brambodev/sandbox@0.1.1
  - @brambodev/workspace-git-worktree@0.1.1
  - @brambodev/workspace-local@0.1.1
  - @brambodev/kernel@0.1.1
