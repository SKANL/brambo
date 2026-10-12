---
title: session
audience: Developers integrating @brambodev/session
prerequisites: Node.js >=20
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/session 0.5.x'
compatibility: Node.js >=20
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/session

<Badge status="stable">Estable</Badge>

*Estable: cubierto por sus pruebas (y por su suite de contrato cuando el puerto la tiene) y ejercitado por la ruta de sesión o de CLI de brambo. brambo es anterior a 1.0, por lo que siguen siendo posibles cambios incompatibles, que se señalan en el registro de cambios.* [Criterios de estado](../reference/package-status).

Todo lo que hace `brambo run` excepto el análisis de argumentos, la salida JSON y los códigos de salida. `runSession` compone un kernel, monta los plugins de executor y de espacio de trabajo, crea un espacio de trabajo, ejecuta un prompt por el pipeline de acciones del kernel y limpia en un orden fijo. Reexporta los tipos y utilidades que necesita su superficie, por lo que los hosts solo instalan este paquete.

| | |
|---|---|
| Mundo | Mundo de sesión |
| Nivel de topología | 4 |
| Node.js | `>=20` |
| Depende de | [`adapter-cli`](./adapter-cli), [`contracts`](./contracts), [`kernel`](./kernel), [`orchestration`](./orchestration), [`provenance`](./provenance), [`sandbox`](./sandbox), [`workspace-git-worktree`](./workspace-git-worktree), [`workspace-local`](./workspace-local) |

## Instalación

```bash
npm install @brambodev/session
```

## Ejemplo

```ts
import { runSession } from '@brambodev/session'

const deadline = AbortSignal.timeout(120_000)
const envelope = await runSession({
  prompt: 'Summarize the open TODOs',
  executorId: 'claude-code',
  onInterrupt: (cancel) => {
    deadline.addEventListener('abort', cancel, { once: true })
    return () => deadline.removeEventListener('abort', cancel)
  },
})
console.log(envelope.status, envelope.summary)
```

## Puertos

- **Implementa:** Composition only: `runSession`, `createSessionKernel`, `executeTool`, `createToolExecutor`, `readExecutorConfigLayers`, workspace removal helpers, session event logs, `runWorkflowSession`.
- **Consume:** `ExecutorAdapter` (mediante `adapter-cli` o su `createAdapter`), `WorkspaceProvider` (`workspace-local`, `workspace-git-worktree` o su `createProvider`) y, de forma opcional, `SandboxProvider` y `ToolExecutor`.

## Errores

Lanza `BRAMBO_CONTRACT_*` (prompt u opciones inválidos, proveedor desechado), `BRAMBO_EXECUTOR_NOT_FOUND`, `BRAMBO_CONFIGURATION_UNUSABLE` y los códigos de presupuesto `BRAMBO_KERNEL_*`; los resultados del executor se devuelven como sobres.

## Límites

- Sin opción `signal`, sin tiempos de espera ni reintentos; la cancelación pasa por `onInterrupt`.
- No persiste transcripciones; los espacios de trabajo siguen en disco hasta que se eliminan.
- Pasar `sandboxProvider` o `toolExecutor` configura la interfaz de herramientas, pero no dirige por ella las herramientas propias del executor de CLI.
- Las ejecuciones se admiten con un coste fijo de 1 y se concilian con los tokens informados, por lo que los límites de coste y de invocaciones pueden saltar en ejecuciones distintas.

## Cómo funciona

- **Plugins, no constructores.** `createSessionKernel` monta el executor y el proveedor de espacios de trabajo como plugins del kernel y siembra la configuración por capas del kernel con los documentos de brambo; después `runSession` consume los servicios `executor` y `workspace` por nombre. El servicio `executor` es un ejecutor de acciones, de modo que cada ejecución es una acción en el pipeline del kernel y un límite la rechaza antes de iniciar un proceso.
- **Sin fábricas de plugins en la superficie.** `createSessionKernel` devuelve un kernel iniciado y ninguna `PluginFactory`. Una fábrica que quien llama pudiera activar con su propio `ActivationContext` produciría un adaptador real conectado a un pipeline elegido por quien llama, que es justamente el desvío que este paquete existe para cerrar.
- **La eliminación no está en el puerto.** `release()` termina un arrendamiento y `dispose()` conserva el árbol, como promete el contrato de `WorkspaceProvider`. La eliminación es una capacidad aparte y con nombre: `inspectLocalWorkspaces` / `removeLocalWorkspace` e `inspectWorktrees` / `removeWorktree`, que es lo que invoca `brambo workspace remove`.
- **Por qué se rechaza `createProvider` junto a `kernel`.** Un kernel suministrado ya lleva un proveedor; agrupar otro detrás de su pipeline compartido hacía que la segunda ejecución fallara con `BRAMBO_KERNEL_ACTION_INVALID` por un id de espacio de trabajo repetido.
- **Sujetos de los registros.** Los registros de cada ejecución usan el sujeto `${SESSION_ACTION_ID}#${workspace.id}`, así que compare con `subject.startsWith(SESSION_ACTION_ID + '#')`. Llame a `drain()` antes de leer un sumidero en memoria: un sumidero asíncrono puede tener registros en curso cuando `runSession` termina.

```ts
import { createMemoryLogSink, runSession, SESSION_ACTION_ID } from '@brambodev/session'

const log = createMemoryLogSink()
try {
  await runSession({ prompt: 'do not spawn', log, actionPolicy: { maxInvocations: 0 } })
} catch {
  await log.drain()
  const mine = log.records.filter((record) => record.subject.startsWith(SESSION_ACTION_ID + '#'))
  console.log(mine.map((record) => record.event))
}
```

Con una `actionPolicy`, cada ejecución admitida emite `action.estimated` y, cuando el proveedor informó una cifra, `action.settled`, de modo que el total se puede reconstruir solo con los registros. Una sesión individual prácticamente no usa `maxConcurrent`, porque registra una acción y la espera. Un host que presupuesta en tokens debe pasar su propio `cost` mediante `createExecutorPlugin`; brambo no inventa una cifra de tokens previa a la ejecución.

## Véase también

- [Su primera sesión](../tutorials/first-session)
- [Integrar runSession en un host](../guides/host-integration)
- [Cancelación, tiempos de espera y reintentos](../guides/cancellation-timeouts-retries)
