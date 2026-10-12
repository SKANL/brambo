---
title: El kernel
audience: Developers who compose brambo or write plugins
prerequisites: Node.js >=20
outcome: Comprender los plugins, el grafo de servicios, el orden del ciclo de vida, el pipeline de acciones y los presupuestos
scope: 'Conceptos de @brambodev/kernel 0.5.x'
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
import Diagram from '@site/src/components/Diagram'
import ActionPipeline from '@site/src/components/diagrams/ActionPipeline'

# El kernel

`@brambodev/kernel` es la base sobre la que se monta todo lo demás. No tiene dependencias de ejecución y nunca importa `@brambodev/contracts`; no sabe nada de executors, registros ni proyección. Ofrece seis cosas: manifiestos de plugins, un grafo de servicios, un ciclo de vida ordenado, un bus de eventos con ámbito, configuración por capas y un pipeline de acciones con presupuestos y un flujo de registros de solo adición.

La mayoría de los hosts nunca tocan el kernel directamente: `@brambodev/session` construye uno por ejecución o se lo entrega mediante `createSessionKernel`. Esta página explica lo que garantiza ese kernel.

## Plugins y manifiestos

Un plugin es un manifiesto más una fábrica. El manifiesto declara un `id`, una `version` semver estricta, los servicios que `provides`, los servicios que `consumes` (cada uno `hard` o `soft`) y un `configSchema` con forma de Standard Schema v1. El kernel valida el manifiesto e informa de todos los problemas a la vez; después aplica el esquema a la configuración del plugin antes de ejecutar la fábrica, de modo que un plugin nunca recibe una configuración que su propio esquema rechazó.

```ts
import { createKernel } from '@brambodev/kernel'

const passthrough = { '~standard': { version: 1, validate: (value: unknown) => ({ value }) } }

const kernel = createKernel()
kernel.register(
  { id: 'clock', version: '1.0.0', provides: ['clock'], consumes: [], configSchema: passthrough },
  () => ({ status: 'activated', services: { clock: () => Date.now() } }),
)
kernel.register(
  { id: 'greeter', version: '1.0.0', provides: [], consumes: [{ service: 'clock', mode: 'hard' }], configSchema: passthrough },
  (context) => {
    const clock = context.consume('clock')
    if (clock.kind === 'absent') return { status: 'rejected', issues: ['clock unavailable'] }
    return { status: 'activated', dispose: () => console.log('greeter stopped') }
  },
)
const { started, failures } = kernel.start()
await kernel.stop()
```

`consume` devuelve un resultado tipado, `{ kind: 'provided', value }` o `{ kind: 'absent' }`, nunca `undefined`.

## Orden del ciclo de vida

- **Arranque**: carga cada plugin registrado, rechaza manifiestos inválidos, conflictos de servicios y ciclos de dependencias, y activa los plugins en orden de dependencias `hard`. Una activación fallida queda contenida y registrada (`BRAMBO_KERNEL_PLUGIN_START_FAILED`); los demás se activan igualmente. Un plugin cuya dependencia `hard` falta queda sin preparar y nunca se activa. El consumo `soft` no impone orden.
- **Parada**: drena las continuaciones de eventos pendientes y después ejecuta cada función de limpieza en orden inverso exacto de activación, aunque alguna lance un error. Es idempotente; las llamadas concurrentes comparten un único resultado.
- **Un solo ciclo**: después de `stop`, `start` y `register` lanzan `BRAMBO_KERNEL_PLUGIN_INACTIVE`. Un kernel no se puede reiniciar; se construye uno nuevo.
- **Sustitución**: valida y después confirma. El candidato se activa por completo primero; cualquier rechazo lanza `BRAMBO_KERNEL_SWAP_REJECTED` y la implementación anterior sigue sirviendo. Solo cuando la nueva sirve se ejecuta la limpieza de la anterior.

## Capas de configuración

La `LayeredConfig` del kernel compone cinco capas, de la más amplia a la más específica: `defaults`, `global`, `project`, `agent`, `invocation`. Registra qué capa aportó cada valor, de modo que «quién decidió esto» tiene respuesta por clave. `runSession` siembra estas capas con los documentos que se le pasan y nada más.

## El pipeline de acciones

<Diagram><ActionPipeline /></Diagram>

El trabajo que debe presupuestarse y registrarse se registra como una acción. Cada invocación atraviesa cuatro etapas en orden: `pre`, `guard`, `around`, `post`. Un guard devuelve `{ allow: true }` o `{ allow: false, reason }`; un rechazo se registra como `action.refused` y la operación nunca se ejecuta.

```ts
import { createActionPipeline, createMemoryLogSink } from '@brambodev/kernel'

const log = createMemoryLogSink()
const pipeline = createActionPipeline(log, { maxInvocations: 2 })
const action = pipeline.register({ id: 'demo.add', cost: 1, run: () => 1 + 1 })

await action.invoke()
console.log(pipeline.usage) // { invocations: 1, totalCost: 1, concurrent: 0 }
```

## Presupuestos

Una `ActionPolicy` tiene tres límites opcionales: `maxInvocations`, `maxTotalCost` y `maxConcurrent`. Si se omiten, no hay límite. Cada límite debe ser un número finito `>= 0`; un límite `NaN` dejaría el control abierto, por lo que se rechaza con `BRAMBO_KERNEL_ACTION_INVALID`. Un límite superado lanza su propio código: `BRAMBO_KERNEL_INVOCATION_CAP_EXCEEDED`, `BRAMBO_KERNEL_COST_CAP_EXCEEDED` o `BRAMBO_KERNEL_CONCURRENCY_CAP_EXCEEDED`.

La admisión se calcula con el `cost` declarado de la acción. Un `settle` opcional concilia después la cifra real, y las admisiones posteriores comprueban el total conciliado. El mundo de sesión admite cada ejecución con un coste fijo de 1 y la concilia con la cifra de tokens que informó el executor, por lo que los límites de coste y de invocaciones pueden saltar en ejecuciones distintas. brambo nunca inventa una estimación de tokens previa; un host que presupuesta en tokens suministra su propio `cost`.

## Registros

Cada transición del ciclo de vida y cada resultado de acción es un registro congelado y secuenciado (`version`, `seq`, `at`, `event`, `subject`, y opcionalmente `code` y `cost`) escrito en un `LogSink`. `createMemoryLogSink` guarda los registros en memoria; `createLogSink(write)` los entrega a su exportador. Un fallo de escritura degrada el sink y se cuenta en lugar de lanzarse, de modo que la observabilidad no puede tumbar el trabajo que observa. Llame a `drain()` antes de leer un sink asíncrono.

## Primitivas de ejecución

El kernel también exporta las primitivas de sesión neutrales respecto a ACP que usa el mundo de sesión: `createSessionSupervisor` (estados `created → active → completed | failed | cancelling → closed`, turnos FIFO secuenciales), `createPermissionBroker` y `createPermissionAuthorizer`, con permisos con ámbito de acción, sesión o espacio de trabajo. Consulte [Contratos del kernel](../guides/kernel-contracts) para sus garantías.

## Lo que el kernel no hace

No hay transportes, registros de proveedores, almacenes durables, interfaz de permisos, tiempos de espera ni reintentos. Eso corresponde a las implementaciones de contratos o a su host.
