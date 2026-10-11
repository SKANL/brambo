---
"@brambodev/contracts": minor
"@brambodev/orchestration": minor
"@brambodev/session": minor
"@brambodev/adapter-api": minor
"@brambodev/adapter-openai": minor
"@brambodev/adapter-anthropic": minor
"@brambodev/adapter-cli": minor
"@brambodev/runtime-local": minor
---

Add opt-in provider-neutral execution controls with registered schemas, layered
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
