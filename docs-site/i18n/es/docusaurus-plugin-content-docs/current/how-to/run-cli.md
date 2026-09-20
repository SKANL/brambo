---
title: Ejecutar el CLI
audience: Desarrolladores y mantenedores
prerequisites: Node.js >=20 y un executor instalado por separado
outcome: Ejecutar panda con un executor seleccionado e interpretar su salida
scope: Uso de la línea de comandos de panda
compatibility: Los paquetes CLI publicados admiten Node.js >=20; los executors vendor tienen requisitos propios
translationStatus: translated
---
# Ejecutar el CLI

Instalá el CLI globalmente y ejecutá un prompt. panda imprime un resultado estructurado; el executor vendor debe instalarse y autenticarse por separado.

## Camino rápido

```bash
npm install --global @skanl/panda-cli
panda run "list files in this workspace"
```

En el checkout del repositorio, `pnpm panda ...` es una comodidad de desarrollo, no la ruta de instalación de un consumer.

## Seleccionar un executor

```bash
panda run --executor codex "list files in this workspace"
```

Los ids son `claude-code`, `codex` y `opencode`. La selección resuelve `defaults`, `global`, `project` e `invocation`; el default incorporado es `claude-code`.

## Leer la salida y el estado

El resultado es JSON en stdout. Cada invocación informa en stderr el executor y la layer que decidió. En scripts, elegí la rama por exit code, no por la presencia de stderr.

| Exit code | Significado |
| --- | --- |
| `0` | Envelope `ok`. |
| `1` | Envelope `failed` o `cancelled`. |
| `2` | Fallo de uso, request, configuración o environment. |

## Archivos de configuración

La configuración global está en `~/.panda/config.json`; la de proyecto, en `<project>/.panda/config.json`. Una layer faltante está ausente. Un documento inválido es un fallo codificado, no fallback silencioso.

```json
{ "executor": "codex" }
```

## Siguiente paso

Usá [Troubleshooting](../reference/troubleshooting) cuando falle la configuración o selección del executor.
