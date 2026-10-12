---
title: Usar un proveedor de espacios de trabajo
audience: Developers and maintainers
prerequisites: Node.js >=20 and a published brambo package
outcome: Seleccionar un proveedor de espacios de trabajo incluido y gestionar con seguridad la limpieza de los leases
scope: Integración de WorkspaceProvider
compatibility: Published workspace packages support Node.js >=20
translationStatus: translated
---
# Usar un proveedor de espacios de trabajo

Un `WorkspaceProvider` es dueño de leases de espacios de trabajo, no de directorios arbitrarios. Libere el handle que devuelven `create()` o `acquire()`.

## Usar un espacio de trabajo local

```bash
npm install @brambodev/workspace-local
```

```ts
import { LocalWorkspaceProvider } from '@brambodev/workspace-local'

const provider = new LocalWorkspaceProvider({ rootDir: './.brambo/workspaces' })
const handle = await provider.create()
try {
  console.log(handle.rootPath, handle.capabilities)
} finally {
  await provider.release(handle)
  await provider.dispose()
}
```

Cada handle es un lease de un solo uso. Liberarlo dos veces lanza `BRAMBO_CONTRACT_WORKSPACE_DOUBLE_RELEASE`; la eliminación del proveedor rechaza las operaciones posteriores y deja intacto el estado de los espacios de trabajo.

## Usar git worktrees

```bash
npm install @brambodev/workspace-git-worktree
```

```ts
import { GitWorktreeWorkspaceProvider } from '@brambodev/workspace-git-worktree'

const provider = new GitWorktreeWorkspaceProvider({ repoPath: '/src/project', stateDir: '/src/project/.brambo/workspaces' })
const handle = await provider.create()
await provider.release(handle)
await provider.dispose()
```

La propiedad proviene del registro durable de brambo, no de la presencia de un directorio. Un directorio sin registro es externo y no se entrega ni se elimina.

## Reglas del contrato

`WorkspaceHandle` contiene `id`, `rootPath` y las capacidades únicas `read`/`write`. Los proveedores rechazan con errores con código los handles falsificados, los identificadores desconocidos, la doble liberación y las operaciones posteriores a la eliminación.

## Verificar un proveedor

Ejecute `runWorkspaceContractSuite(provider)` de `@brambodev/contracts` y revise cada cláusula nombrada; consulte [Suites de contrato](../guides/contract-suites).

## Próximo paso

Lea [Executors y espacios de trabajo](../guides/executors-and-workspaces) para seleccionar un proveedor mediante configuración, incluidos los ayudantes de eliminación.
