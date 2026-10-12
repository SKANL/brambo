---
title: workflow-store-sqlite
audience: Developers integrating @brambodev/workflow-store-sqlite
prerequisites: Node.js >=24.15.0
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/workflow-store-sqlite 0.5.x'
compatibility: Node.js >=24.15.0
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/workflow-store-sqlite

<Badge status="experimental">Experimental</Badge>

*Experimental: probado y utilizable, pero su superficie aún puede cambiar y tiene menos evidencia de plataforma o menos consumidores en el repositorio que los paquetes estables.*

El `RunStore` de referencia de autoridad única sobre `node:sqlite`: revisiones CAS, confirmaciones atómicas de estado, eventos y recibos, leases de todo o nada con épocas de fencing monótonas, recibos de comandos idempotentes y solo hashes de los tokens de lease en disco. SQLite se carga de forma diferida, así que importar el paquete no tiene efectos secundarios.

| | |
|---|---|
| Mundo | Mundo durable |
| Nivel de topología | 2 |
| Node.js | `>=24.15.0` |
| Depende de | [`contracts`](./contracts) |

## Instalación

```bash
npm install @brambodev/workflow-store-sqlite
```

## Ejemplo

```ts
import { openSqliteRunStore } from '@brambodev/workflow-store-sqlite'

const store = await openSqliteRunStore({ path: './workflow.sqlite' })
try {
  const claim = await store.claim('acme', ['run:run-1', 'workspace:source'], 'host-1', 30_000)
  console.log(claim.status) // 'acquired' or 'contended'
  if (claim.status === 'acquired') await store.release(claim.lease)
} finally {
  await store.close()
}
```

## Puertos

- **Implementa:** `RunStore` (including `claimImportFence`).
- **Consume:** `node:sqlite`.

## Errores

`BRAMBO_WORKFLOW_STORE_UNAVAILABLE`, `BRAMBO_WORKFLOW_STORE_BUSY`, `BRAMBO_WORKFLOW_SCHEMA_UNSUPPORTED`, `BRAMBO_WORKFLOW_STORE_INVALID` (`WorkflowStoreError`).

## Límites

- Requiere Node.js >=24.15.0, a diferencia de los demás paquetes.
- Un único host autoritativo con almacenamiento local; no se afirma soporte para montajes de red compartidos, clústeres ni conmutación por error.
- 256 eventos por confirmación y por página; una espera por bloqueo de 100 ms.
- Los eventos y recibos nunca se purgan; solo versión de esquema 1, sin migraciones.

## Véase también

- [Semántica durable](../reference/durable-semantics)
- [ADR-008](../explanation/decisions/adr-008)
