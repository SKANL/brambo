---
title: workspace-git-worktree
audience: Developers integrating @brambodev/workspace-git-worktree
prerequisites: Node.js >=20
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/workspace-git-worktree 0.5.x'
compatibility: Node.js >=20
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/workspace-git-worktree

<Badge status="stable">Estable</Badge>

*Estable: cubierto por sus pruebas (y por su suite de contrato cuando el puerto la tiene) y ejercitado por la ruta de sesión o de CLI de brambo. brambo es anterior a 1.0, por lo que siguen siendo posibles cambios incompatibles, que se señalan en el registro de cambios.* [Criterios de estado](../reference/package-status).

Un `WorkspaceProvider` sobre git worktrees reales. Cada espacio de trabajo es un `git worktree` separado en `<stateDir>/trees/w-<n>` con un registro de propiedad durable; los ordinales se reservan bajo un bloqueo de archivo entre procesos y nunca se reutilizan. La eliminación rechaza el trabajo que se perdería.

| | |
|---|---|
| Mundo | Mundo de sesión |
| Nivel de topología | 2 |
| Node.js | `>=20` |
| Depende de | [`contracts`](./contracts), [`kernel`](./kernel), [`lock`](./lock) |

## Instalación

```bash
npm install @brambodev/workspace-git-worktree
```

## Ejemplo

```ts
import { GitWorktreeWorkspaceProvider, inspectWorktrees, removeWorktree } from '@brambodev/workspace-git-worktree'

const stateDir = '/src/project/.brambo/workspaces'
const provider = new GitWorktreeWorkspaceProvider({ repoPath: '/src/project', stateDir })
const handle = await provider.create()
await provider.release(handle)
await provider.dispose()

const inspection = await inspectWorktrees(stateDir)
console.log(inspection)
console.log((await removeWorktree(stateDir, handle.id)).kind) // 'removed' | 'retired' | 'refused' | 'unknown'
```

## Puertos

- **Implementa:** `WorkspaceProvider`; kernel `workspace` plugin (`createGitWorktreeWorkspacePlugin`).
- **Consume:** `git` en `PATH`; `@brambodev/lock`.

## Errores

`BRAMBO_CONTRACT_WORKSPACE_*` (incluidos `_CONTENTION` y `_REMOVAL_REFUSED`), `BRAMBO_CONTRACT_PROVIDER_DISPOSED`; los fallos de git son `BRAMBO_CONTRACT_WORKSPACE_UNAVAILABLE` con el mensaje de git.

## Límites

- Los comandos git se ejecutan sin tiempo de espera.
- Los worktrees están separados; no se crea ninguna rama.
- `removeWorktree` rechaza un árbol con cambios o un commit HEAD que ninguna referencia contiene; no hay forma de forzarlo.
- Nunca se toman intenciones de eliminación de otro host.

## Véase también

- [Usar un proveedor de espacios de trabajo](../how-to/use-workspace-provider)
- [Executors y espacios de trabajo](../guides/executors-and-workspaces)
