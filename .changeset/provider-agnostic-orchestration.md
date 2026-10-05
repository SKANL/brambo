---
"@brambodev/contracts": minor
"@brambodev/orchestration": minor
"@brambodev/session": minor
"@brambodev/adapter-api": minor
"@brambodev/adapter-openai": minor
"@brambodev/adapter-anthropic": minor
"@brambodev/runtime-local": minor
"@brambodev/workflow-store-sqlite": minor
"@brambodev/workspace-artifacts-local": minor
"@brambodev/workflow-coordinator": minor
"@brambodev/workflow-remote": minor
---

Add provider-neutral durable orchestration, fenced state/artifact publication,
host-authenticated coordinator and worker ports, explicit frozen-source import,
and public backend/driver conformance. Existing synchronous APIs remain supported.
The optional SQLite reference requires Node >=24.15.0 and one authoritative host;
other published package floors remain Node >=20. Deployment, authentication,
secrets, storage and retention are host choices, not a Brambo-operated service.
Local synthetic API/process fixtures do not establish live provider, native
resume, distributed backend, or hosted Windows/Linux deployment guarantees.
