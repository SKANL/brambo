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
| `method` | ninguno | Especificador de módulo de un plugin de método para montar. Se respeta solo desde la capa global, un documento suministrado por el host (`agent`) y la capa de invocación. Un `method` en el documento del proyecto es una recomendación: se descarta antes de combinar las capas (importarlo ejecutaría código de un repositorio clonado) y se informa mediante `DeclinedConfigKey`. |

El `cwd` de la invocación establece la raíz del proyecto. Brambo define `workspace.rootDir` a partir de esa raíz en la capa de invocación (o en la capa predeterminada si no se proporciona `cwd`); un `workspace.rootDir` configurado en el proyecto tiene precedencia mediante la combinación normal de capas. Consulta [Executors y workspaces](./executors-and-workspaces) para elegir un provider.

## Perfiles de executor y controles de modelo

Los controles de modelo y provider no son claves de `config.json`. Se definen en código o en la línea de comandos:

- **CLI:** `brambo run --executor-profile api:<providerId> --model <model> "<prompt>"` selecciona un provider de API registrado; `--model` es obligatorio con un perfil de API. `--executor <id>` selecciona un executor CLI incluido para una sola invocación.
- **SDK:** `validateApiExecutorProfile({ providerId, model })` de `@brambodev/environment/api-executors` valida el mismo perfil para un host.
- **Ejecuciones durables:** `resolveExecutionConfiguration(layers, host)` de `@brambodev/orchestration` resuelve `providerId`, `model`, `configuration` y las `extensions` con namespace a través de las capas `defaults`, `profile`, `task` y `run`, las valida contra el `ExecutionControlContract` del provider y devuelve un `EffectiveExecutionConfiguration` congelado con recibos de soporte.

## Siguiente paso

Usa [Troubleshooting](../reference/troubleshooting) si una configuración no se puede leer o validar.
