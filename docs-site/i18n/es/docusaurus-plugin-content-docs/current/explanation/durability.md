---
title: Modelo de durabilidad
audience: Platform engineers evaluating the durable world
prerequisites: Node.js >=20; Node.js >=24.15.0 for the SQLite store
outcome: Comprender qué sobrevive a una caída, qué se reproduce y qué se rechaza
scope: RunStore, leases, recibos, diario de efectos y artefactos en 0.5.x
compatibility: Node.js >=20; workflow-store-sqlite requires Node.js >=24.15.0
translationStatus: translated
---
import Diagram from '@site/src/components/Diagram'
import DurableLease from '@site/src/components/diagrams/DurableLease'

# Modelo de durabilidad

El mundo durable hace una sola promesa: **el estado confirmado de una ejecución nunca lo sobrescribe un escritor que perdió su reclamación, y el trabajo nunca se repite en silencio cuando brambo no puede demostrar que repetirlo es seguro.** No promete consenso distribuido, efectos secundarios exactamente una vez ni aislamiento de procesos.

<Diagram><DurableLease /></Diagram>

## Instantáneas y revisiones

Una ejecución es un `RunSnapshot`: su estado, los checkpoints de tareas, el contexto y la referencia al espacio de trabajo, en una `revision` entera. Cada cambio es una confirmación que indica la revisión que espera (`expectedRevision`) y escribe `revision + 1`. Si otro escritor confirmó antes, el almacén responde `conflict` y no se escribe nada. El estado, los eventos producidos por la transición y una actualización opcional del recibo se confirman de forma atómica.

## Leases y épocas de fencing

Antes de confirmar, un escritor reclama un lease sobre un conjunto de recursos: `run:<runId>`, `workspace:<workspaceId>` y, por tarea, `task:<runId>:<taskId>`. Una reclamación es todo o nada y caduca tras su TTL salvo que se renueve.

Cada reclamación correcta sobre un recurso incrementa su **época de fencing**. Una confirmación debe presentar un lease cuyas épocas, dueño, token y caducidad estén vigentes; de lo contrario el almacén responde `stale-lease`. Un escritor pausado o aislado que despierta después de que otro tomara su lease no puede confirmar, aunque siga creyendo que es dueño de la ejecución. Las épocas se conservan tras la liberación y nunca se reinician.

El token del lease es un secreto al portador. El almacén SQLite solo guarda su hash SHA-256; el host nunca debe persistir el token.

## Recibos de comandos idempotentes

Los comandos (`start`, `continue`, `cancel`) se admiten con un `clientId` y una `idempotencyKey`. Enviar de nuevo el mismo comando por el mismo actor devuelve `duplicate` con el recibo original; un comando distinto con la misma clave devuelve `conflict`. Los recibos avanzan por `accepted → running → completed | blocked`, de modo que un cliente que perdió una respuesta puede volver a preguntar sin iniciar una segunda ejecución.

## Diario de efectos

Una tarea que llama a herramientas anota cada efecto antes y después de que ocurra, clasificado como `read-only`, `idempotent` o `non-idempotent`:

| Estado del diario al recuperar | Resultado |
|---|---|
| Efecto completado | Se reproduce el resultado anotado; la herramienta no se vuelve a llamar. |
| Efecto iniciado y no terminado, en el mismo intento o `non-idempotent` | `uncertain`: el motor se niega a adivinar. |
| Sin ninguna evidencia de efectos | No se considera prueba de ausencia de efectos. |

Al reiniciar, una tarea que quedó `running`, `uncertain`, `blocked` o `failed` solo se reintenta si su intento es demostrablemente seguro y quedan intentos; si no, se marca `blocked` con `uncertain-attempt-recovery`. Una persona o una política del host decide qué sigue.

## Artefactos

El contenido del espacio de trabajo pasa por un `ArtifactProvider` en dos pasos. **Preparar** escribe archivos inmutables direccionados por contenido y devuelve un manifiesto; preparar no es progreso. **Publicar** asocia esa revisión al espacio de trabajo bajo un lease que cubre `workspace:<id>`, y solo la siguiente confirmación CAS de la ejecución la hace autoritativa. Una caída entre ambos pasos deja una revisión huérfana, nunca un espacio de trabajo publicado a medias.

## Cancelación

Una cancelación se admite como un comando idempotente. Una cancelación que llega después de que la ejecución alcanzó un estado terminal se anota como `run.cancel.too-late` y no cambia nada. Una ejecución cancelada termina `cancelled` solo si cada tarea está `cancelled`, `pending` o `succeeded`; de lo contrario termina `blocked`.

## Lo que la durabilidad no significa aquí

- **Autoridad única.** El almacén SQLite de referencia es para un único host autoritativo con varias conexiones locales. No se afirma soporte para montajes de red compartidos, clústeres ni conmutación por error. Otra topología implica otra implementación de `RunStore` que supere la misma suite de contrato.
- **Sin efectos exactamente una vez.** Los efectos completados se reproducen; los inciertos bloquean. Un sistema externo que necesite exactamente una vez debe imponerlo por sí mismo, normalmente con su propia clave de idempotencia.
- **Sin aislamiento de procesos.** `runtime-local` da a cada tarea un directorio privado, no un sandbox, y una promesa resuelta de un driver no prueba que sus procesos hayan terminado.
- **Sin migraciones.** El almacén rechaza una versión de esquema desconocida.

Continúe con la [guía de orquestación durable](../guides/durable-orchestration).
