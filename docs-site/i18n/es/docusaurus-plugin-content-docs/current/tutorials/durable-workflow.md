---
title: Su primer flujo durable
audience: Platform engineers adopting the durable world
prerequisites: Node.js >=24.15.0 (required by the SQLite store)
outcome: Ejecutar un flujo durable de dos tareas sobre SQLite, ver sus eventos y observar la admisión idempotente
scope: runDurableWorkflow con workflow-store-sqlite y workspace-artifacts-local en 0.5.x
compatibility: Node.js >=24.15.0 for workflow-store-sqlite; other packages Node.js >=20
translationStatus: translated
---
# Su primer flujo durable

Este tutorial ejecuta de principio a fin un flujo de dos tareas en una sola máquina: un almacén de ejecuciones SQLite, un almacén local de artefactos direccionado por contenido y el motor durable. Cada tarea escribe un archivo en su propia copia privada del espacio de trabajo; el motor protege cada confirmación con un lease y registra cada transición como un evento. Lleva unos diez minutos.

Aquí las tareas escriben archivos directamente para que la mecánica sea visible. En un host real, `executeTask` ejecuta un executor o un driver (normalmente mediante `runtime-local`); todo lo demás es igual.

## Instalación

```bash
npm install @brambodev/orchestration @brambodev/contracts @brambodev/workflow-store-sqlite @brambodev/workspace-artifacts-local
```

`@brambodev/workflow-store-sqlite` usa `node:sqlite` y requiere Node.js 24.15.0 o posterior; con un Node.js anterior, `openSqliteRunStore` lanza `BRAMBO_WORKFLOW_STORE_UNAVAILABLE`.

## El programa

Guárdelo como `durable-workflow.mts`:

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

Ejecútelo:

```bash
node durable-workflow.mts
```

Salida esperada (los resúmenes criptográficos varían en cada máquina):

```text
admission: accepted
run: succeeded 7
  write-notes succeeded sha256:2b740f8e...
  summarize succeeded sha256:f036ddf9...
events: workflow.definition, run.running, task.attempt.started, task.succeeded, task.attempt.started, task.succeeded, run.succeeded
resubmit: duplicate
```

Este programa se ejecutó contra el código fuente de 0.5.x en Node.js 25.9.0 al redactar esta página. Node.js 24 elimina los tipos de TypeScript y ejecuta el archivo directamente.

## Qué acaba de ocurrir

1. **Preparar.** `artifacts.stage` copió `input/` en un almacenamiento direccionado por contenido y devolvió un manifiesto cuya `revision` es un resumen criptográfico. Preparar no es progreso: todavía nada lo referencia.
2. **Admitir.** `store.create` creó de forma atómica la ejecución en la revisión 0 y admitió el comando `start`. Reenviar el mismo comando por el mismo actor devolvió `duplicate`, no una segunda ejecución.
3. **Reclamar y publicar.** El lease padre cubre `run:run-1` y `workspace:source`. Publicar la entrada bajo ese lease asoció la revisión preparada al espacio de trabajo `source`.
4. **Ejecutar.** Para cada tarea, el motor llamó a `prepareTask` para obtener un identificador de espacio de trabajo aislado, reclamó un lease hijo sobre `task:run-1:<task>` y ese espacio de trabajo, llamó a `executeTask`, publicó la salida preparada bajo el lease hijo y confirmó el checkpoint con una comparación e intercambio sobre la revisión de la ejecución. Siete confirmaciones llevaron la ejecución de la revisión 0 a la 7.
5. **Dependencias.** `summarize` depende de `write-notes`, así que se ejecutó en segundo lugar y materializó la salida de la primera tarea (`context.artifacts` enumera la entrada de la ejecución seguida del espacio de trabajo de cada tarea completada).

## Pruebe una caída

Ejecute el programa una segunda vez contra la misma base de datos (sustituya `mkdtemp` por un directorio fijo). `create` responde `duplicate` y `runDurableWorkflow` devuelve la instantánea `succeeded` guardada sin ejecutar nada. Si se mata el proceso mientras se ejecuta una tarea y se vuelve a empezar cuando caduca el lease, el motor encuentra la tarea `running` sin evidencia de efectos y la marca `blocked` con `uncertain-attempt-recovery` en lugar de suponer que repetirla es seguro. Consulte [Modelo de durabilidad](../explanation/durability).

## Próximos pasos

- [Orquestación durable](../guides/durable-orchestration): autoridad, recuperación e importación.
- [Referencia de la semántica durable](../reference/durable-semantics): cada estado, evento y límite.
- [Coordinador y worker](../guides/coordinator-and-worker): llevar la ejecución a un proceso separado.
