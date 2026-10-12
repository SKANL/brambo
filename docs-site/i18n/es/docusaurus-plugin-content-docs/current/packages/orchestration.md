---
title: orchestration
audience: Developers integrating @brambodev/orchestration
prerequisites: Node.js >=20
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/orchestration 0.5.x'
compatibility: Node.js >=20
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/orchestration

<Badge status="experimental">Experimental</Badge>

*Experimental: probado y utilizable, pero su superficie aún puede cambiar y tiene menos evidencia de plataforma o menos consumidores en el repositorio que los paquetes estables.* [Criterios de estado](../reference/package-status).

Orquestación de tareas en dos formas: `runTaskGraph`, un grafo de dependencias en memoria con intentos por tarea y un almacén de estado JSONL opcional, y `runDurableWorkflow`, el motor durable que ejecuta un flujo registrado sobre un `RunStore` y un `ArtifactProvider` con confirmaciones CAS, leases hijos y un diario de efectos. También exporta registros de flujos y de drivers, resolución de configuración de ejecución e `importWorkflowRun`.

| | |
|---|---|
| Mundo | Mundo durable |
| Nivel de topología | 3 |
| Node.js | `>=20` |
| Depende de | [`contracts`](./contracts), [`delegation`](./delegation) |

## Instalación

```bash
npm install @brambodev/orchestration
```

## Ejemplo

```ts
import { runTaskGraph } from '@brambodev/orchestration'

const result = await runTaskGraph([
  { id: 'build', run: async () => 'built' },
  { id: 'test', dependsOn: ['build'], maxAttempts: 2, run: async ({ getResult }) => `tested ${String(getResult('build'))}` },
], { concurrency: 2 })
console.log(result.status, result.tasks.map((task) => [task.id, task.status]))
```

## Puertos

- **Implementa:** The durable engine; `WorkflowRegistry`, `DriverRegistry`.
- **Consume:** `RunStore`, `ArtifactProvider`, `ExecutionDriver`/`DriverFactory`, `ExecutionRuntime` (mediante su `executeTask`).

## Errores

`BRAMBO_ORCHESTRATION_INVALID` para grafos y configuraciones inválidos; las precondiciones del motor y los rechazos de importación son `Error` simples con mensajes descriptivos.

## Límites

- `runTaskGraph` no es durable por sí solo; solo se reanudan los registros `succeeded`.
- El motor durable reintenta una tarea solo cuando su diario de efectos demuestra que el intento es seguro.
- `importWorkflowRun` copia una ejecución terminal en reposo; no es una transacción distribuida ni una sincronización continua.

## Véase también

- [Su primer flujo durable](../tutorials/durable-workflow)
- [Semántica durable](../reference/durable-semantics)
