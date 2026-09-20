---
title: Usar un memory provider
audience: Desarrolladores y mantenedores
prerequisites: Node.js >=20 y un paquete publicado de panda
outcome: Persistir y consultar memoria append-only mediante un provider
scope: Integración de MemoryProvider
compatibility: El provider de filesystem admite Node.js >=20; SQLite está medido en Node.js 24.14.1 y 26.8.1
translationStatus: translated
---
# Usar un memory provider

Elegí `@skanl/panda-memory-filesystem` para un log NDJSON append-only o `@skanl/panda-memory-sqlite` para la API `node:sqlite` de la plataforma.

## Camino rápido

```bash
npm install @skanl/panda-memory-filesystem
```

```ts
import { FilesystemMemoryProvider } from '@skanl/panda-memory-filesystem'

const provider = await FilesystemMemoryProvider.open({ storeDir: './.panda/memory' })
await provider.save({
  payload: 'El script de deploy necesita PANDA_HOME.',
  provenance: { agentId: 'codex', workspaceId: 'workspace-1', recordedAt: new Date().toISOString() },
})
const result = await provider.search({ workspaceId: 'workspace-1' })
await provider.dispose()
```

## Reglas append-only

Cada write tiene payload y provenance. La supersession agrega una entrada con `supersedes`; nunca edita ni borra la anterior. `overwrite()` rechaza con `PANDA_CONTRACT_MEMORY_OVERWRITE_UNSUPPORTED`.

## Elegir SQLite

```bash
npm install @skanl/panda-memory-sqlite
```

```ts
import { SqliteMemoryProvider } from '@skanl/panda-memory-sqlite'

const provider = await SqliteMemoryProvider.open({ databasePath: './.panda/memory.db' })
const timeline = await provider.timeline()
await provider.dispose()
```

El provider SQLite está medido solo contra las versiones de Node de su metadata; no generalices esa medición.

## Reapertura y versiones

Un store ausente se crea y se sella. Un formato no soportado se rechaza en vez de migrarse. `dispose()` es idempotente y no borra estado.

## Verificar un provider

Ejecutá la contract suite compartida. Verifica append-only, provenance, orden determinista, reapertura, versiones y disposal.

## Siguiente paso

Leé [Conceptos centrales](../explanation/concepts) antes de montar un provider.
