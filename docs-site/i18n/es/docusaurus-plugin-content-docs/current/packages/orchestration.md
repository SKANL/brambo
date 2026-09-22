---
title: "@brambodev/orchestration"
audience: Integradores del SDK y autores de ejecutores de tareas
prerequisites: Node.js >=20 y conocimientos de tareas asíncronas
outcome: Ejecutar un grafo de tareas con dependencias y concurrencia acotada
scope: Referencia del paquete para orquestación de tareas independiente del proveedor
compatibility: Los paquetes publicados admiten Node.js >=20
translationStatus: translated
---

# @brambodev/orchestration

`@brambodev/orchestration` ejecuta un grafo de tareas definido por la aplicación. Úselo cuando las tareas tengan dependencias, reintentos, cancelación o estado reanudable; el paquete programa el trabajo, pero no decide qué significa una tarea.

## Ejemplo mínimo

Declare los IDs y dependencias de las tareas y luego ejecute el grafo. Las tareas listas corren hasta el límite de concurrencia configurado; las dependientes esperan a que se completen correctamente sus requisitos.

```ts
import { runTaskGraph } from '@brambodev/orchestration'

const result = await runTaskGraph([
  { id: 'fetch', run: async () => fetchSource() },
  { id: 'summarize', dependsOn: ['fetch'], run: async ({ getResult }) => summarize(getResult('fetch')) },
], { concurrency: 2 })
```

## API pública

- `runTaskGraph(tasks, options)` valida y ejecuta tareas según sus dependencias.
- `runDelegatedTaskGraph(tasks, options)` combina la planificación con [`@brambodev/delegation`](./delegation.md).
- `createJsonlOrchestrationStateStore(path)` almacena los registros de tareas en instantáneas JSON Lines de solo agregado.
- `OrchestrationTask`, `OrchestrationResult` y `OrchestrationOptions` describen entradas y resultados.
- Las dependencias de paquetes en tiempo de ejecución son `@brambodev/contracts` y `@brambodev/delegation`.

## Puntos de extensión y límites

Defina la función `run` de cada tarea y, si hace falta, `dependsOn` o `maxAttempts`; use `signal`, `concurrency` o `stateStore` según el ciclo de vida del host. Una dependencia fallida bloquea las tareas posteriores. Se pueden reanudar registros exitosos persistidos, pero el paquete no persiste resultados arbitrarios aparte de los registros que proporcione cada tarea. Se rechazan ciclos, IDs duplicados, dependencias desconocidas y cantidades de reintentos inválidas. No hay un planificador distribuido ni un grupo de trabajadores implícito.

## Guías relacionadas

- Delegá unidades de trabajo individuales con [`@brambodev/delegation`](./delegation.md).
- Consulte la [referencia de la API pública](../reference/api.md).
