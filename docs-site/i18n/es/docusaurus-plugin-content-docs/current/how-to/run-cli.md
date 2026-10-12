---
title: Apéndice de la CLI
audience: Developers who want the brambo command line
prerequisites: Node.js >=20 and a separately installed executor
outcome: Ejecutar brambo desde una terminal, gestionar el registro y el entorno y escribir scripts basados en sus códigos de salida
scope: La superficie completa de la línea de comandos de brambo en 0.5.x
compatibility: Published CLI packages support Node.js >=20; vendor executors have their own requirements
translationStatus: translated
---
# Apéndice de la CLI

`@brambodev/cli` proporciona el comando `brambo`: análisis de argumentos, salida JSON y códigos de salida sobre el SDK, y nada más. No lee archivos por sí mismo y no puede componer un kernel. Si está construyendo un producto, use directamente `@brambodev/session` y los demás paquetes del SDK; esta página es para el uso en terminal y en scripts.

## Instalación y ejecución

```bash
npm install --global @brambodev/cli
brambo run "List the files in this workspace"
brambo run --executor codex --trace "List the files in this workspace"
```

`run` imprime el `ResultEnvelope` como JSON en stdout y una línea en stderr con el executor seleccionado y la capa de configuración que lo decidió. `--trace` escribe en stderr los registros de acciones del kernel a medida que ocurren; stdout sigue siendo el sobre. Dentro del repositorio, `pnpm brambo ...` es una comodidad de desarrollo, no la ruta de instalación para consumidores.

Con un host que registra proveedores de API (mediante `runBrambo` y su opción `apiRegistry`), `brambo run --executor-profile api:<providerId> --model <model> "<prompt>"` ejecuta un executor de API. El binario independiente nunca carga un proveedor nombrado en la línea de comandos ni en la configuración.

## Comandos

| Comando | Hace |
| --- | --- |
| `brambo run [--executor <id>] [--trace] "<prompt>"` | Ejecuta un prompt en un espacio de trabajo nuevo bajo `.brambo/workspaces`. |
| `brambo add <skill\|mcp-server> <id> [--command <c>] [--entry-path <p>] [--arg <a>]...` | Registra una entrada; no proyecta nada. Anteponga `project` para el ámbito de proyecto. |
| `brambo remove <type> <id>` | Elimina una entrada; acepta tipos retirados. |
| `brambo list` | Enumera cada entrada con su tipo, identificador y ámbito. |
| `brambo export <path>` / `brambo import <path>` | Traslada el registro de la máquina como un paquete; las entradas que parecen credenciales se omiten y se nombran. |
| `brambo ingest [--dry-run]` | Añade los skills y servidores MCP que ya hay en esta máquina; nunca elimina nada. |
| `brambo init` / `brambo project init [directory]` | Prepara la máquina o un proyecto y proyecta en cada executor detectado. |
| `brambo doctor` / `brambo project doctor [directory]` | Informa de lo que cambiaría init y de cada problema que detecta. No escribe nada. |
| `brambo status` | Informa del uso que cada executor publicó por última vez. No invoca ningún executor. |
| `brambo remediate <adopt\|release\|repair\|discard> [--executor <id>] [--entry <id>] [--apply]` | Resuelve un estado que informó doctor; solo describe salvo con `--apply`. |
| `brambo swap <executor\|method> <id>` | Escribe la selección en la configuración de brambo e informa de la capa que realmente decide. |
| `brambo workspace remove [<id>]` | Elimina un espacio de trabajo propiedad de brambo o termina eliminaciones interrumpidas. |
| `brambo --help`, `brambo --version` | Uso y versión. |

El ámbito lo da la gramática: una palabra `project` al principio significa ámbito de proyecto. No hay ningún comando de ámbito de agente.

## Códigos de salida

| Comando | `0` | `1` | `2` |
| --- | --- | --- | --- |
| `run` | Sobre `ok` | Sobre `failed` o `cancelled` (se imprime igualmente) | Fallo de uso, solicitud inválida, configuración o entorno |
| `init` | Ningún destino falló | Un destino no se pudo proyectar | No se detectó ningún executor, u otro fallo |
| `doctor` | Sin problemas | Al menos un hallazgo que es un problema | No se pudo producir ningún diagnóstico |
| `status` | Se produjo un informe | No se usa | No se pudo producir ningún informe |
| `remediate` | Descrito o realizado | Rechazado (`BRAMBO_PROJECTION_REMEDIATION_REFUSED`) | Fallo de uso o del entorno |
| `remove` | Eliminado | La entrada no estaba registrada en ese ámbito | Fallo de uso o del registro |
| `workspace remove` | Hecho o nada que hacer | Rechazado, o un identificador que no es de brambo | Fallo de uso o del entorno |

Base sus scripts en el código de salida, no en stderr.

## Archivos

| Archivo | Propósito |
| --- | --- |
| `~/.brambo/config.json` | Configuración global (`executor`, `method`, `workspace`) |
| `<project>/.brambo/config.json` | Configuración del proyecto; un `method` de proyecto es una recomendación y no se carga |
| `~/.brambo/registry.json`, `<project>/.brambo/registry.json` | Almacenes del registro |
| `~/.brambo/projection-ledger.json` | Registro de propiedad de la proyección |
| `~/.brambo/usage-observations.json` | Uso informado por los executors, leído por `status` |
| `<cwd>/.brambo/workspaces/` | Espacios de trabajo creados por `run` |

El orden de selección del executor es el valor predeterminado (`claude-code`), después el documento global, después el del proyecto y por último `--executor`. Un documento ausente es una capa ausente; uno existente e inválido termina con `2` y `BRAMBO_CONFIGURATION_UNUSABLE`.

```json
{ "executor": "codex", "workspace": { "provider": "git-worktree" } }
```

## Lo que la CLI no hace

No aísla al executor (Claude Code se ejecuta con `--dangerously-skip-permissions`), no fija tiempos de espera, no reintenta, no persiste transcripciones ni elimina espacios de trabajo por su cuenta. Esos límites son los del SDK; consulte [Limitaciones conocidas](../reference/known-limitations).

## Próximo paso

Para las claves de configuración consulte [Configuración](../guides/configuration); para los fallos, [Solución de problemas](../reference/troubleshooting).
