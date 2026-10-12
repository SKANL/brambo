---
title: Cancelación, tiempos de espera y reintentos
audience: Host integrators embedding brambo
prerequisites: Node.js >=20
outcome: Saber qué plazos y reintentos aplica brambo por defecto (casi ninguno) y cómo suministrar los propios
scope: Sesión, adaptador CLI, adaptadores de API y proveedores de sandbox en 0.5.x
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# Cancelación, tiempos de espera y reintentos

**brambo no fija ningún plazo a una ejecución de executor y no reintenta nada por defecto.** Una ejecución termina cuando el executor acaba o cuando su host la cancela. Es deliberado: una biblioteca no puede saber cuánto debe durar una refactorización ni si una solicitud se puede repetir con seguridad. Esta página enumera cada lugar donde existe un límite de tiempo o un reintento, para que usted decida dónde añadir los suyos.

## Cancelar una sesión

`runSession` no acepta `signal`. Acepta `onInterrupt`, que registra el manejador de cancelación de brambo y devuelve una función de limpieza:

```ts
import { runSession } from '@brambodev/session'

export async function runWithDeadline(prompt: string, ms: number) {
  const signal = AbortSignal.timeout(ms)
  return runSession({
    prompt,
    onInterrupt: (cancel) => {
      signal.addEventListener('abort', cancel, { once: true })
      return () => signal.removeEventListener('abort', cancel)
    },
  })
}
```

Cuando se ejecuta `cancel`, brambo aborta la señal interna que pasa al adaptador como `RunRequest.signal`. El adaptador CLI termina el árbol de procesos del executor (`taskkill /T /F` en Windows, `SIGKILL` al grupo de procesos en POSIX) y resuelve un sobre `cancelled` con un arreglo `errors` no vacío. Después la limpieza se ejecuta en su orden habitual.

Para cancelar con señales del proceso, conéctelas usted mismo; es lo que hace `@brambodev/cli`:

```ts
import { runSession } from '@brambodev/session'

const envelope = await runSession({
  prompt: 'Run the test suite',
  onInterrupt: (cancel) => {
    process.once('SIGINT', cancel)
    process.once('SIGTERM', cancel)
    return () => {
      process.off('SIGINT', cancel)
      process.off('SIGTERM', cancel)
    }
  },
})
```

Una llamada directa a `ExecutorAdapter.run()` (fuera de `runSession`) acepta `signal` en la propia solicitud.

## Dónde existen límites de tiempo

| Componente | Límite por defecto | Configurable |
|---|---|---|
| Ejecución de executor de `runSession` / `adapter-cli` | **Ninguno** | Su manejador de interrupción |
| Solicitudes de `adapter-openai` y `adapter-anthropic` | **Ninguno** | Abortar mediante la señal de la ejecución |
| `executeWithRetry` (adapter-api) | Ninguno salvo que la solicitud lleve `deadlineAt`; los proveedores incluidos no lo fijan | Los proveedores propios pueden pasar `deadlineAt` |
| Comandos git en `workspace-git-worktree` | **Ninguno** | No |
| Espera del bloqueo de ordinales de worktree | 15 s | No |
| `createRemoteMcpClient` (session) | 30 s por solicitud | `timeoutMs` |
| Ejecución de herramientas en `sandbox-local` | 5 min de tiempo real | `timeoutMs` en el proveedor o `resourceLimits.wallTimeMs` en la política |
| Operaciones de `sandbox-remote` | **Ninguno** salvo que se fije | `timeoutMs`; cubre ejecución, stdio, instantánea, restauración y destrucción, pero no la creación de la sesión |
| Presupuestos del kernel | Sin límite | Límites de `actionPolicy` |

Un tiempo de espera agotado en el sandbox es un resultado, no una excepción: `execute` resuelve con estado `timed-out` y código `BRAMBO_SANDBOX_TIMED_OUT`; un aborto resuelve `aborted` con `BRAMBO_SANDBOX_ABORTED`.

## Reintentos

| Componente | Comportamiento |
|---|---|
| Executors de CLI | Nunca se reintentan. |
| Proveedores de OpenAI y Anthropic | Llaman a `executeWithRetry` con `maxAttempts: 1`: un intento, sin reintento. |
| El propio `executeWithRetry` | Solo reintenta errores `rate-limit`, `timeout` y `unavailable`, y solo cuando la solicitud demostrablemente no fue aceptada y se conoce la idempotencia. La espera empieza en 100 ms, se duplica, tiene un tope de 30 s y usa jitter completo. |
| Bucle local de herramientas | Nunca reintenta una herramienta. |
| `runTaskGraph` | `maxAttempts` por tarea, 1 por defecto. |
| `runDurableWorkflow` | Reintenta una tarea solo cuando su diario de efectos demuestra que el intento fue seguro y quedan intentos; si no, la tarea queda `blocked`. |

Antes de envolver una sesión en su propio reintento, recuerde que un sobre `failed` puede seguir a efectos secundarios reales: el executor pudo editar archivos o llamar a herramientas antes de fallar. Reintente solo trabajo que sabe idempotente, o ejecútelo como flujo durable, donde decide el diario de efectos.

## Los presupuestos no son plazos

Los límites del kernel (`maxInvocations`, `maxTotalCost`, `maxConcurrent`) rechazan una ejecución **antes** de que empiece. No detienen una ejecución en curso. Combine un límite con su propio plazo cuando necesite ambos.

## Próximo paso

Lea [Integrar runSession en un host](./host-integration) para la propiedad y la limpieza, o [Modelo de durabilidad](../explanation/durability) para la seguridad de los reintentos en el mundo durable.
