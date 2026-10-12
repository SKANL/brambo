---
title: "Orquestación durable"
audience: Integradores del SDK
prerequisites: Node.js >=20; SQLite >=24.15.0
outcome: Componer puertos con autoridad del host
scope: Orquestación durable del SDK
compatibility: Node.js >=20; SQLite >=24.15.0
translationStatus: translated
---
import Diagram from '@site/src/components/Diagram'
import DurableLease from '@site/src/components/diagrams/DurableLease'


# Orquestación durable

Componga el SDK con una autoridad propia, artefactos inmutables y ejecución de confianza. No requiere una cuenta ni un servicio operado por Brambo. Las API sincrónicas existentes `runSession` y `runTaskGraph` no cambian.

## Composición local

Esta receta verificada por tipos declara entradas proporcionadas por el host; no es un lanzador autónomo. Publique primero el espacio inmutable inicial. Autorice al principal y al comando antes de admitirlos, y proporcione preparación y ejecución aisladas. Un único responsable de renovación del padre debe mantener la concesión actualizada y proporcionar `currentParentLease`; el motor no lo instala automáticamente.

```ts
import { openSqliteRunStore } from '@brambodev/workflow-store-sqlite'
import { createLocalArtifactProvider } from '@brambodev/workspace-artifacts-local'
import { leaseResources, type Command, type Principal, type RunSnapshot } from '@brambodev/contracts'
import { runDurableWorkflow, type DurableWorkflowOptions } from '@brambodev/orchestration'

// Host-supplied, already authorized inputs and isolated task execution.
declare const initial: RunSnapshot
declare const command: Command
declare const principal: Principal
declare const execution: Pick<DurableWorkflowOptions,
  'definition' | 'prepareTask' | 'executeTask' | 'signal' | 'currentParentLease'>

const store = await openSqliteRunStore({ path: './workflow.sqlite' })
const artifacts = createLocalArtifactProvider({ rootDir: './private-artifacts', store })
try {
  const admitted = await store.create(initial, command, principal)
  if (admitted.status !== 'accepted') throw new Error('Inspect existing admission before resuming')
  const claimed = await store.claim(initial.key.namespace,
    leaseResources(initial.key, initial.workspace.workspaceId), principal.subject, 30_000)
  if (claimed.status !== 'acquired') throw new Error('Active writer owns this run')
  try {
    await runDurableWorkflow({ ...execution, key: initial.key, principal,
      lease: claimed.lease, store, artifacts, concurrency: 1 })
  } finally { await store.release(claimed.lease) }
} finally { await store.close() }
```

## Autoridad y recuperación

<Diagram><DurableLease /></Diagram>

| Límite | Garantía y restricción |
|---|---|
| RunStore | CAS atómico de estado/eventos/recibo; un escritor padre con concesión vigente del run y espacio |
| SQLite de referencia | Node >=24.15.0; un host autoritativo local y conexiones locales; sin montaje compartido, clúster ni conmutación distribuida |
| Backend alternativo | Implemente el puerto neutral y ejecute la misma suite pública; la alternativa de pruebas tiene alcance local al proceso, no es un backend de producción |
| Artefactos | Prepare contenido inmutable, publique con concesión del espacio y confirme la referencia; los huérfanos no representan progreso |
| Runtime | Espacios privados y renovación hija; resolver la promesa es una devolución confiable, no aislamiento del sistema operativo ni prueba de terminación |
| Efectos | Los resultados completados se reproducen sin ejecutar; los efectos no idempotentes incompletos permanecen inciertos |

## Continuación e importación

Las identidades de run/sesión/espacio de Brambo son distintas de los identificadores nativos del proveedor. La continuación nativa requiere evidencia vigente y exacta de driver/versión/proveedor/cuenta/compatibilidad; de lo contrario se selecciona reconstrucción autorizada y acotada o un bloqueo tipado. La reconstrucción conserva el trabajo registrado, no el estado invisible del proveedor.

`importWorkflowRun` congela y copia explícitamente una instantánea terminal con autorización, huella exacta del workflow, linaje y comprobación de digests. El origen debe implementar la extensión de fencing de importación. La confirmación final del destino utiliza solo datos capturados; el origen puede continuar independientemente después. No se promete transacción distribuida, sincronización permanente, mezcla automática, migración de esquema, sesión nativa transferible ni herencia de secretos/aprobaciones. Se rechazan efectos ambiguos, comandos pendientes, colisiones, incompatibilidad o evidencia ausente. Consulte los límites en el [paquete de orquestación](../packages/orchestration.md).

## Evidencia y siguiente paso

La suite pública `runWorkflowStoreContractSuite` prueba admisión, reapertura confirmada, reproducción acotada, autoridad falsificada, CAS y toma de control. Utilice almacenamiento descartable y reloj inyectado. La suite modifica datos de prueba, no una base activa. Un resultado favorable es evidencia conductual acotada, no certificación de durabilidad distribuida. SQLite y la implementación de pruebas local al proceso usan las mismas cláusulas; controles defectuosos rechazan pérdida de historial y autoridad inválida.

La instalación de paquetes empaquetados, build, instalación congelada y aceptación alojada de Windows/Linux siguen sin verificarse para este cambio. Las comprobaciones locales no las reemplazan. La matriz candidata actual de consumidores en CI usa Node 20, 22.13.0, 22.18.0 y 24 en Linux; no prueba Windows. Las herramientas de desarrollo requieren Node >=24.

Continúe con [composición remota](./remote-orchestration.md) o [drivers/herramientas personalizados](./custom-drivers-and-tools.md).
