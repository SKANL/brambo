---
title: Crear tu primera sesión de panda
sidebar_position: 1
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Understand this documentation page
scope: This page
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# Crear tu primera sesión de panda

Usá `@skanl/panda-session` cuando tu host necesite un resultado tipado sin hacerse cargo del parseo de argumentos, los códigos de salida y la limpieza del ciclo de vida de un CLI.

## Camino rápido

1. Instalá el SDK:

   ```bash
   npm install @skanl/panda-session
   ```

2. Creá `session.mjs`:

   ```js
   import { runSession } from '@skanl/panda-session'

   const result = await runSession({ prompt: 'List the files in this workspace' })
   console.log(result.status, result.summary)
   ```

3. Ejecutalo desde el workspace que querés que use panda:

   ```bash
   node session.mjs
   ```

El valor devuelto es un `ResultEnvelope`. Un resultado fallido o cancelado contiene un arreglo `errors` no vacío; los fallos de entorno lanzan un error con código.

## Usar los documentos de configuración

`runSession` no lee archivos por sí solo. Leé las capas una vez y pasá la instantánea a la ejecución:

```js
import { readExecutorConfigLayers, runSession } from '@skanl/panda-session'

const configLayers = await readExecutorConfigLayers({ projectDir: process.cwd() })
const result = await runSession({ prompt: 'List the files in this workspace', configLayers })
console.log(result)
```

Las capas se resuelven en este orden: defaults, global, project, agent y luego invocation. La raíz del workspace sale del `cwd` de la invocación o de `workspace.rootDir` cuando omitís `cwd`.

## Qué pasa con el workspace

El provider predeterminado crea `.panda/workspaces/<uuid>` debajo de la raíz seleccionada. `release()` termina un lease; no elimina el workspace. Para borrar, usá los helpers explícitos de eliminación.

## Siguiente paso

Si necesitás reemplazar el executor o la implementación del workspace, leé [Crear un adapter](../how-to/create-adapter).
