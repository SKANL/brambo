---
title: runtime-local
audience: Developers integrating @brambodev/runtime-local
prerequisites: Node.js >=20
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/runtime-local 0.5.x'
compatibility: Node.js >=20
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/runtime-local

<Badge status="experimental">Experimental</Badge>

*Experimental: probado y utilizable, pero su superficie aún puede cambiar y tiene menos evidencia de plataforma o menos consumidores en el repositorio que los paquetes estables.* [Criterios de estado](../reference/package-status).

Un `ExecutionRuntime` local para tareas durables: valida el ámbito del lease hijo, materializa el espacio de trabajo de la tarea en un directorio privado `0700`, ejecuta el driver, prepara el resultado como una revisión nueva, renueva el lease hijo periódicamente y siempre elimina su directorio privado. Anuncia `native-continuation` y `context-reconstruction`.

| | |
|---|---|
| Mundo | Mundo durable |
| Nivel de topología | 2 |
| Node.js | `>=20` |
| Depende de | [`contracts`](./contracts) |

## Instalación

```bash
npm install @brambodev/runtime-local
```

## Ejemplo

```ts
import { createLocalExecutionRuntime } from '@brambodev/runtime-local'
import { openSqliteRunStore } from '@brambodev/workflow-store-sqlite'
import { createLocalArtifactProvider } from '@brambodev/workspace-artifacts-local'

const store = await openSqliteRunStore({ path: './workflow.sqlite' })
const artifacts = createLocalArtifactProvider({ rootDir: './private-artifacts', store })
const runtime = createLocalExecutionRuntime({ rootDir: './runtime', artifacts, store, ttlMs: 30_000, renewalMs: 10_000 })
console.log(runtime.capabilities)
```

## Puertos

- **Implementa:** `ExecutionRuntime`; `createLeaseRenewalController`.
- **Consume:** `ArtifactProvider`, `RunStore` (para `valid` y `renew`) y un `ExecutionDriver`.

## Errores

`BRAMBO_CONTRACT_LEASE_SCOPE_INVALID`, `BRAMBO_ORCHESTRATION_INVALID`; la pérdida de propiedad y la cancelación lanzan `Error` simples.

## Límites

- No es un sandbox: un directorio privado no es aislamiento, y una promesa resuelta de un driver no prueba que sus procesos hayan terminado.
- `renewalMs` debe ser menor que `ttlMs` (10 s y 30 s por defecto).

## Véase también

- [Orquestación durable](../guides/durable-orchestration)
- [Drivers y herramientas personalizados](../guides/custom-drivers-and-tools)
