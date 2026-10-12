---
title: Errores y sobres de resultado
audience: Host integrators and port authors
prerequisites: Node.js >=20
outcome: Gestionar los fallos de brambo por código y estado sin analizar mensajes
scope: Modelo de errores del SDK 0.5.x
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# Errores y sobres de resultado

brambo informa de los fallos en dos superficies, y ambas son legibles por máquina. Los mensajes explican los fallos a las personas; no son una API estable para tomar decisiones.

## Dos superficies de fallo

| Superficie | Cuándo | Forma |
|---|---|---|
| `ResultEnvelope` | El executor se ejecutó (o se canceló) y produjo un resultado | `status: 'ok' \| 'failed' \| 'cancelled'`; `failed` y `cancelled` siempre incluyen un arreglo `errors` no vacío de `{ message, code? }` |
| Error lanzado | brambo rechazó una entrada, una operación de frontera o un presupuesto antes o alrededor de la ejecución | `BramboError` (o un error del kernel) con un `code` estable |

Un fallo del executor es un dato: `runSession` resuelve con un sobre `failed` en lugar de rechazar. Un fallo del entorno, como un documento de configuración inutilizable, un identificador de executor desconocido, un espacio de trabajo que no se puede crear o un rechazo de presupuesto, rechaza la promesa.

```ts
import { BRAMBO_ERROR_CODES, BramboError } from '@brambodev/contracts'

try {
  await startHost()
} catch (error) {
  if (error instanceof BramboError && error.code === BRAMBO_ERROR_CODES.configurationUnusable) {
    console.error('Repair the configuration document before retrying')
  }
  throw error
}
```

## Dos jerarquías de errores

- **`BramboError`** (de `@brambodev/contracts`) lleva `code: BramboErrorCode`, uno de los valores de `BRAMBO_ERROR_CODES`.
- **Errores del kernel** (de `@brambodev/kernel`) extienden `BramboKernelError` y llevan códigos `BRAMBO_KERNEL_*`. El kernel nunca importa contracts, así que tiene sus propias clases; una prueba de paridad mantiene alineados ambos conjuntos de códigos, y `BRAMBO_ERROR_CODES` refleja cada código del kernel.

Decida según `error.code` (una cadena) en lugar de `instanceof` cuando un error pueda venir de cualquiera de las dos jerarquías.

## Familias de códigos

| Prefijo | Lo lanza |
|---|---|
| `BRAMBO_KERNEL_*` | Manifiestos, grafo de servicios, ciclo de vida, pipeline de acciones y límites de presupuesto |
| `BRAMBO_CONTRACT_*` | Validación de sobres y protocolo, leases de espacios de trabajo, almacenes de memoria, proveedores desechados |
| `BRAMBO_EXECUTOR_*` | Selección, arranque, ejecución y cancelación de executors y registro de proveedores de API |
| `BRAMBO_SANDBOX_*` | Política de sandbox, evidencia de capacidades, solicitudes, respuestas y denegaciones |
| `BRAMBO_CONFIGURATION_UNUSABLE` | Un documento de configuración existente que no se puede usar (uno ausente no es un error) |
| `BRAMBO_REGISTRY_*`, `BRAMBO_PROJECTION_*`, `BRAMBO_LOCK_*`, `BRAMBO_ENVIRONMENT_*` | Mundo de entorno |
| `BRAMBO_WORKFLOW_*`, `BRAMBO_ORCHESTRATION_INVALID` | Mundo durable |
| `BRAMBO_METHOD_*`, `BRAMBO_TOOL_*`, `BRAMBO_PROVENANCE_INVALID` | Métodos, invocaciones de herramientas, recibos de revisión |

Los resultados del mundo durable son sobre todo **estados**, no errores: una confirmación de `RunStore` responde `committed`, `conflict` o `stale-lease`, y una reclamación responde `acquired` o `contended`. Trátelos como flujo de control. Algunos fallos durables (precondiciones del motor, rechazos de importación, límites de artefactos) son instancias simples de `Error` con mensajes descriptivos y todavía sin código.

## Tabla de decisiones

| Señal | Significado | Acción |
|---|---|---|
| `status: 'ok'` | Sobre correcto del executor | Consuma `data`, `summary` y `changedPaths`. |
| `status: 'failed'` | Fallo del executor o del adaptador | Revise `errors[].code`; no reintente a ciegas, la ejecución pudo tener efectos secundarios. |
| `status: 'cancelled'` | Su interrupción o señal detuvo la ejecución | Libere sus propios recursos. |
| `BRAMBO_KERNEL_*_CAP_EXCEEDED` | Un presupuesto rechazó la ejecución antes de iniciar el executor | Aumente el límite o deténgase. |
| Otro `BramboError.code` | brambo rechazó una entrada u operación de frontera | Corrija esa frontera; el código la nombra. |

## Próximo paso

Cada código con su significado figura en [Códigos de error](../reference/error-codes); para síntomas concretos, lea [Solución de problemas](../reference/troubleshooting).
