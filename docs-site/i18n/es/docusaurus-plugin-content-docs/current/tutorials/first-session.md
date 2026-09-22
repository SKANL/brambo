---
title: Crear tu primera sesión de brambo
sidebar_position: 1
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Instalar el SDK, ejecutar un prompt e interpretar el resultado
scope: Primera sesión con el SDK publicado
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# Crear tu primera sesión de brambo

Usa `@brambodev/session` cuando el host necesite un resultado tipado sin hacerse cargo del parseo de argumentos, los códigos de salida y la limpieza del ciclo de vida de un CLI. Se requiere Node.js 20 o posterior y un executor instalado y autenticado por separado, como Claude Code, Codex u OpenCode.

## Camino rápido

1. Instala el SDK:

   ```bash
   npm install @brambodev/session
   ```

2. Crea `session.mjs`:

   ```js
   import { runSession } from '@brambodev/session'

   const result = await runSession({ prompt: 'List the files in this workspace' })
   console.log(result.status, result.summary)
   ```

3. Ejecútalo desde el workspace que quieres que use brambo:

   ```bash
   node session.mjs
   ```

El valor devuelto es un `ResultEnvelope`. Un resultado fallido o cancelado contiene un arreglo `errors` no vacío; los fallos de entorno lanzan un error con código.

Confirma la versión instalada con `npm ls @brambodev/session` o consulta `node_modules/@brambodev/session/package.json`. El executor vendor es un requisito separado; brambo no lo instala ni lo autentica.

## Usar los documentos de configuración

`runSession` no lee archivos por sí solo. Lee las capas una vez y pasa la instantánea a la ejecución:

```js
import { readExecutorConfigLayers, runSession } from '@brambodev/session'

const configLayers = await readExecutorConfigLayers({ projectDir: process.cwd() })
const result = await runSession({ prompt: 'List the files in this workspace', configLayers })
console.log(result)
```

Las capas se resuelven en este orden: defaults, global, project, agent y luego invocation. La raíz del workspace sale del `cwd` de la invocación o de `workspace.rootDir` cuando omitís `cwd`.

Para conocer las claves, las rutas de archivos y los valores predeterminados, continúa con [Configuración](../guides/configuration). Para elegir executor y workspace, consulta [Executors y workspaces](../guides/executors-and-workspaces).

## Qué pasa con el workspace

El provider predeterminado crea `.brambo/workspaces/<uuid>` debajo de la raíz seleccionada. `release()` termina un lease; no elimina el workspace. Para borrar, usa los helpers explícitos de eliminación.

## Siguiente paso

Si necesitas reemplazar el executor o la implementación del workspace, lee [Crear un adapter](../how-to/create-adapter).
