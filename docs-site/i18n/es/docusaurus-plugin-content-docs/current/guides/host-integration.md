---
title: Integrar runSession en un host
audience: Host integrators embedding brambo in a product or service
prerequisites: Node.js >=20; completed the first-session quickstart
outcome: Ejecutar sesiones de brambo dentro de un host de larga duración con una propiedad clara de kernels, proveedores, presupuestos, registros y limpieza
scope: 'Composición de @brambodev/session para hosts'
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# Integrar runSession en un host

El inicio rápido ejecuta una sesión desde un script. Un host real (un servicio web, una extensión de IDE, un ejecutor de trabajos) ejecuta muchas sesiones, comparte presupuestos entre ellas, informa de lo ocurrido y nunca debe dejar procesos ni espacios de trabajo huérfanos. Esta guía muestra las reglas de propiedad que lo hacen seguro.

## La propiedad de un vistazo

| Recurso | Lo crea | Lo desecha |
|---|---|---|
| Kernel construido por `runSession` | `runSession` | `runSession`, en todos los caminos |
| Kernel de `createSessionKernel` | Usted | Usted: `await kernel.stop()` |
| Proveedor de espacios de trabajo de `createProvider` | Su fábrica | `runSession`, en todos los caminos |
| Directorio del espacio de trabajo | El proveedor | Nadie automáticamente; la eliminación es una llamada explícita |
| Manejador de interrupción de `onInterrupt` | Usted | `runSession` llama a la función de limpieza que usted devolvió |
| Registro de eventos, sink de registros | Usted | Usted |

brambo no instala manejadores de señales, no inicia temporizadores y no guarda estado global entre llamadas.

## Un kernel por ejecución o uno por inquilino

Por defecto, cada llamada a `runSession` construye y detiene su propio kernel. Para compartir un presupuesto y un flujo de registros entre muchas ejecuciones, construya el kernel usted mismo:

```ts
import { createMemoryLogSink, createSessionKernel, runSession } from '@brambodev/session'

const log = createMemoryLogSink()
const kernel = createSessionKernel({
  executorId: 'codex',
  log,
  actionPolicy: { maxInvocations: 20, maxTotalCost: 500_000 },
  onWarning: (message) => console.warn(message),
})

try {
  const first = await runSession({ prompt: 'Summarize the open TODOs', kernel })
  const second = await runSession({ prompt: 'Draft release notes', kernel })
  console.log(first.status, second.status)
} finally {
  await kernel.stop() // runs every mounted plugin's disposer in reverse order
}
```

Un kernel suministrado es dueño de su configuración, plugins, pipeline, sink de registros y proveedor. Pasar `configLayers`, `cwd`, `executorId`, `adapterOptions`, `createAdapter`, `createProvider`, `onSelection`, `log` o `actionPolicy` junto a `kernel` se rechaza con `BRAMBO_CONTRACT_ENVELOPE_INVALID` en lugar de ignorarse en silencio.

`maxTotalCost` se compara con la cifra de tokens que informó el executor tras cada ejecución (las ejecuciones se admiten con un coste fijo de 1), de modo que un límite de coste salta en la ejecución siguiente a la que lo superó.

## Entregue la configuración, nunca deje que brambo la lea implícitamente

`runSession` no lee archivos. Un host que quiera el `~/.brambo/config.json` del usuario y el `.brambo/config.json` del proyecto los lee una vez y pasa la instantánea:

```ts
import { readExecutorConfigLayers, runSession } from '@brambodev/session'

const configLayers = await readExecutorConfigLayers({ projectDir: '/srv/repos/acme' })
const envelope = await runSession({
  prompt: 'Run the linter and fix what it reports',
  cwd: '/srv/repos/acme',
  configLayers,
  onSelection: (selection) => console.info(`executor ${selection.executorId} chosen by ${selection.layer}`),
})
```

Si se omite `configLayers`, solo se aplican los valores predeterminados de brambo y `executorId`. Una clave que brambo lee y no puede usar se informa mediante `onWarning`; nunca hace fallar la ejecución.

## Observar la ejecución

- **`log`** recibe los registros del pipeline del kernel para la ejecución: `action.invoked`, `action.completed`, `action.refused`, `action.estimated`, `action.settled`. Llame a `await log.drain()` antes de leer un sink asíncrono.
- **`eventLog`** recibe los eventos del ciclo de vida: `session.started`, `session.result`, `session.failed`, `session.cancelled`, `session.completed`. Use `createMemorySessionEventLog` o `createAppendOnlySessionEventLog`, o implemente `SessionEventLog`.
- **`onSelection`** informa de qué executor se eligió y qué capa de configuración lo decidió, antes de lanzar nada.

brambo no persiste ninguna transcripción de lo que dijo el executor. Si la necesita, captúrela desde `envelope.data` o desde las funciones de flujo del adaptador.

## Traiga su propio proveedor de espacios de trabajo

`createProvider` sustituye el plugin de espacios de trabajo montado. Devuelva un proveedor **nuevo** en cada llamada: la sesión lo desecha en todos los caminos, de modo que un proveedor reutilizado vuelve desechado y la siguiente sesión falla con `BRAMBO_CONTRACT_PROVIDER_DISPOSED`.

```ts
import { runSession } from '@brambodev/session'
import { LocalWorkspaceProvider } from '@brambodev/workspace-local'

const envelope = await runSession({
  prompt: 'List the files',
  createProvider: () => new LocalWorkspaceProvider({ rootDir: '/var/lib/acme/workspaces' }),
})
```

`createProvider` no se puede combinar con un `kernel` suministrado.

## Concurrencia

Las llamadas separadas a `runSession` son independientes salvo que compartan kernel. En un kernel compartido, `maxConcurrent` limita las ejecuciones simultáneas; dos sesiones se distinguen en el flujo de registros porque cada identificador de acción es `session.executor-run#<workspaceId>`.

## Garantías de limpieza

En todos los caminos (éxito, fallo, cancelación o excepción), `runSession` ejecuta su limpieza en un orden fijo y contiene cada paso, de modo que un fallo de limpieza nunca sustituye a su resultado: retirar el manejador de interrupción, liberar el lease del espacio de trabajo, desechar el proveedor que creó, desactivar un método y detener el kernel que construyó.

El directorio del espacio de trabajo se deja en disco a propósito. Programe la eliminación con `inspectLocalWorkspaces` / `removeLocalWorkspace` (o `inspectWorktrees` / `removeWorktree`), que solo borran directorios de los que brambo tiene un registro de propiedad.

## Próximos pasos

- [Cancelación, tiempos de espera y reintentos](./cancellation-timeouts-retries): los plazos los fija usted.
- [Executors y espacios de trabajo](./executors-and-workspaces): elegir el executor y el proveedor.
- [Herramientas y sandbox](./tools-and-sandbox): ejecutar herramientas bajo una política de sandbox.
