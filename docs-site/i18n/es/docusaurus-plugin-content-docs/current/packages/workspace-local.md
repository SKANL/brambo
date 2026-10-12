---
title: workspace-local
audience: Developers integrating @brambodev/workspace-local
prerequisites: Node.js >=20
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/workspace-local 0.5.x'
compatibility: Node.js >=20
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/workspace-local

<Badge status="stable">Estable</Badge>

*Estable: cubierto por sus pruebas (y por su suite de contrato cuando el puerto la tiene) y ejercitado por la ruta de sesión o de CLI de brambo. brambo es anterior a 1.0, por lo que siguen siendo posibles cambios incompatibles, que se señalan en el registro de cambios.* [Criterios de estado](../reference/package-status).

El `WorkspaceProvider` predeterminado: cada espacio de trabajo es un directorio `<rootDir>/<uuid>` con un registro de propiedad `.brambo-workspace.json`. Los handles son leases de un solo uso; la liberación y la eliminación del proveedor dejan los directorios. Exporta los ayudantes de eliminación `inspectLocalWorkspaces` y `removeLocalWorkspace` y un plugin del kernel.

| | |
|---|---|
| Mundo | Mundo de sesión |
| Nivel de topología | 2 |
| Node.js | `>=20` |
| Depende de | [`contracts`](./contracts), [`kernel`](./kernel) |

## Instalación

```bash
npm install @brambodev/workspace-local
```

## Ejemplo

```ts
import { LocalWorkspaceProvider, inspectLocalWorkspaces } from '@brambodev/workspace-local'

const provider = new LocalWorkspaceProvider({ rootDir: './.brambo/workspaces' })
const handle = await provider.create()
try {
  console.log(handle.id, handle.rootPath, handle.capabilities)
} finally {
  await provider.release(handle)
  await provider.dispose()
}
console.log((await inspectLocalWorkspaces('./.brambo/workspaces')).claimed.length)
```

## Puertos

- **Implementa:** `WorkspaceProvider`; kernel `workspace` plugin.
- **Consume:** El sistema de archivos local.

## Errores

`BRAMBO_CONTRACT_WORKSPACE_UNKNOWN_ID`, `_INVALID_HANDLE`, `_DOUBLE_RELEASE`, `_UNAVAILABLE`, `_REMOVAL_REFUSED`, `BRAMBO_CONTRACT_PROVIDER_DISPOSED`.

## Límites

- Un directorio, no una jaula: nada impide que un proceso salga de él.
- La eliminación solo borra directorios con un registro de propiedad coincidente.

## Véase también

- [Usar un proveedor de espacios de trabajo](../how-to/use-workspace-provider)
- [Executors y espacios de trabajo](../guides/executors-and-workspaces)
