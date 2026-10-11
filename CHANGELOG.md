# Changelog

All notable changes to brambo are documented here. Package releases are coordinated through [Changesets](https://github.com/changesets/changesets).

## Unreleased

### 0.5.0 release candidate (not yet published)

- Add provider-neutral durable orchestration: explicit backend/driver ports, fenced state and artifact publication, host-owned coordinator/worker deployment, frozen-source import and conformance entrypoints.
- Add opt-in provider/model controls with layered defaults/profile/task/run resolution, registered schemas, host-supplied support evidence and frozen receipts. Third-party providers can register namespaced controls without changing a core vendor enum.
- Map OpenAI/Anthropic model-behavior/output controls and evidenced Codex/Claude Code/OpenCode model arguments. Persist admitted effective controls through replay and snapshot import; existing unconfigured execution remains supported.
- SQLite is an optional reference requiring Node >=24.15 and one authoritative host. Other published packages retain Node >=20. Deployment, storage, authentication, secrets, retention and access policy remain host responsibilities.
- Controlled CLI execution on Windows requires a direct executable, not a shell-interpreted .cmd/.bat shim. Hosts must supply model/native support evidence; unknown optional support needs an explicit unverified opt-in and never satisfies required support.
- Verification includes source/type/lint suites, supported-runtime SQLite persistence, synthetic API payloads and CLI arguments, real local process boundaries and packed consumer installation. This is not universal live-provider/model/native-resume qualification, hosted deployment certification or proof of npm publication.

### Repository maintenance

- Professionalized the open-source contribution, security, support, governance, documentation, and release surfaces.
