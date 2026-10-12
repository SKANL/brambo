---
title: workflow-remote
audience: Developers integrating @brambodev/workflow-remote
prerequisites: Node.js >=20
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/workflow-remote 0.5.x'
compatibility: Node.js >=20
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/workflow-remote

<Badge status="experimental">Experimental</Badge>

*Experimental: probado y utilizable, pero su superficie aún puede cambiar y tiene menos evidencia de plataforma o menos consumidores en el repositorio que los paquetes estables.* [Criterios de estado](../reference/package-status).

Clientes que exponen un coordinador como puertos locales: `createRemoteRunStore` y `createRemoteArtifactProvider` hablan el protocolo de flujos sobre un `fetch` inyectado con cabeceras de autorización nuevas en cada solicitud, validan cada respuesta y nunca recurren a un escritor local. `replayRun` pagina los eventos de una ejecución.

| | |
|---|---|
| Mundo | Mundo durable |
| Nivel de topología | 2 |
| Node.js | `>=20` |
| Depende de | [`contracts`](./contracts) |

## Instalación

```bash
npm install @brambodev/workflow-remote
```

## Ejemplo

```ts
import { createRemoteRunStore, replayRun, type RemoteClientOptions } from '@brambodev/workflow-remote'

declare const authorizeRequest: RemoteClientOptions['authorizeRequest']
const store = createRemoteRunStore({ endpoint: 'https://workflows.example.internal/v1/workflow', fetch, authorizeRequest })
const page = await replayRun(store, { namespace: 'acme', runId: 'run-1' }, 0, 100)
console.log(page.status, page.events.length)
await store.close()
```

## Puertos

- **Implementa:** `RunStore`, `ArtifactProvider` (remote).
- **Consume:** Un endpoint de coordinador; `fetch` y `authorizeRequest` del host.

## Errores

`Error` simples: `Invalid remote endpoint`, `Remote workflow unavailable`, `Invalid remote workflow response`, `Remote workflow aborted`, `Remote workflow client closed`.

## Límites

- Cuerpos de solicitud de 1 MiB como máximo; respuestas de 1 MiB por defecto, hasta 64 MiB.
- Se rechazan límites de página superiores a 256.
- La preparación local está limitada a 10.000 entradas y 768 KiB de contenido.

## Véase también

- [Coordinador, worker y cliente remoto](../guides/coordinator-and-worker)
