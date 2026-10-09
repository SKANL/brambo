# Provider orchestration: scoped integration qualification

## Objective, authority and source
Qualify remaining integration boundaries without conflating prior local acceptance, legacy live vendor smoke, genuine independent hosts or hosted CI. Source anchor: `d190717a5e37f3eb9150e5695c1e2f2d5e19b7b0`.
- Worktree: C:/Users/angua/.codex/worktrees/provider-agnostic-orchestration/panda; branch codex/provider-agnostic-orchestration.
- User authorized independent safe local preparation and a bounded synthetic durable restart harness. No live provider, native CLI, credential/auth-store/environment-value inspection, remote Git, push, PR, hosted execution or new dependency download.
- Route: delegated direct. Parent routed recoverable multi-file test/harness preparation and execution; no SDD state. Strict TDD: true by explicit user choice for harness behavior/repairs. Unchanged-code verification does not manufacture RED.
- RDD remains off; parent independent review and fresh spotcheck precede any authorized local Conventional Commit. No AI attribution.
- Preserve the original three untracked plan/design/task documents and existing acceptance/T3 trackers and mirrors.
- Forecast I1: approximately 300–400 authored lines for one coherent test plus process fixture, advisory only. Do not omit assertions or compress code to meet this heuristic. Delivery strategy: ask-on-risk; no remote delivery authorized.

## Reconciled evidence and limits
- Existing acceptance tracker odd/tasks/provider-orchestration-acceptance.md and full mirror observation12506 reconciled. Its completed root gates are historical evidence at the previous source anchor plus test-only baseline correction, not fresh results here.
- Original plan/design/local tracker read in full; original full-memory locator remains absent. Do not claim cross-store equality for unavailable historical mirrors.
- Later T3 tracker reconciled to its four full ordered mirror parts. Its successful five-vendor legacy run and separately isolated generated-code tests are NOT live durable restart proof.
- Public runDurableWorkflow calls prepareTask before child lease/task-attempt admission. Pause at this boundary after a completed task, then terminate the worker process. Do not describe cancellation or evidence-free in-flight recovery as completed-stage restart.
- Public createCliDriverFactory advertises reconstructed context only and refuses native continuation. Qualification covers reconstructed continuation, never vendor-native resume.
- SQLite reference runtime requires Node >=24.15. Explicit cached Node24.19.0 supports it; no lower-floor SQLite claim.
- Existing coordinator fixture provides real local SQLite/artifact authority and loopback HTTP. Same-host forked clients/workers are not independent hosts.
- Coordinator test dependencies do not declare adapter-cli. Session already declares it. Proposed fixture resolution uses Node public package resolution from the existing session manifest, then imports the resolved public root under brambo-source; no private adapter import, manifest/dependency change or package install. Parent approved this test-only existing-workspace dependency reuse; it is not a published-consumer pattern.

## Tasks
- [ ] I1 — Synthetic public CLI durable restart qualification, then separately scoped live qualification only after independent review and explicit invocation approval.
- [ ] I2 — Offline declared-runtime and exact packaged-identity local qualification using cached runtimes; hosted CI remains pending authorization.
- [ ] I3 — Genuine independent-host actors/leases/revocation/artifacts qualification; currently NOT EXECUTABLE.

### I1 acceptance and checks
Use actual production CLI driver factories and actual OpenCode/Claude/Codex adapter factories with a synthetic custom ChildProcessSpawner. No binary or network launch. Three serial stages, maxAttempts1.
1. First worker completes one stage and publishes an immutable artifact revision. Pause before admission of stage2; stage2 remains pending with attempt0 and no spawn.
2. Hard-terminate the real worker; reopen through a fresh worker after bounded lease expiry. Preserve run/session/base identity and completed stage result/revision; complete only remaining stages. Synthetic spawn ledger proves exactly one invocation per stage.
3. Completed artifacts remain integrity-checked and readable through public artifact ports. Expired actor/lease cannot commit or publish; current actor must be reauthorized for reconstruction before dispatch. A revoked actor receives no subsequent spawn.
4. An evidence-free in-flight task is blocked rather than automatically repeated. Existing uncertain recovery coverage may be invoked explicitly; do not silently label checkpoint proof as in-flight proof.
5. RED must be an observed behavior failure against the test harness's missing admission-boundary behavior, not an import/launcher error or an invented SDK failure. Then minimal fixture GREEN and full owning suite. Refactor only after GREEN.
Exact owning manifest runners (under scoped Node24.19/pnpm11.23):
```text
pnpm --filter @brambodev/workflow-coordinator test test/durable-cli-restart.test.ts
pnpm --filter @brambodev/workflow-coordinator test
pnpm --filter @brambodev/workflow-coordinator typecheck
pnpm --filter @brambodev/workflow-coordinator lint
pnpm --filter @brambodev/orchestration test test/recovery.test.ts
pnpm --filter @brambodev/adapter-cli test
git diff --check
```
Source fixture syntax/type checks are included in owning typecheck; explicit Node --check if an .mjs fixture is selected. Record all actual counts/skips/warnings/elapsed and safe failure names. Parent chooses any SDK repair only after a deterministic defect map; this task does not authorize new SDK APIs.
Rollback boundary: only the new qualification test/fixture and this tracker, not existing SDK behavior or historical acceptance evidence.

