---
title: Usar un workspace provider
audience: Desarrolladores y mantenedores
prerequisites: Node.js >=20 y un paquete publicado de brambo
outcome: Crear, adquirir y liberar leases de workspace de forma segura
scope: Integración de WorkspaceProvider
compatibility: Los paquetes publicados de workspace admiten Node.js >=20
translationStatus: translated
---
# Usar un workspace provider

Un `WorkspaceProvider` posee leases, no directorios arbitrarios. Liberá el handle devuelto por `create()` o `acquire()`.

## Usar un workspace local

```bash
npm install @skanl/brambo-workspace-local
```

```ts
import { LocalWorkspaceProvider } from '@skanl/brambo-workspace-local'

const provider = new LocalWorkspaceProvider({ rootDir: './.brambo/workspaces' })
const handle = await provider.create()
try {
  console.log(handle.rootPath, handle.capabilities)
} finally {
  await provider.release(handle)
  await provider.dispose()
}
```

Cada handle es un lease de un solo uso. Liberarlo dos veces produce `BRAMBO_CONTRACT_WORKSPACE_DOUBLE_RELEASE`; disposal rechaza operaciones posteriores y deja el estado.

## Usar worktrees de Git

```bash
npm install @skanl/brambo-workspace-git-worktree
```

```ts
import { GitWorktreeWorkspaceProvider } from '@skanl/brambo-workspace-git-worktree'

const provider = new GitWorktreeWorkspaceProvider({ repoPath: '/src/project', stateDir: '/src/project/.brambo/workspaces' })
const handle = await provider.create()
await provider.release(handle)
await provider.dispose()
```

El ownership proviene del registro durable de brambo, no de la presencia del directorio. Un directorio sin registro es externo y no se entrega ni elimina.

## Reglas del contract

`WorkspaceHandle` contiene `id`, `rootPath` y capabilities únicas `read`/`write`. Los providers rechazan handles falsificados, ids desconocidos, double release y operaciones posteriores a disposal.

## Verificar un provider

Ejecutá `runWorkspaceContractSuite(provider)` desde `@skanl/brambo-contracts` e inspeccioná cada clause nombrada.

## Siguiente paso

Lee [Ejecutar el CLI](./run-cli) si el workspace se selecciona desde un comando.
