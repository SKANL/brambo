# @brambodev/adapter-cli

## 0.5.0

### Minor Changes

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
  - @brambodev/kernel@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [1c95819]
  - @brambodev/contracts@0.4.0
  - @brambodev/kernel@0.4.0

## 0.3.1

### Patch Changes

- @brambodev/contracts@0.3.1
  - @brambodev/kernel@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [b08d603]
- Updated dependencies [b08d603]
  - @brambodev/contracts@0.3.0
  - @brambodev/kernel@0.3.0

## 0.2.0

### Minor Changes

- dacf53e: Add public executor isolation options and observational JSONL stream events, re-export the stream contract through the session API, and document the host-owned memory boundary.

### Patch Changes

- Updated dependencies [dacf53e]
  - @brambodev/contracts@0.2.0
  - @brambodev/kernel@0.2.0

## 0.1.1

### Patch Changes

- 43704f7: Harden provider-unavailability classification for live executor tests and make workflow policy validation portable across platforms.
- Updated dependencies [43704f7]
  - @brambodev/contracts@0.1.1
  - @brambodev/kernel@0.1.1