### I2 acceptance and checks
Declared consumer floor >=20 except optional workflow-store-sqlite >=24.15; root developer tooling >=24. Cached Node20.20,22.13/22.18/22.19,24.19 and26.8 metadata were previously verified, not fresh PASS here.
- Generate/verify packed identity at this exact source boundary; sha256 manifest must bind every actual tarball. Run the trusted public consumer probe under each declared runtime selected by the parent. On Node20/22 assert the typed SQLite-unavailable boundary, not skipped success.
- Existing `node scripts/consumer-smoke.mjs <tarball-directory>` performs npm install; invoke only with enforced npm_config_offline=true, fresh anonymous configs and coherent synthetic home/temp/PATH/COMSPEC. Missing offline external dependency stops without download.
- Preparation runners: `pnpm build`; pack each publishable package through existing offline tooling; explicit cached Node `scripts/consumer-smoke.mjs <owned-tarball-directory>`. Final exact runtime matrix and cache prerequisites must be resolved/read back before execution.
- No new CI workflow edit yet. Existing workflow manual dispatch does not run push-only package/consumer identity jobs. Hosted proof requires explicit repository, branch/push or dispatch operation, credential/session and transfer scope. Local tests cannot close hosted CI.

### I3 acceptance and blocker
Need two genuinely independent guest/physical hosts, separate actor principals, leases, revocation and immutable artifact integrity. Containers sharing a kernel and two WSL distributions do not prove independent hosts.
Local readiness map: only docker-desktop WSL distribution; Hyper-V components present but localhost guest inventory lacked current permissions. No authorized guest provisioning/start/download or remote destination/session.
I3 remains NOT EXECUTABLE until the parent obtains a concrete authorized host topology. No ambient SSH, agent, socket, Docker context, cloud endpoint or CI credential discovery. No worker question to the user.

## Execution safeguards
All test/build children receive coherent code-owned Win32-native synthetic profiles/temp/config/PATH, anonymous npm configs and offline mode; exclude real provider opt-ins/runtime hooks/secrets. Explicit cached Node24.19.0 and pnpm11.23.0; no Corepack fetch.
Only synthetic loopback coordinator traffic and owned temporary SQLite/artifact workspaces are allowed. Capture bounded counters/status/assertion names; no raw provider output, headers, messages, credentials or actual environment values.
Clean up only resolved owned absolute temp paths using one filesystem API; preserve unrelated files. No live harness host.mjs invocation.
Each task updates this full document and mirror after observed evidence. Source-changing normalizers precede checks/review. No commit until parent review/spotcheck; no push/PR.

## Current progress
Tracker was created before source writes and full mirror12557 read back exactly. Parent approved the public-root resolution seam and bounded fixture design. I1 synthetic functional qualification is ready for independent review; the full I1 checkbox remains open because live-vendor durable qualification has NOT run. I2 and I3 remain pending. No native CLI/provider, package download, auth store, actual environment values or remote execution was accessed.

