---
title: Executors y espacios de trabajo
audience: Host integrators choosing how a session runs
prerequisites: Node.js >=20 and a separately installed executor CLI or API access
outcome: Elegir entre executors de CLI y de API y entre espacios de trabajo locales y git worktree, y configurar cada uno
scope: Adaptadores de executors y proveedores de espacios de trabajo incluidos en 0.5.x
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# Executors y espacios de trabajo

Un executor ejecuta el prompt; un proveedor de espacios de trabajo decide dónde. Son puertos separados (`ExecutorAdapter` y `WorkspaceProvider`) y se eligen de forma independiente.

## Executors de CLI o de API

| | Executors de CLI (`adapter-cli`) | Executors de API (`adapter-api` + proveedor) |
|---|---|---|
| Qué se ejecuta | El agente de programación del proveedor como proceso hijo | Solicitudes HTTP a un modelo alojado |
| Incluidos | `claude-code` (predeterminado), `codex`, `opencode` | `openai`, `anthropic` |
| Quién edita los archivos | El agente del proveedor, con sus propias herramientas | Su host, mediante el bucle local de herramientas y `executeTool` |
| Credenciales | El inicio de sesión propio de la CLI del proveedor | Inyectadas por su host en cada ejecución |
| Permisos | Postura del proveedor (ver abajo); brambo no es un sandbox | Cada llamada a herramienta pasa por su autorizador o `approveTool` |
| Selección | `executorId` o la clave de configuración `executor` | `registry.create(...)` pasado como `createAdapter` |

Elija executors de CLI cuando quiera el comportamiento completo del agente del proveedor con una integración mínima. Elija executors de API cuando su host deba controlar cada llamada a herramienta, credencial y solicitud. Consulte [Executors de API](./api-executors) para el registro.

## Executors de CLI

Cada executor de CLI es un registro de rasgos: un comando, argumentos fijos, cómo se entrega el prompt y cómo se analiza la salida JSON.

| id | Comando y argumentos fijos | Prompt por |
|---|---|---|
| `claude-code` | `claude --print --output-format stream-json --verbose --no-session-persistence --dangerously-skip-permissions` | stdin |
| `codex` | `codex exec --json --skip-git-repo-check` | stdin |
| `opencode` | `opencode run --format json --` | último argumento |

**Lea la postura de permisos antes de publicar.** `claude-code` se ejecuta con las confirmaciones de permisos de Claude Code desactivadas, porque una ejecución sin interfaz no tiene aprobador interactivo. `codex` se ejecuta bajo el sandbox de solo lectura predeterminado de Codex, por lo que, tal como se distribuye, no puede editar archivos. Los tres se ejecutan con los privilegios de su usuario; el espacio de trabajo es el directorio de trabajo, no una jaula. Consulte [Fronteras de seguridad](../explanation/security-boundaries).

Instale e inicie sesión en la CLI del proveedor por separado; brambo no hace ninguna de las dos cosas. Personalice el lanzamiento mediante `adapterOptions`:

```ts
import { runSession } from '@brambodev/session'

const envelope = await runSession({
  prompt: 'Fix the failing unit test',
  executorId: 'claude-code',
  adapterOptions: {
    command: '/opt/claude/bin/claude', // a binary that is not on PATH
    inheritEnv: ['PATH', 'HOME'],      // omit to inherit everything; [] to inherit nothing
    env: { ANTHROPIC_LOG: 'error' },
  },
})
```

Otras opciones: `extraArgs`, `spawner` (inyectar un lanzador de procesos hijo), `onStreamEvent`, `onTiming`, `onUsageObservation` y `modelControls` tipados (que requieren una `executorVersion` declarada y un ejecutable directo; un shim `.cmd` o `.bat` de Windows se rechaza).

Límites que conviene conocer:

- stdout y stderr se capturan hasta 1 MiB cada uno; el truncado se marca en `envelope.data`.
- Un prompt pasado como argumento (`opencode`) está limitado a 30.000 caracteres en Windows y 100.000 en el resto.
- El texto de fallo de stderr se redacta para eliminar secretos del entorno y formas habituales de credenciales antes de llegar a `errors`.
- No hay tiempo de espera. Consulte [Cancelación, tiempos de espera y reintentos](./cancellation-timeouts-retries).

## Proveedores de espacios de trabajo

| Proveedor | Paquete | Crea | Adecuado para |
|---|---|---|---|
| `local` (predeterminado) | `workspace-local` | Un directorio `<rootDir>/<uuid>` con un registro de propiedad `.brambo-workspace.json` | Trabajo temporal, árboles sin git |
| `git-worktree` | `workspace-git-worktree` | Un `git worktree` separado en `<stateDir>/trees/w-<n>` con un registro de propiedad | Aislar ediciones de su copia de trabajo compartiendo el historial de git |

Ambos emiten leases de un solo uso. `release(handle)` termina un lease y deja el directorio; una segunda liberación es `BRAMBO_CONTRACT_WORKSPACE_DOUBLE_RELEASE`. `dispose()` es idempotente y deja todos los directorios; cualquier llamada posterior es `BRAMBO_CONTRACT_PROVIDER_DISPOSED`.

El proveedor git-worktree asigna ordinales bajo un bloqueo de archivo (de modo que procesos concurrentes nunca reutilizan uno), crea el worktree separado (sin rama) y ejecuta git sin tiempo de espera. Los fallos de git aparecen como `BRAMBO_CONTRACT_WORKSPACE_UNAVAILABLE` con el mensaje propio de git.

## Seleccionar mediante configuración

`readExecutorConfigLayers` lee `~/.brambo/config.json` y `<project>/.brambo/config.json`:

```json
{
  "executor": "codex",
  "workspace": { "provider": "git-worktree", "rootDir": "/srv/brambo/workspaces" }
}
```

Con `git-worktree`, la sesión usa la raíz del proyecto como repositorio. Si falta `workspace.rootDir`, se usa `<cwd>/.brambo/workspaces`; un documento inválido es `BRAMBO_CONFIGURATION_UNUSABLE`. Consulte [Configuración](./configuration) para todas las claves.

## Eliminar espacios de trabajo

La eliminación es un paso separado y explícito:

```ts
import { inspectLocalWorkspaces, removeLocalWorkspace } from '@brambodev/session'

const root = '.brambo/workspaces'
const { claimed } = await inspectLocalWorkspaces(root)
for (const workspace of claimed) {
  const outcome = await removeLocalWorkspace(root, workspace.id)
  console.log(workspace.id, outcome.kind) // 'removed' | 'refused' | 'unknown'
}
```

Solo se eliminan directorios con un registro de propiedad coincidente. `removeWorktree` además rechaza un worktree con cambios (git lo rechaza) o uno cuyo commit HEAD no contiene ninguna referencia, de modo que nunca se borra trabajo sin referencia.

## Próximo paso

Lea [Crear un adaptador](../how-to/create-adapter) para implementar su propio executor, o [Usar un proveedor de espacios de trabajo](../how-to/use-workspace-provider) para controlar un proveedor directamente.
