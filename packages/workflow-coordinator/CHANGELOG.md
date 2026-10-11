# @brambodev/workflow-coordinator

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

### Patch Changes

- Updated dependencies [5afe8db]
- Updated dependencies [6731107]
  - @brambodev/contracts@0.5.0
  - @brambodev/orchestration@0.5.0
