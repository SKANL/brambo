---
title: Referencia de la semántica durable
audience: Platform engineers and RunStore implementers
prerequisites: Read the durability model
outcome: Consultar cada resultado de RunStore, regla de lease, fase de recibo, tipo de evento y límite del mundo durable
scope: 'Tipos durables de @brambodev/contracts, motor de @brambodev/orchestration y @brambodev/workflow-store-sqlite en 0.5.x'
compatibility: Node.js >=20; workflow-store-sqlite requires Node.js >=24.15.0
translationStatus: translated
---
# Referencia de la semántica durable

Comportamiento exacto del mundo durable, tomado del código fuente de 0.5.x. Para el razonamiento que lo sustenta, lea [Modelo de durabilidad](../explanation/durability).

## Identificadores

| Tipo | Forma |
|---|---|
| `RunKey` | `{ namespace, runId }` |
| `WorkspaceRef` | `{ namespace, workspaceId, revision }` |
| `Principal` | `{ namespace, subject }`, suministrado por su host de confianza |
| Sintaxis de identificadores | `^[A-Za-z0-9][A-Za-z0-9._-]*$` |

## Instantánea de ejecución

`RunSnapshot` tiene `schemaVersion: 1`, `key`, `revision`, `workflowId`, `workflowVersion`, `sessionId`, `status`, `workspace`, `tasks`, `context` (JSON), `cancelRequested` y, de forma opcional, `binding`, `lineage`, `importState` y `executionConfigurations`. `workflowId`, `workflowVersion`, `sessionId` y `lineage` son inmutables tras la creación.

| Campo | Valores |
|---|---|
| `status` de la ejecución | `pending`, `running`, `succeeded`, `failed`, `cancelled`, `blocked` |
| `phase` de la tarea | Cualquier estado de ejecución, más `uncertain` |
| Checkpoint de tarea | `taskId`, `phase`, `attempt` y, opcionalmente, `effectId`, `result`, `workspace`, `error { code, message }` |

## Operaciones de RunStore

| Método | Resultado |
|---|---|
| `create(snapshot, command, actor)` | `accepted` con recibo, `duplicate` con el recibo original o `conflict`. Requiere `revision: 0`, un comando `start` y una clave coincidente. |
| `admit(command, actor)` | `accepted`, `duplicate` o `conflict` (también `conflict` si la ejecución no existe o tiene fencing de importación). |
| `get(key)` | La instantánea o `undefined`. |
| `receipt(namespace, id)` | El recibo o `undefined`. |
| `pending(namespace, limit, filter?)` | Recibos en `accepted` o `running`, del más antiguo al más reciente. |
| `commit({ snapshot, expectedRevision, lease, events, receipt? })` | `committed` con la instantánea, `conflict` (la revisión cambió) o `stale-lease`. |
| `events(key, after, limit)` | Una página: `status` `ok`, `empty` u `overflow`, `events`, `latestCursor`, `nextCursor`. |
| `claim(namespace, resources, ownerId, ttlMs)` | `acquired` con un lease, o `contended`. Todo o nada. |
| `claimImportFence?(key, ownerId, ttlMs)` | Opcional; reclama `import:<runId>` para `importWorkflowRun`. |
| `renew(lease, ttlMs)` | `acquired` (mismo token y épocas, caducidad posterior) o `contended`. |
| `release(lease)` | Sin valor; un lease falsificado o que no coincide no tiene efecto. |
| `valid(lease)` | Booleano. |
| `close()` | Cierra el almacén. |

## Comandos y recibos

- `Command` es `{ key, clientId, idempotencyKey, kind: 'start' | 'continue' | 'cancel', payload }`.
- La clave de idempotencia es `(namespace, clientId, idempotencyKey)`. El mismo comando con el mismo actor (comparados de forma canónica, sin importar el orden de las claves) es `duplicate`; cualquier otra cosa con esa clave es `conflict`.
- `CommandReceipt` es `{ id, command, actor, phase, outcome? }` con `phase` en `accepted → running → completed | blocked`.

## Leases y fencing

- `Lease` es `{ namespace, ownerId, token, expiresAt, epochs }`. `epochs` asigna a cada recurso un entero `>= 1` y no puede estar vacío.
- Recursos: `run:<runId>`, `workspace:<workspaceId>`, `task:<runId>:<taskId>`, `import:<runId>`. `leaseResources(key, workspaceId)` devuelve el par de ejecución y espacio de trabajo.
- Cada reclamación sobre un recurso fija su época en el valor anterior más uno; las épocas sobreviven a la liberación y nunca se reinician.
- Una confirmación debe tener un lease vigente que cubra `run:<id>` y el `workspace:<id>` actual y el siguiente. En el almacén SQLite, «vigente» significa que coinciden el hash del token, el dueño, las épocas y la caducidad, y que `expiresAt` está en el futuro.
- El token es un secreto al portador: el almacén SQLite solo guarda su hash SHA-256 y los hosts nunca deben persistirlo.

## Comportamiento del motor (`runDurableWorkflow`)

