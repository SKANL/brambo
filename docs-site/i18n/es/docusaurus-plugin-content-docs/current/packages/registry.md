---
title: registry
audience: Developers integrating @brambodev/registry
prerequisites: Node.js >=20
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/registry 0.5.x'
compatibility: Node.js >=20
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/registry

<Badge status="stable">Estable</Badge>

*Estable: cubierto por sus pruebas (y por su suite de contrato cuando el puerto la tiene) y ejercitado por la ruta de sesión o de CLI de brambo. brambo es anterior a 1.0, por lo que siguen siendo posibles cambios incompatibles, que se señalan en el registro de cambios.*

El registro canónico del entorno: entradas `skill` y `mcp-server` guardadas por ámbito (`global` en `~/.brambo/registry.json`, `project` en `<project>/.brambo/registry.json`, `agent` en memoria), con escrituras atómicas bajo bloqueo, paquetes portables que omiten las entradas con aspecto de credencial e ingesta de lo que ya está instalado.

| | |
|---|---|
| Mundo | Mundo de entorno |
| Nivel de topología | 2 |
| Node.js | `>=20` |
| Depende de | [`contracts`](./contracts), [`kernel`](./kernel), [`lock`](./lock), `jsonc-parser` |

## Instalación

```bash
npm install @brambodev/registry
```

## Ejemplo

```ts
import { RegistryStore } from '@brambodev/registry'

const store = new RegistryStore({ projectDir: process.cwd() })
await store.register({ type: 'mcp-server', id: 'filesystem', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'] }, 'project')
console.log((await store.list('project')).map((entry) => entry.id))
await store.dispose()
```

## Puertos

- **Implementa:** Registry storage; kernel plugin (`createRegistryPlugin`); machine skill and MCP sources.
- **Consume:** `@brambodev/lock`.

## Errores

`BRAMBO_REGISTRY_*` (entrada inválida, contención, almacén no disponible, versión de almacén distinta, conflicto de origen, paquete no disponible).

## Límites

- Versión de almacén 1; se rechaza un almacén escrito por una versión más nueva de brambo.
- Los tipos de entrada `tool` y `profile` están retirados: se pueden leer y eliminar, pero nunca se escriben.

## Véase también

- [Los tres mundos](../explanation/concepts)
