---
title: Your first durable workflow
audience: Platform engineers adopting the durable world
prerequisites: Node.js >=24.15.0 (required by the SQLite store)
outcome: Run a two-task durable workflow on SQLite, see its events, and observe idempotent admission
scope: runDurableWorkflow with workflow-store-sqlite and workspace-artifacts-local in 0.5.x
compatibility: Node.js >=24.15.0 for workflow-store-sqlite; other packages Node.js >=20
translationStatus: original
---
# Your first durable workflow

This tutorial runs a two-task workflow end to end on one machine: an SQLite run store, a local content-addressed artifact store, and the durable engine. Each task writes a file into its own private copy of the workspace; the engine fences every commit with a lease and records every transition as an event. It takes about ten minutes.

The tasks here write files directly so the mechanics stay visible. In a real host, `executeTask` runs an executor or a driver (usually through `runtime-local`); everything else stays the same.

## Install

```bash
npm install @brambodev/orchestration @brambodev/contracts @brambodev/workflow-store-sqlite @brambodev/workspace-artifacts-local
```

`@brambodev/workflow-store-sqlite` uses `node:sqlite` and requires Node.js 24.15.0 or newer; on an older Node.js, `openSqliteRunStore` throws `BRAMBO_WORKFLOW_STORE_UNAVAILABLE`.

## The program

Save this as `durable-workflow.mts`:

```ts
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { leaseResources, type Command, type Principal, type RunSnapshot } from '@brambodev/contracts'
import { runDurableWorkflow, type WorkflowDefinition } from '@brambodev/orchestration'
import { openSqliteRunStore } from '@brambodev/workflow-store-sqlite'
import { createLocalArtifactProvider } from '@brambodev/workspace-artifacts-local'

const base = await mkdtemp(join(tmpdir(), 'brambo-tutorial-'))
const store = await openSqliteRunStore({ path: join(base, 'workflow.sqlite') })
const artifacts = createLocalArtifactProvider({ rootDir: join(base, 'artifacts'), store })

// 1. Stage the immutable input workspace.
const input = join(base, 'input')
await mkdir(input)
await writeFile(join(input, 'README.md'), '# demo\n')
const staged = await artifacts.stage('demo', input)

// 2. Admit the run idempotently.
const key = { namespace: 'demo', runId: 'run-1' }
const principal: Principal = { namespace: 'demo', subject: 'host' }
const definition: WorkflowDefinition = {
  id: 'docs-demo', version: '1',
  tasks: [
    { id: 'write-notes', dependsOn: [], driverId: 'inline', configuration: null, prompt: 'write notes', required: [], optional: [], maxAttempts: 1 },
    { id: 'summarize', dependsOn: ['write-notes'], driverId: 'inline', configuration: null, prompt: 'summarize', required: [], optional: [], maxAttempts: 1 },
  ],
}
const initial: RunSnapshot = {
  schemaVersion: 1, key, revision: 0, workflowId: definition.id, workflowVersion: definition.version,
  sessionId: 'session-1', status: 'pending',
  workspace: { namespace: 'demo', workspaceId: 'source', revision: staged.revision },
  tasks: [], context: null, cancelRequested: false,
}
const command: Command = { key, clientId: 'host', idempotencyKey: 'start-run-1', kind: 'start', payload: null }
const admitted = await store.create(initial, command, principal)
console.log('admission:', admitted.status)

// 3. Claim the parent lease and publish the input under it.
const claimed = await store.claim('demo', leaseResources(key, 'source'), principal.subject, 30_000)
if (claimed.status !== 'acquired') throw new Error('another writer owns this run')
await artifacts.publish(initial.workspace, staged, claimed.lease)

// 4. Run the graph. Each task works in a private directory and stages its output.
await mkdir(join(base, 'work'))
const controller = new AbortController()
try {
  const result = await runDurableWorkflow({
    key, principal, lease: claimed.lease, store, artifacts, definition,
    signal: controller.signal, concurrency: 1,
    prepareTask: async (context) => ({ ...context.snapshot.workspace, workspaceId: `${context.taskId}-${context.attempt}` }),
    executeTask: async (context) => {
      const directory = join(base, 'work', context.workspace.workspaceId)
      const latest = context.artifacts.at(-1)!.workspace // run input or the last succeeded task
      await artifacts.materialize(latest, directory)
      await writeFile(join(directory, `${context.taskId}.txt`), `done by ${context.taskId}\n`)
      const output = await artifacts.stage('demo', directory)
      return {
        outcome: { result: { status: 'ok', data: null, summary: `${context.taskId} finished` } },
        staged: output,
        workspace: { ...context.workspace, revision: output.revision },
        publicationLease: context.lease,
      }
    },
  })
  console.log('run:', result.status, result.revision)
  for (const task of result.tasks) console.log(' ', task.taskId, task.phase, task.workspace?.revision)
  const page = await store.events(key, 0, 256)
  console.log('events:', page.events.map((event) => event.type).join(', '))
  const again = await store.create(initial, command, principal)
  console.log('resubmit:', again.status)
} finally {
  await store.release(claimed.lease)
  await store.close()
}
```

Run it:

```bash
node durable-workflow.mts
```

Expected output (digests differ on your machine):

```text
admission: accepted
run: succeeded 7
  write-notes succeeded sha256:2b740f8e...
  summarize succeeded sha256:f036ddf9...
events: workflow.definition, run.running, task.attempt.started, task.succeeded, task.attempt.started, task.succeeded, run.succeeded
resubmit: duplicate
```

This program was run against the 0.5.x sources on Node.js 25.9.0 while writing this page. Node.js 24 strips the TypeScript types and runs the file directly.

## What just happened

1. **Stage.** `artifacts.stage` copied `input/` into content-addressed storage and returned a manifest whose `revision` is a digest. Staging is not progress: nothing references it yet.
2. **Admit.** `store.create` atomically created the run at revision 0 and admitted the `start` command. Resubmitting the identical command by the same actor returned `duplicate`, not a second run.
3. **Claim and publish.** The parent lease covers `run:run-1` and `workspace:source`. Publishing the input under that lease associated the staged revision with the `source` workspace.
4. **Run.** For each task, the engine called `prepareTask` for an isolated workspace id, claimed a child lease on `task:run-1:<task>` and that workspace, called `executeTask`, published the staged output under the child lease, and committed the checkpoint with a compare-and-swap on the run revision. Seven commits took the run from revision 0 to 7.
5. **Dependencies.** `summarize` depends on `write-notes`, so it ran second and materialized the first task's output (`context.artifacts` lists the run input followed by every succeeded task's workspace).

## Try a crash

Run the program a second time against the same database (replace `mkdtemp` with a fixed directory). `create` answers `duplicate`, and `runDurableWorkflow` returns the stored `succeeded` snapshot without executing anything. If you kill the process while a task runs and start again after the lease expires, the engine finds the task `running` with no effect evidence and checkpoints it `blocked` with `uncertain-attempt-recovery` rather than guessing that re-running it is safe. See [Durability model](../explanation/durability).

## Next steps

- [Durable orchestration](../guides/durable-orchestration): authority, recovery and import.
- [Durable semantics reference](../reference/durable-semantics): every status, event and limit.
- [Coordinator and worker](../guides/coordinator-and-worker): move execution to a separate process.