- **Un único dueño de CAS.** Una cola serializada confirma cada transición con `expectedRevision = current.revision`. Cualquier resultado distinto de `committed` detiene la ejecución con ese estado como error.
- **Leases hijos.** Cada tarea reclama `task:<runId>:<taskId>` y su propio `workspace:<id>` con un dueño nuevo. Una reclamación en contención marca la tarea `blocked` con `task-lease-contended`. Un identificador de espacio de trabajo reutilizado falla con `Workspace isolation required`.
- **Publicación.** Los artefactos se publican bajo el lease hijo, fuera de la cola; después el checkpoint se confirma por CAS. El lease hijo no puede contener un recurso `run:` ni reutilizar el token padre.
- **Estado terminal.** Con `cancelRequested`: `cancelled` si cada tarea está `cancelled`, `pending` o `succeeded`; si no, `blocked`. Sin él: `succeeded` si todas las tareas terminaron bien, `failed` si alguna falló y, en otro caso, `blocked`.
- **Ya terminada.** Una ejecución que ya está `succeeded` o `cancelled` se devuelve sin cambios.
- **TTL hijo predeterminado**: 60 s (`taskLeaseTtlMs`).

### Recuperación

Una tarea encontrada en `running`, `uncertain`, `blocked` o `failed` al arrancar solo se reintenta cuando este intento tiene evidencia de efectos, existe al menos un registro de efecto, cada registro está completado o no es `non-idempotent`, y `attempt < maxAttempts`. Si no, pasa a `blocked` con `uncertain-attempt-recovery` ("Durable effects do not prove replay safe"). Tras una ejecución fallida, la tarea pasa a `pending` (segura, quedan intentos), `failed` (segura, agotada) o `blocked`.

### Diario de efectos

| `journal.begin(call, effect)` devuelve | Cuándo |
|---|---|
| `'completed'` | Existe un registro completado; se emite `task.effect.replayed` y `journal.result(callId)` devuelve el resultado guardado. |
| `'uncertain'` | Existe un inicio en el mismo intento, o el efecto es `non-idempotent`. |
| `'new'` | En otro caso; se emite `task.effect.started`. Llame a `journal.finish(callId, result)` al terminar. |

`begin` lanza `Task effect admission stopped` cuando la ejecución se está deteniendo o el lease hijo no es válido, y `Effect identity conflict` cuando un identificador de llamada vuelve con otra llamada u otra clase de efecto.

### Cancelación

Una cancelación se admite con `clientId: 'durable-engine'` e `idempotencyKey: cancel:<namespace>:<runId>`. Una cancelación posterior a una confirmación terminal emite `run.cancel.too-late` y completa su recibo con `{ applied: false }`.

## Tipos de evento

`workflow.definition` (lleva la huella SHA-256 de la definición), `run.running`, `run.<status>`, `task.attempt.started`, `task.retry.ready`, `task.blocked`, `task.cancelled`, `task.succeeded`, `task.effect.started`, `task.effect.completed`, `task.effect.replayed`, `run.cancel.requested`, `run.cancel.too-late`, `run.import.completed`.

Los eventos llevan `schemaVersion: 1`, `key`, un `cursor` monótono por ejecución, `type`, `payload` y `occurredAt`.

## Límites

| Límite | Valor |
|---|---|
| Eventos por confirmación (SQLite) | 256 |
| Tamaño de página de `events` y `pending` | 256 |
| Espera por bloqueo de SQLite | 100 ms, después `BRAMBO_WORKFLOW_STORE_BUSY` |
| Cuerpo del protocolo (coordinador y cliente remoto) | 1 MiB por defecto |
| Valores predeterminados de importación | 100.000 eventos, 100.000 entradas de manifiesto, 64 MiB por artefacto, 512 MiB en total, 64 MiB de historial de efectos |

## Errores del almacén SQLite

| Código | Significado |
|---|---|
| `BRAMBO_WORKFLOW_STORE_UNAVAILABLE` | Node.js anterior a 24.15.0, o no se pudo abrir la base de datos |
| `BRAMBO_WORKFLOW_STORE_BUSY` | Otro escritor retuvo la base de datos más allá de la espera acotada |
| `BRAMBO_WORKFLOW_SCHEMA_UNSUPPORTED` | La base de datos no la creó la versión de esquema 1 |
| `BRAMBO_WORKFLOW_STORE_INVALID` | Entrada inválida, como una ruta vacía o más de 256 eventos en una confirmación |

Las precondiciones del motor y los rechazos de importación son instancias simples de `Error` con mensajes descriptivos (`Run not found`, `Workflow compatibility mismatch`, `Import denied` y similares); todavía no llevan código.

## Conformidad

`runWorkflowStoreContractSuite(harness)` de `@brambodev/contracts` ejecuta las cláusulas `workflow-lease-authenticity`, `workflow-committed-reopen`, `workflow-admission`, `workflow-reopen`, `workflow-scoped-reads`, `workflow-atomic-commit-and-fencing` y `workflow-lease-lifecycle` contra cualquier `RunStore`. El harness suministra `open()` (almacenamiento nuevo), `reopen()` (el mismo almacenamiento) y `advance(ms)` (el reloj de autoridad). Consulte [Suites de contrato](../guides/contract-suites).
