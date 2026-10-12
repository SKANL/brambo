---
title: adapter-cli
audience: Developers integrating @brambodev/adapter-cli
prerequisites: Node.js >=20
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/adapter-cli 0.5.x'
compatibility: Node.js >=20
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/adapter-cli

<Badge status="stable">Estable</Badge>

*Estable: cubierto por sus pruebas (y por su suite de contrato cuando el puerto la tiene) y ejercitado por la ruta de sesión o de CLI de brambo. brambo es anterior a 1.0, por lo que siguen siendo posibles cambios incompatibles, que se señalan en el registro de cambios.* [Criterios de estado](../reference/package-status).

El `ExecutorAdapter` para CLI de programación. Un único motor genérico lanza el binario del proveedor sin interfaz en el espacio de trabajo y traduce su salida JSON a un `ResultEnvelope`; cada executor (`claude-code`, `codex`, `opencode`) es un registro de rasgos con comando, argumentos, entrega del prompt y análisis de la salida. La mayoría de los hosts lo usan mediante `runSession`.

| | |
|---|---|
| Mundo | Mundo de sesión |
| Nivel de topología | 2 |
| Node.js | `>=20` |
| Depende de | [`contracts`](./contracts), [`kernel`](./kernel) |

## Instalación

```bash
npm install @brambodev/adapter-cli
```

## Ejemplo

```ts
import { createExecutorAdapter } from '@brambodev/adapter-cli'
import { LocalWorkspaceProvider } from '@brambodev/workspace-local'

const workspaces = new LocalWorkspaceProvider({ rootDir: './.brambo/workspaces' })
const handle = await workspaces.create()
try {
  const adapter = createExecutorAdapter('codex', { inheritEnv: ['PATH', 'HOME'] })
  const envelope = await adapter.run({ prompt: 'List the files', workspace: handle })
  console.log(envelope.status, envelope.summary)
} finally {
  await workspaces.release(handle)
  await workspaces.dispose()
}
```

## Puertos

- **Implementa:** `ExecutorAdapter`; a kernel executor plugin (`createExecutorPlugin`).
- **Consume:** La CLI del proveedor en `PATH` (o `command`) y un `WorkspaceHandle`.

## Errores

Errores en el sobre `BRAMBO_EXECUTOR_UNAVAILABLE`, `BRAMBO_EXECUTOR_RUN_FAILED`, `BRAMBO_EXECUTOR_CANCELLED`; lanza `BRAMBO_EXECUTOR_NOT_FOUND` para un identificador desconocido y `BRAMBO_CONTRACT_ENVELOPE_INVALID` para una solicitud inválida.

## Límites

- **No es un sandbox.** `claude-code` se lanza con `--dangerously-skip-permissions`; `codex` se ejecuta con su propio valor predeterminado de solo lectura; todos se ejecutan con los privilegios de su usuario.
- Sin tiempo de espera; abortar termina el árbol de procesos.
- stdout y stderr limitados a 1 MiB cada uno; prompts como argumento limitados a 30.000 caracteres en Windows y 100.000 en el resto.
- Los controles de modelo tipados rechazan shims `.cmd`/`.bat` de Windows.

## Véase también

- [Executors y espacios de trabajo](../guides/executors-and-workspaces)
- [Fronteras de seguridad](../explanation/security-boundaries)
