---
title: Compatibilidad
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Understand this documentation page
scope: This page
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# Compatibilidad

La compatibilidad tiene dos respuestas separadas: la versión de Node necesaria para desarrollar brambo y la necesaria para ejecutar sus paquetes publicados.

## Versión de la documentación

La documentación describe la línea de paquetes **0.5.x** y se compila desde la rama `main`. Las instantáneas 0.3.x anteriores se retiraron; la siguiente instantánea congelada se genera a partir de una etiqueta de release (consulta `RELEASING.md`). No existe un sitio de documentación separado llamado “Next” sin publicar.

## Versiones de Node

| Uso | Mínimo compatible |
| --- | --- |
| Desarrollo del repositorio, build y source checks | Node `>=24` |
| Paquetes SDK publicados y consumidores empaquetados | Node `>=20` |

El mínimo del repositorio es una restricción de desarrollo y tooling. No afirma que un consumidor deba usar Node 24. La prueba de consumidor empaquetado ejercita candidatos desde Node 20.

Instala el paquete SDK dueño del límite que necesitas:

```bash
npm install @brambodev/session
```

Los autores de ports deben agregar el paquete de contracts:

```bash
npm install --save-dev @brambodev/contracts
```

## Requisitos por paquete

| Paquete | Node.js | Requisito adicional |
| --- | --- | --- |
| Todos los paquetes salvo los dos siguientes | `>=20` | Ninguno |
| `@brambodev/workflow-store-sqlite` | `>=24.15.0` | `node:sqlite`; con un Node.js anterior lanza `BRAMBO_WORKFLOW_STORE_UNAVAILABLE` |
| `@brambodev/memory-sqlite` | declara `>=20` | Usa `node:sqlite`; solo se ha medido en Node.js 24.14.1 y 26.8.1 |
| `@brambodev/adapter-cli` | `>=20` | La CLI del proveedor instalada y con sesión iniciada; los controles de modelo tipados necesitan un ejecutable directo (sin shim `.cmd`/`.bat` de Windows) |
| `@brambodev/workspace-git-worktree` | `>=20` | `git` en `PATH` |
| `@brambodev/sandbox-local` | `>=20` | Linux: `bwrap` (cgroup v2 para los límites); macOS: `sandbox-exec`; Windows: `brambo-windows-sandbox-broker` |

## Evidencia por plataforma

La matriz de consumidores empaquetados se ejecuta en Linux con Node.js 20, 22.13.0, 22.18.0 y 24. La conformidad del sandbox en hosts reales se ejecuta en Linux y macOS solo cuando se lanza manualmente; la conformidad en hosts Windows no se ejecuta en CI. Consulte [Afirmaciones y evidencia](./claims-and-evidence) y [Limitaciones conocidas](./known-limitations).

## Executors incluidos

`@brambodev/adapter-cli` actualmente ofrece estos IDs:

| ID | Forma de invocación | Fuente del resultado |
| --- | --- | --- |
| `claude-code` | `claude --print --output-format stream-json --verbose --no-session-persistence --dangerously-skip-permissions` | Evento de resultado JSONL |
| `codex` | `codex exec --json --skip-git-repo-check` | Item JSONL `agent_message` |
| `opencode` | `opencode run --format json -- <prompt>` | Parte de texto JSONL |

Los tres están disponibles mediante el catalogue y la selección `--executor` del CLI. El binario debe estar instalado y autenticado por separado; brambo no instala executors del vendor.

## Límites del workspace y del proceso

- El proceso hijo inicia con la raíz del workspace como directorio de trabajo.
- brambo también fija `PWD` a esa raíz porque OpenCode resuelve sus file tools desde `PWD`.
- `HOME` se hereda, por lo que el estado del executor puede compartirse entre sesiones concurrentes.
- Los adapters no afirman aislamiento a nivel del sistema operativo. Las rutas absolutas pueden salir del workspace cuando el proceso del vendor las permite.
- Codex trae su propio modo read-only predeterminado, por lo que no puede crear ni editar archivos salvo que cambie su propia configuración.

## Condición de empaquetado

Los tarballs publicados resuelven para consumidores mediante `import` o `require` hacia `dist`. La condición `brambo-source` existe para el loop de desarrollo basado en source de brambo y los consumidores no la necesitan.

## Lo que compatibilidad no significa

Un shape común de `ExecutorAdapter` no vuelve intercambiables los protocolos de los vendors. La entrega del prompt, los payloads JSONL, las superficies de usage, la cancelación, los permisos y el comportamiento de sandbox siguen siendo específicos de cada executor y están codificados en cada trait o adapter.
