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

La documentación pública canónica es **0.3.1**, alineada con la línea actual de paquetes publicados. La entrada **0.3.0** permanece disponible como archivo histórico; no exponemos a los lectores una documentación no publicada llamada “Next”.

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
