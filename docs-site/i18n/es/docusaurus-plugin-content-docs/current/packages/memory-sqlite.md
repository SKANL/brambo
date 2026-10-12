---
title: memory-sqlite
audience: Developers integrating @brambodev/memory-sqlite
prerequisites: Node.js >=20
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/memory-sqlite 0.5.x'
compatibility: Node.js >=20
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/memory-sqlite

<Badge status="experimental">Experimental</Badge>

*Experimental: probado y utilizable, pero su superficie aún puede cambiar y tiene menos evidencia de plataforma o menos consumidores en el repositorio que los paquetes estables.* [Criterios de estado](../reference/package-status).

Un `MemoryProvider` de solo adición. Una tabla `entries` sobre `node:sqlite` con la versión de formato en `PRAGMA user_version`; solo filtra el aviso experimental de SQLite. La sustitución añade una entrada nueva; nada se edita ni se borra.

| | |
|---|---|
| Mundo | De soporte |
| Nivel de topología | 2 |
| Node.js | `>=20` |
| Depende de | [`contracts`](./contracts) |

## Instalación

```bash
npm install @brambodev/memory-sqlite
```

## Ejemplo

```ts
import { SqliteMemoryProvider } from '@brambodev/memory-sqlite'

const memory = await SqliteMemoryProvider.open({ databasePath: './.brambo/memory.db' })
await memory.save({
  payload: 'The deploy script needs BRAMBO_HOME.',
  provenance: { agentId: 'codex', workspaceId: 'workspace-1', recordedAt: new Date().toISOString() },
})
console.log(await memory.search({ workspaceId: 'workspace-1' }))
await memory.dispose()
```

## Puertos

- **Implementa:** `MemoryProvider`.
- **Consume:** `node:sqlite`.

## Errores

`BRAMBO_CONTRACT_MEMORY_*` (guardado inválido, entrada desconocida, sobrescritura no soportada, versión de almacén distinta, almacén no disponible), `BRAMBO_CONTRACT_PROVIDER_DISPOSED`.

## Límites

- Ningún otro paquete de brambo lo consume; `runSession` nunca lee ni escribe memoria. Es su host quien lo conecta.
- Versionar por rechazo: un almacén con otra versión de formato se rechaza y nunca se migra.
- Medido en Node.js 24.14.1 y 26.8.1, aunque declara `>=20`.

## Véase también

- [Usar un proveedor de memoria](../how-to/use-memory-provider)
