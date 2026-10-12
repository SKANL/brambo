---
title: Su primera sesión de brambo
sidebar_position: 1
audience: Host integrators embedding an agent turn
prerequisites: Node.js >=20; an installed and authenticated executor CLI (Claude Code, Codex or OpenCode)
outcome: Ejecutar un prompt con runSession, cancelarlo desde el host y leer el ResultEnvelope
scope: Inicio rápido de @brambodev/session 0.5.x
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# Su primera sesión de brambo

`@brambodev/session` ejecuta un turno de executor en un espacio de trabajo nuevo y devuelve un `ResultEnvelope` tipado. Hace todo lo que hace `brambo run` excepto el análisis de argumentos, la impresión de JSON y los códigos de salida, de modo que su host conserva el control de los tres.

Esto lleva unos cinco minutos. Se necesita Node.js 20 o posterior y una CLI de executor ya instalada y autenticada. brambo no instala ni autentica executors.

## Instalación

```bash
npm install @brambodev/session
```

`@brambodev/session` reexporta los tipos y utilidades que su superficie necesita; no es necesario instalar `@brambodev/contracts` ni `@brambodev/kernel`.

## Ejecutar un prompt

Cree `session.mjs` en el directorio donde quiere que trabaje el agente:

```js
import { runSession } from '@brambodev/session'

const envelope = await runSession({ prompt: 'List the files in this workspace' })
console.log(envelope.status, envelope.summary)
```

Ejecútelo:

```bash
node session.mjs
```

Sin opciones, brambo selecciona el executor desde su capa predeterminada, crea un espacio de trabajo en `<cwd>/.brambo/workspaces/<uuid>`, ejecuta allí el prompt y después libera el lease y desecha lo que construyó. Pase `executorId` (`'claude-code'`, `'codex'` u `'opencode'`) para elegir de forma explícita.

## Leer el resultado

`runSession` resuelve un `ResultEnvelope` para toda ejecución que llegó al executor, incluidas las fallidas y las canceladas:

```ts
type ResultStatus = 'ok' | 'failed' | 'cancelled'

interface ResultEnvelope {
  readonly status: ResultStatus
  readonly data: unknown
  readonly summary: string
  readonly changedPaths?: readonly string[]
  readonly errors?: readonly { message: string; code?: string }[]
}
```

Un sobre `failed` o `cancelled` siempre incluye un arreglo `errors` no vacío; el esquema del contrato rechaza uno que no lo tenga. Los fallos del entorno, como un prompt inválido, un espacio de trabajo que no se puede crear o un rechazo de presupuesto del kernel, **lanzan** un `BramboError` con un `code` (`BRAMBO_CONTRACT_*`, `BRAMBO_KERNEL_*`). Gestione ambos casos:

```js
import { runSession } from '@brambodev/session'

try {
  const envelope = await runSession({ prompt: 'List the files in this workspace' })
  if (envelope.status !== 'ok') {
    for (const error of envelope.errors ?? []) console.error(error.code, error.message)
  }
} catch (error) {
  console.error('environment failure:', error.code, error.message)
}
```

## Cancelar desde el host

`runSession` no tiene opción `signal` ni instala manejadores de señales: una biblioteca que llamara a `process.on('SIGINT')` le quitaría la señal a su host. En su lugar se pasa `onInterrupt`, una función que registra el manejador de cancelación de brambo y devuelve una función de limpieza. Conéctela a un `AbortSignal` propio:

```js
import { runSession } from '@brambodev/session'

const controller = new AbortController()
setTimeout(() => controller.abort(), 60_000) // your host's deadline, not brambo's

const envelope = await runSession({
  prompt: 'Refactor the utils module',
  onInterrupt: (cancel) => {
    controller.signal.addEventListener('abort', cancel, { once: true })
    return () => controller.signal.removeEventListener('abort', cancel)
  },
})
console.log(envelope.status) // 'cancelled' when the deadline fired first
```

Cuando se ejecuta `cancel`, brambo aborta la señal interna de la ejecución, el adaptador termina el executor y resuelve un sobre `cancelled`, y la limpieza se ejecuta igualmente en orden: primero la función de limpieza devuelta, después la liberación del espacio de trabajo y por último la eliminación del proveedor y del kernel. brambo no establece ningún tiempo de espera propio; el plazo anterior pertenece por completo al host.

## Usar sus documentos de configuración

`runSession` no lee archivos. Lea una vez las capas de configuración de brambo y pase la instantánea:

```js
import { readExecutorConfigLayers, runSession } from '@brambodev/session'

const configLayers = await readExecutorConfigLayers({ projectDir: process.cwd() })
const envelope = await runSession({ prompt: 'List the files in this workspace', configLayers })
console.log(envelope.status)
```

Las capas se resuelven como `defaults → global → project → agent → invocation`. Consulte [Configuración](../guides/configuration) para las claves y las ubicaciones de archivo.

## Lo que queda en disco

El directorio del espacio de trabajo sobrevive a la sesión: `release()` termina el lease y `dispose()` conserva el estado para no perder trabajo. La eliminación es una llamada explícita y separada (`inspectLocalWorkspaces` / `removeLocalWorkspace`, o `inspectWorktrees` / `removeWorktree` para git worktrees). brambo no persiste ninguna transcripción de la ejecución; pase un `eventLog` si quiere registrar los eventos del ciclo de vida.

## Próximos pasos

- [Executors y espacios de trabajo](../guides/executors-and-workspaces): elegir el executor y el proveedor de espacios de trabajo.
- [Executors de API](../guides/api-executors): ejecutar contra la API de OpenAI o Anthropic en lugar de una CLI.
- [Herramientas y sandbox](../guides/tools-and-sandbox): qué aísla brambo y qué no.
- [Orquestación durable](../guides/durable-orchestration): cuando un turno no basta.
