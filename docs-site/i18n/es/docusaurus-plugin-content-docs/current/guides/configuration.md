---
title: Configuración
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Configure executor and workspace defaults with supported keys
scope: Public configuration inputs and precedence
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# Configuración

`runSession` recibe una instantánea de configuración; no lee archivos automáticamente. Usa `readExecutorConfigLayers({ projectDir })` para leer las capas global y del proyecto.

## Archivos y precedencia

Las rutas son `~/.brambo/config.json` y `<project>/.brambo/config.json`. Las capas se combinan en este orden: defaults, global, project, agent e invocation. Un archivo presente pero inválido produce un error codificado; no se ignora.

## Claves admitidas

| Clave | Valor predeterminado | Uso |
| --- | --- | --- |
| `executor` | `claude-code` | ID del executor incluido: `claude-code`, `codex` u `opencode`. |
| `workspace.provider` | `local` | Provider incluido: `local` o `git-worktree`. |
| `workspace.rootDir` | `.brambo/workspaces` bajo la raíz del proyecto | Directorio raíz para los workspaces administrados. |

El `cwd` de la invocación establece la raíz del proyecto. Brambo define `workspace.rootDir` a partir de esa raíz en la capa de invocación (o en la capa predeterminada si no se proporciona `cwd`); un `workspace.rootDir` configurado en el proyecto tiene precedencia mediante la combinación normal de capas. Consulta [Executors y workspaces](./executors-and-workspaces) para elegir un provider.

## Siguiente paso

Usa [Troubleshooting](../reference/troubleshooting) si una configuración no se puede leer o validar.