### I1 observed TDD and qualification
- Added packages/workflow-coordinator/test/durable-cli-restart.test.ts; extended the existing test-only fixtures/worker-process.ts. No SDK source, manifest, public API or dependency change.
- Genuine RED: exact focused coordinator runner exit1,12,040ms; one file/two failed tests. Both expected checkpoint IPC but existing fixture returned done after running past admission. No import or launcher failure was counted as RED.
- Minimal fixture correction uses production createCliDriverFactory and actual createOpenCodeAdapter/createClaudeCodeAdapter/createCodexAdapter through the public package root, with synthetic custom spawners. Only external process behavior is replaced; coordinator/remote clients/SQLite/runtime/artifact/publication are real.
- Intermediate implementation checks failed and were investigated before correction: Windows dynamic import of an absolute public-root path produced ERR_UNSUPPORTED_ESM_URL_SCHEME; pathToFileURL(publicEntry).href fixed the fixture transport without bypassing package exports. Synthetic newline escaping and unconditional OpenCode endStdin caused synthetic refusal; fixed literal newlines and the prompt-delivery discriminator. These are fixture defects, not invented SDK defects.
- Focused GREEN: exact runner exit0,16,023ms; one file/two passed tests. After GREEN, removed a redundant mode variable and added independent literal-byte SHA256/size expectations to the existing immutable artifact assertion, then ran the full owning suite.
- New proof: worker-a actually hard-terminated at task-b prepareTask checkpoint; task-a succeeded/attempt1, tasks-b/c pending/attempt0. Fresh worker-b reopened clients/runtime after recorded parent capability expiry; final a/b/c each succeeded/attempt1, exact spawn ledger OpenCode/Claude/Codex once each. Run/session/base identity and completed checkpoint are unchanged. Public materialization returned exactly the expected28 artifact bytes with matching SHA256/manifest revision.
- Expired original authenticated worker capability cannot commit or publish. In the separate revoked reconstruction run, only completed OpenCode spawned; downstream b blocked/attempt1 and c pending/attempt0. Actor policy rejects reconstruction before runtime/driver dispatch. No claim is made that internal CLI vendor HTTP requests are counted.
- This is an actual same-host SQLite/coordinator/worker process test with synthetic vendor streams, NOT live providers, genuine independent hosts, native vendor resume, coordinator process restart or evidence-free in-flight replay.
- Existing public engine recovery regression was separately run: eleven tests passed, including crash after admission without durable effect evidence blocks reopening and never repeats the attempt. Its file-backed fixture is separate from the new actual SQLite process checkpoint proof.

### I1 exact observed checks
Under explicit Node24.19.0/pnpm11.23.0, synthetic Win32-native profile/temp/COMSPEC/PATH, anonymous npm configs and offline mode:
- pnpm --filter @brambodev/workflow-coordinator test test/durable-cli-restart.test.ts — RED2failed then GREEN2passed as above.
- pnpm --filter @brambodev/workflow-coordinator typecheck — exit0,1,307ms.
- pnpm --filter @brambodev/workflow-coordinator lint — exit0,25,531ms.
- pnpm --filter @brambodev/workflow-coordinator test — exit0,26,858ms;5files/78passed tests,0failed/0skipped. This includes the new two tests after refactor/digest assertion and all pre-existing coordinator cases.
- pnpm --filter @brambodev/orchestration test test/recovery.test.ts — exit0,7,817ms;1file/11passed tests,0failed/0skipped.
- pnpm --filter @brambodev/adapter-cli test — exact manifest excludes live suites; exit0,6,413ms;11files/169passed tests/5skipped/0failed. Individual skip names were not retained by the bounded reporter; no claim those cases ran.
- git diff --check — exit0 after removal of a trailing blank line. Existing LF-to-CRLF warning remains disclosed; no check exemption.
- Owning typecheck covers the .ts fixture; no .mjs source fixture was added, so node --check for a source .mjs fixture is N/A.
- The three protected original untracked documents matched recorded SHA256 values. Prior acceptance tracker/mirror were not rewritten. Current source HEAD remains d190717; no staging/commit/push/PR.
- Authored test/fixture changes: new test124lines, existing fixture67additions/6deletions. Tracker is the third work-unit file. No source-mutating formatter was run after verification.
Cleanup: owned brambo-integration-Fa85HH resolved beneath the absolute intended TEMP boundary and was removed using one native Node filesystem operation; fresh Test-Path returned false. All test-created workspaces/diagnostic fixtures/configs/caches/shims were confined below that root and removed. Full tracker/mirror readback is checked after this final evidence update.
Next: parent independent review and fresh spotcheck. Live qualification remains pending explicit invocation approval; I2 cached packaged-runtime verification is not represented as executed.

## I1 independent review P2: reopened counter sensitivity
Independent review identified that cli-calls.log was appended only after JSON/context validation. A wrongly dispatched child that refused malformed reconstructed context could escape the ledger; therefore prior zero-dispatch counter evidence alone was insufficient. Existing successful-stage, lease and artifact observations remain historical, but I1 awaits this bounded correction and independent followup.
Parent authorized test-only strict-TDD sensitivity regression: deliberately dispatch the actual public CLI composition with malformed context; assert the attempt remains recorded even though it refuses. Then move the ledger append to spawn entry before parsing/validation. Preserve original successful counts and revoked actor zero downstream dispatch. No production source, API, dependencies, native CLI/provider or network.
Exact correction checks: focused durable-cli-restart file, full workflow-coordinator tests/typecheck/lint and git diff --check under the previously working scoped Node24.19/pnpm11.23 wrapper. No commit until followup review; freeze candidate after observed checks.

