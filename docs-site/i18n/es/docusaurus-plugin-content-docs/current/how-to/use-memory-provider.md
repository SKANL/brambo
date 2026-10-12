---
title: Usar un proveedor de memoria
audience: Developers and maintainers
prerequisites: Node.js >=20 and a published brambo package
outcome: Persistir y consultar memoria de solo adición mediante un proveedor
scope: Integración de MemoryProvider
compatibility: Filesystem provider supports published Node.js >=20; SQLite is measured on Node.js 24.14.1 and 26.8.1
translationStatus: translated
---
# Usar un proveedor de memoria

Elija `@brambodev/memory-filesystem` para un registro NDJSON de solo adición o `@brambodev/memory-sqlite` para la API `node:sqlite` de la plataforma.

Ambos proveedores superan la suite de contrato de memoria, pero ningún otro paquete de brambo los consume todavía: es su host quien los conecta. Trátelos como piezas experimentales.

## Ruta rápida

```bash
npm install @brambodev/memory-filesystem
```

```ts
import { FilesystemMemoryProvider } from '@brambodev/memory-filesystem'

const provider = await FilesystemMemoryProvider.open({ storeDir: './.brambo/memory' })
await provider.save({
  payload: 'The deploy script needs BRAMBO_HOME.',
  provenance: { agentId: 'codex', workspaceId: 'workspace-1', recordedAt: new Date().toISOString() },
})
const result = await provider.search({ workspaceId: 'workspace-1' })
await provider.dispose()
```

## Reglas de solo adición

Cada escritura tiene carga y procedencia. La sustitución añade una entrada nueva con `supersedes`; nunca edita ni borra la entrada anterior. `overwrite()` rechaza con `BRAMBO_CONTRACT_MEMORY_OVERWRITE_UNSUPPORTED`.

## Elegir SQLite

```bash
npm install @brambodev/memory-sqlite
```

```ts
import { SqliteMemoryProvider } from '@brambodev/memory-sqlite'

const provider = await SqliteMemoryProvider.open({ databasePath: './.brambo/memory.db' })
const timeline = await provider.timeline()
await provider.dispose()
```

El proveedor SQLite solo se ha medido con las versiones de Node.js indicadas en sus metadatos de compatibilidad; no generalice esa medición.

## Reapertura y versiones

Un almacén ausente se crea y se sella. Un formato no soportado se rechaza en lugar de migrarse. `dispose()` es idempotente y no borra el estado.

## Verificar un proveedor

Ejecute la suite de contrato de memoria compartida. Comprueba el comportamiento de solo adición, la procedencia, el orden determinista, la reapertura, el rechazo de versiones y la eliminación.

**Mantenga la propiedad en el host.**

`runSession` no recibe ni escribe un `MemoryProvider`. El host que integra brambo es dueño de la persistencia, elige qué entradas validadas pasan a ser contexto del prompt y desecha el proveedor que abrió. Así se evita que una respuesta del executor finja haber persistido un hecho y se mantiene el ciclo de vida del proveedor separado del de la sesión.

Para que el executor inicie la persistencia, componga la ruta explícita de `executeTool()` con una invocación de herramienta validada, la aprobación del host y un `ToolExecutor`. Una herramienta descubierta no otorga autoridad de ejecución, y ninguno de los dos proveedores de memoria se conecta implícitamente a `runSession`.

## Próximo paso

Lea [Los tres mundos](../explanation/concepts) antes de montar un proveedor.
