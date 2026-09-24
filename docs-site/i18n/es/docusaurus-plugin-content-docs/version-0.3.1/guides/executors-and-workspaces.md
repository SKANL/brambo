---
title: Executores y workspaces
audience: Developers and maintainers
prerequisites: Node.js >=20 y un executor instalado por separado
outcome: Elegir un executor y un provider de workspace compatibles
scope: Implementaciones incluidas y su ciclo de vida
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# Ejecutores y workspaces

Los adapters de executor ejecutan prompts; los providers de workspace crean y administran leases. Son puertos separados y se pueden elegir de forma independiente.

## Elegir un executor

Los IDs incluidos son `claude-code`, `codex` y `opencode`; el predeterminado es `claude-code`. Instala y autentica el CLI vendor por separado. Consulta [Ejecutar el CLI](../how-to/run-cli).

## Elegir un provider de workspace

Los providers incluidos son `local` y `git-worktree`. El provider local crea directorios; el provider Git administra worktrees y registros durables de ownership. Ambos emiten leases de un solo uso: release termina un lease y dispose conserva el estado. Consulta [Usar un workspace provider](../how-to/use-workspace-provider) para ver ejemplos.

## Configurar o inyectar

Define `executor`, `workspace.provider` y, de forma opcional, `workspace.rootDir` en las capas de configuración. En integraciones SDK, usa los valores predeterminados de `runSession` o los seams publicados `createAdapter` y `createProvider`. La existencia de un tipo de contrato no implica una implementación incluida.

## Siguiente paso

Lee [Crear un adapter](../how-to/create-adapter) si implementarás un puerto de executor propio.
