---
title: "Desplegar un coordinador propio"
audience: Integradores del SDK
prerequisites: Node.js >=20; SQLite >=24.15.0
outcome: Componer puertos con autoridad del host
scope: Orquestación durable del SDK
compatibility: Node.js >=20; SQLite >=24.15.0
translationStatus: translated
---

# Desplegar un coordinador propio

Brambo exporta funciones de composición, no una cuenta alojada, ejecutable de servidor ni comando de despliegue. El host opera el endpoint, la identidad, el almacenamiento autoritativo, la retención de artefactos y los procesos de trabajo.

## Proceso del plano de control

Proporcione callbacks asíncronos obligatorios de autenticación, autorización por operación/recurso y elegibilidad separada de trabajadores. La ausencia de callbacks impide el acceso. Este fragmento verificado por tipos no abre un servidor ni proporciona autenticación permisiva.

```ts
import { createWorkflowCoordinator } from '@brambodev/workflow-coordinator'
import type { WorkflowCoordinatorOptions } from '@brambodev/workflow-coordinator'
import type { Server } from 'node:http'

declare const server: Server // Host owns listen/TLS/proxy/shutdown.
declare const host: WorkflowCoordinatorOptions // Mandatory auth/authz/worker callbacks.
const coordinator = createWorkflowCoordinator(host)
server.on('request', coordinator.handler)
// During host shutdown: await coordinator.close(); then close host-owned resources.
```

## Proceso de trabajo separado

Ejecute este fragmento en un proceso distinto supervisado por el host. Proporcione endpoint/transporte explícitos y encabezados de autorización vigentes. Reautorice `WorkerAuthorizationContext.actor` del recibo inicial antes de cada efecto nuevo o consulta de secretos; la identidad del trabajador y los argumentos del modelo no otorgan esa autoridad. Los servicios del host validan esquemas/aprobaciones y redactan resultados.

```ts
import { createWorkflowWorker } from '@brambodev/workflow-coordinator'
import type { WorkflowWorkerOptions } from '@brambodev/workflow-coordinator'
import { createRemoteRunStore, createRemoteArtifactProvider } from '@brambodev/workflow-remote'
import type { RemoteClientOptions } from '@brambodev/workflow-remote'
import { createLocalExecutionRuntime } from '@brambodev/runtime-local'
import { runDurableWorkflow } from '@brambodev/orchestration'

declare const remote: RemoteClientOptions // Explicit endpoint/fetch/fresh auth headers.
declare const host: Pick<WorkflowWorkerOptions,
  'workerId' | 'principal' | 'definitions' | 'drivers' | 'services'>
declare const shutdown: AbortSignal
const store = createRemoteRunStore(remote)
const artifacts = createRemoteArtifactProvider(remote)
const runtimeOptions = { rootDir: './worker-private', artifacts, ttlMs: 30_000, renewalMs: 10_000 }
const worker = createWorkflowWorker({ ...host, store, artifacts, execute: runDurableWorkflow,
  runtime: createLocalExecutionRuntime({ ...runtimeOptions, store }),
  runtimeForTask: context => createLocalExecutionRuntime({ ...runtimeOptions, store: context.store }),
  leaseTtlMs: 30_000, renewalMs: 10_000, concurrency: 1 })
try { await worker.runOnce(shutdown) }
finally { await worker.stop(); await store.close() }
```

Cada runtime hijo con renovación utiliza el `context.store` nuevo de `runtimeForTask`. No reasigne un runtime compartido a otra tarea. El trabajador renueva al padre y el runtime al hijo. Sus tokens y épocas son distintos. El plano de control no expone ejecución de herramientas; `runOnce` realiza una consulta acotada, no despliega un daemon automáticamente.

## Lista de despliegue

- [ ] Use TLS/proxy propios, clientes/trabajadores autenticados independientemente, autorización vigente y secretos con privilegios mínimos. No copie aprobaciones ni credenciales de otros usuarios.
- [ ] Sitúe SQLite en un único host autoritativo con almacenamiento local y Node >=24.15.0, no en un montaje compartido entre hosts. Seleccione otro backend conforme si es necesario.
- [ ] Defina plazos, margen de renovación/TTL, supervisión y apagado. Abort solicita cancelación; no demuestra terminación del sistema operativo.
- [ ] Seleccione copias de seguridad, cifrado, retención y limpieza de huérfanos. Los eventos/recibos conservan historial; no se proporciona poda automática.
- [ ] Mantenga los cuerpos de solicitud en 1 MiB como máximo; el límite predeterminado de respuesta remota es 1 MiB y cada página admite como máximo 256 eventos. El contexto requerido ausente o que excede el límite bloquea la operación en lugar de truncarse.
- [ ] Pruebe la topología y plataforma reales. Las pruebas sintéticas locales de loopback/procesos no demuestran despliegue externo, durabilidad distribuida ni aislamiento.

## Desconexión, toma de control y evidencia

Los clientes nunca crean un escritor local alternativo. La reconexión consulta instantáneas y páginas por cursor; reproducir no ejecuta herramientas. La repetición es explícita y conserva comando/actor/clave idempotente. Consulte la autoridad antes de repetir respuestas de mutaciones inciertas. Un escritor activo provoca contención; caducidad/traspaso avanzan fencing y los trabajadores obsoletos no confirman estado autoritativo ni progreso. Una concesión de metadatos no protege un sistema de archivos compartido sin fencing ni cualquier efecto externo.

La ejecución alojada de Windows/Linux y la aceptación de instalación empaquetada siguen pendientes. No se contactaron proveedores activos ni hosts remotos para esta documentación. Consulte [clientes remotos](../packages/workflow-remote.md) y [garantías durables](./durable-orchestration.md).
