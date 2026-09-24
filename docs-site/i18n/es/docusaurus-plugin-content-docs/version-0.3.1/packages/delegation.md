---
title: "@brambodev/delegation"
audience: Integradores del SDK y autores de ejecutores de tareas
prerequisites: Node.js >=20 y un proyecto TypeScript o JavaScript
outcome: Ejecutar una operación delegada e inspeccionar su resultado registrado
scope: Referencia del paquete para primitivas de ciclo de vida de delegación independientes del proveedor
compatibility: Los paquetes publicados admiten Node.js >=20
translationStatus: translated
---

# @brambodev/delegation

`@brambodev/delegation` ejecuta un controlador para una solicitud tipada y registra el resultado. Utilícelo cuando el host necesite un límite pequeño para el ciclo de vida de una delegación, sin adoptar un grafo completo de tareas.

## Ejemplo mínimo

Cree un registro y delegue una solicitud a un controlador propio de la aplicación. El controlador recibe un `AbortSignal`; el registro devuelto contiene la solicitud, el estado y el resultado o error.

```ts
import { createDelegationRegistry } from '@brambodev/delegation'
import type { DelegationHandler, DelegationRequest } from '@brambodev/contracts'

const registry = createDelegationRegistry<{ prompt: string }, string>()
const request: DelegationRequest<{ prompt: string }> = {
  id: 'research-1',
  input: { prompt: 'Summarize the release notes' },
}
const handler: DelegationHandler<{ prompt: string }, string> = {
  execute: async ({ input }, signal) => runWorker(input.prompt, signal),
}
const record = await registry.delegate(request, handler)
```

## API pública

- `createDelegationRegistry()` crea un registro en memoria con operaciones `delegate()` y `get()`.
- `createJsonlDelegationStateStore(path)` ofrece instantáneas JSON Lines de solo agregado para restaurar el estado más reciente del registro.
- Importe `DelegationRequest`, `DelegationHandler`, `DelegationRecord` y `DelegationStateStore` desde `@brambodev/contracts`; el paquete de delegación no vuelve a exportar esos tipos.
- Su única dependencia de paquete en tiempo de ejecución es `@brambodev/contracts`.

## Puntos de extensión y límites

El host es responsable del controlador, el ejecutor, la política de cancelación y cualquier efecto externo. Utilice una implementación de `DelegationStateStore` para persistir los registros en otro destino. El ID de cada solicitud debe ser único y no vacío dentro del registro; los duplicados generan un error tipado de brambo. Los errores del controlador se registran como fallidos (o cancelados si se abortó la señal recibida) en lugar de volver a lanzarse. Este paquete no crea procesos, elige modelos ni ofrece una cola distribuida.

## Guías relacionadas

- Combine controladores delegados en un grafo de dependencias con [`@brambodev/orchestration`](./orchestration.md).
- Consulte la [referencia de la API pública](../reference/api.md).
