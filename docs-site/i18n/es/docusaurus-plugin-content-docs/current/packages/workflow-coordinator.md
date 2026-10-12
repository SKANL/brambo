---
title: workflow-coordinator
audience: Developers integrating @brambodev/workflow-coordinator
prerequisites: Node.js >=20
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/workflow-coordinator 0.5.x'
compatibility: Node.js >=20
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/workflow-coordinator

<Badge status="experimental">Experimental</Badge>

*Experimental: probado y utilizable, pero su superficie aún puede cambiar y tiene menos evidencia de plataforma o menos consumidores en el repositorio que los paquetes estables.*

El plano de control del lado del host para ejecuciones durables distribuidas: `createWorkflowCoordinator` devuelve un manejador de solicitudes de Node.js para la única ruta `POST /v1/workflow`, que autentica, delimita, autoriza y reenvía las operaciones del protocolo a su almacén y sus artefactos; `createWorkflowWorker` reclama ejecuciones pendientes y las ejecuta con renovación de lease y efectos de herramientas anotados.

| | |
|---|---|
| Mundo | Mundo durable |
| Nivel de topología | 7 |
| Node.js | `>=20` |
| Depende de | [`contracts`](./contracts), [`orchestration`](./orchestration) |

## Instalación

```bash
npm install @brambodev/workflow-coordinator
```

## Ejemplo

```ts
import { createServer } from 'node:http'
import { createWorkflowCoordinator, type WorkflowCoordinatorOptions } from '@brambodev/workflow-coordinator'

declare const options: WorkflowCoordinatorOptions // store, artifacts, authenticate, authorize, workerAllowed
const coordinator = createWorkflowCoordinator(options)
const server = createServer(coordinator.handler) // TLS, proxy and listen are yours
server.listen(8443)
```

## Puertos

- **Implementa:** The workflow protocol server; a worker loop.
- **Consume:** `RunStore`, `ArtifactProvider`, `runDurableWorkflow`, `DriverRegistry`, `ExecutionRuntime`, funciones de autenticación y servicios del host.

## Errores

Estados HTTP con `denied`, `invalid` o `unavailable` del protocolo; los rechazos del worker son `Error` simples; los efectos de herramientas exponen `UncertainToolEffectError`.

## Límites

- Sin TLS, sin escucha y sin autenticación propia.
- Cuerpos de solicitud de 1 MiB como máximo.
- El worker no tiene planificador: llame a `runOnce` desde su bucle.

## Véase también

- [Coordinador, worker y cliente remoto](../guides/coordinator-and-worker)
- [Desplegar un coordinador propiedad del host](../guides/remote-orchestration)