### I1 P2 correction: observed RED/GREEN and candidate freeze
- Sensitivity regression uses the actual public CLI driver/adapter composition; a test-only malformed-context mode deliberately dispatches Claude with null reconstruction after OpenCode succeeded. No SDK behavior was altered.
- RED exact command: pnpm --filter @brambodev/workflow-coordinator test test/durable-cli-restart.test.ts --testNamePattern 'spawn ledger records' — exit1,6,331ms;1failed/2name-filtered skips. Task-b actually blocked at attempt1, but ledger incorrectly contained only opencode instead of literal expected opencode+claude-code. This is a behavioral counterproof, not a launcher/import failure.
- Minimal GREEN moved code-owned ledger append to synchronous spawn entry, before command check, JSON parsing or context validation. It no longer depends on successful parsing. The append records the known fixture stage enum, never raw command/argv/prompt/output.
- Exact full focused file: pnpm --filter @brambodev/workflow-coordinator test test/durable-cli-restart.test.ts — exit0,18,554ms;1file/3passed tests,0failed/0skipped. Original restart and revoked-actor assertions remained unchanged; successful counts still exactly one per stage, revoked actor still zero downstream spawn attempts. Sensitivity test confirms malformed refusal remains counted.
- Exact full owning suite: pnpm --filter @brambodev/workflow-coordinator test — exit0,20,053ms;5files/79passed tests,0failed/0skipped.
- pnpm --filter @brambodev/workflow-coordinator typecheck — exit0,1,626ms.
- pnpm --filter @brambodev/workflow-coordinator lint — exit0,8,808ms.
- git diff --check — exit0. Existing LF-to-CRLF warning remains disclosed. No source normalization/refactor after these checks.
- Fresh source candidate: new durable-cli-restart.test.ts152lines, SHA256 0d76d19cbbd324c50bd26508ada7f6b419df3d17fa85ecae76bdcc4ba5264fda; worker-process.ts145lines, SHA256 1c0a1bbfc2607b5fcf537ff611f085df1bee903e883b481fd44b878a59636325; existing fixture diff75additions/6deletions. Correction added one sensitivity test and its malformed input mode plus immediate counter; no other feature.
- Owned correction wrapper root brambo-integration-8D3VCF resolved below the intended absolute TEMP directory, removed with one native filesystem API, then fresh Test-Path returned false. Prior owned root was already absent; no unrelated cleanup.
- Candidate source frozen for independent followup after these checks. No commits/staging, new dependency, package pull/install, SDK source, native CLI/provider, real environment-value/auth-store access, network or remote operation. I1 full/live and I2/I3 remain pending as previously scoped.
Next: independent P2 correction followup and parent fresh spotcheck; do not mutate candidate source while review is active.

### I1 independent followup and parent fresh spotcheck
- Independent followup closed the sole P2 counter-sensitivity finding: fresh focused3tests passed at exact reviewed source hashes.
- Parent fresh spotcheck used explicit Node24.19 and the owning Vitest CLI directly:1file/3tests passed,0failed,exit0; total19.70s, test17.19s. This parent invocation used ambient environment, not the executor's synthetic wrapper; no clean-environment canary is claimed. Tests themselves use synthetic spawners and no credential lookup/native CLI/provider execution.
- Parent authorized a local Conventional Commit containing exactly the two qualification test/fixture files and this integration tracker. Preserve original three unrelated untracked documents; no push/PR/AI attribution. Synthetic I1 work unit is closed on reviewed proof; live I1 and I2/I3 remain open.

### Synthetic I1 local work-unit identity
- Initial local commit: 0a808125fccac340c0baac1111b516077ab04a98, test(workflow): qualify durable CLI checkpoint restart. Exactly the two reviewed test/fixture files and this tracker;343additions/6deletions at initial capture.
- This same work unit is amended once only to record initial identity and delivery evidence. Final amended HEAD is reported outside its own bytes, avoiding recursive embedded hashes. No source changes or test reruns during this documentation-only amendment; no push/PR/AI attribution.
- Reviewed source hashes remain unchanged. The task's total synthetic work unit stays below the advisory400 authored-line heuristic without omitted assertions or compression.
