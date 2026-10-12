---
title: projection
audience: Developers integrating @brambodev/projection
prerequisites: Node.js >=20
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/projection 0.5.x'
compatibility: Node.js >=20
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/projection

<Badge status="stable">Estable</Badge>

*Estable: cubierto por sus pruebas (y por su suite de contrato cuando el puerto la tiene) y ejercitado por la ruta de sesión o de CLI de brambo. brambo es anterior a 1.0, por lo que siguen siendo posibles cambios incompatibles, que se señalan en el registro de cambios.* [Criterios de estado](../reference/package-status).

Escribe las entradas del registro en la configuración nativa de cada executor (`~/.claude.json` de Claude Code, `~/.codex/config.toml` de Codex, `~/.config/opencode/opencode.json` de OpenCode y sus raíces de skills) y es dueño del registro (`~/.brambo/projection-ledger.json`) que anota lo que escribió brambo, de modo que se informan las desviaciones y la reversión solo toca la salida de brambo.

| | |
|---|---|
| Mundo | Mundo de entorno |
| Nivel de topología | 2 |
| Node.js | `>=20` |
| Depende de | [`contracts`](./contracts), [`lock`](./lock), `jsonc-parser` |

## Instalación

```bash
npm install @brambodev/projection
```

## Ejemplo

```ts
import { RegistryStore } from '@brambodev/registry'
import { ProjectionLedger, createClaudeMcpTarget, groupByKind, runProjection } from '@brambodev/projection'

const registry = new RegistryStore()
const run = await runProjection({
  entries: groupByKind(await registry.list('global')),
  targets: [createClaudeMcpTarget()],
  ledger: new ProjectionLedger(),
  mode: 'inspect', // nothing is written; results say what would change
})
console.log(run.results, run.failures, run.warnings)
await registry.dispose()
```

## Puertos

- **Implementa:** `ProjectionTarget`s for Claude Code, Codex and OpenCode; `ProjectionLedger`; remediation.
- **Consume:** Entradas del registro; `@brambodev/lock`.

## Errores

`BRAMBO_PROJECTION_*` (nativo mal formado, destino fallido, rasgos inválidos, registro no disponible o en contención, nativo no reclamable, modo inválido, remediación rechazada).

## Límites

- Un escritor por archivo: no se admite la proyección concurrente de un mismo archivo.
- Los skills de ámbito de proyecto no se proyectan; Codex no tiene una ubicación MCP de proyecto verificada.
- Las desviaciones se informan y nunca se resuelven escribiendo.

## Cómo funciona

**Orden de escritura y contención de fallos.** `runProjection` lee el libro de propiedad y después ejecuta cada destino en secuencia; un destino que falla nunca afecta a los demás, y los fallos se devuelven como resultados tipados en lugar de lanzarse. El archivo nativo se escribe antes de que el libro lo registre, de modo que una caída entre ambos pasos reclama de menos en vez de reclamar de más. Un archivo modificado externamente entre la lectura y la escritura hace fallar ese destino en lugar de escribir contenido obsoleto. brambo nunca marca un archivo del proveedor para demostrar propiedad; las escrituras del libro combinan las reclamaciones de un destino, y un libro ilegible se informa y se deja intacto.

| Fábrica | Escribe |
|---|---|
| `createClaudeMcpTarget` | `mcpServers` en `~/.claude.json` (o `.mcp.json` en el ámbito de proyecto), `{type: 'stdio', command, args}` |
| `createOpenCodeConfigTarget` | `mcp.<id>` en `opencode.json`, `{type: 'local', command: argv}` |
| `createCodexConfigTarget` | `[mcp_servers.<id>]` en `config.toml`, solo `command` y `args`, para que `--strict-config` no tenga nada que rechazar |
| `createClaudeSkillsTarget` | copia el `entryPath` de cada skill en `~/.claude/skills/<id>/SKILL.md` |
| `createCodexSkillsTarget` | `~/.codex/skills/<id>/SKILL.md` |
| `createOpenCodeSkillsTarget` | `~/.config/opencode/skills/<id>/SKILL.md` |

Las raíces de skills se verificaron ejecutando cada binario con un directorio personal inyectado (`test/skills-discovery.live.test.ts`). OpenCode también explora `~/.config/opencode/skill`, `~/.opencode/skills` y `~/.opencode/skill`, y con el mismo id en dos raíces gana `~/.opencode/skills` mientras brambo sigue informando su propia escritura; además lee `~/.claude/skills`. Claude Code nombra una skill según su directorio, mientras que codex y opencode usan el `name:` del frontmatter de origen, así que un id de registro distinto de ese nombre aparece con dos nombres. Las entradas que un destino no puede expresar se informan en `skippedEntryIds` con el motivo del destino, nunca se aproximan.

**Remediación.** `runRemediation` es la salida de un estado que informa la proyección. Un sujeto por llamada, y la misma llamada describe o ejecuta (`mode: 'inspect' | 'apply'`, por defecto `'inspect'`), de modo que una vista previa no puede diferir del acto. Un rechazo se devuelve como `BRAMBO_PROJECTION_REMEDIATION_REFUSED`, no se lanza.

| Verbo | Efecto |
|---|---|
| `adopt` | brambo toma la propiedad de lo que hay en su ubicación y solo escribe el libro; la descripción nombra cada ruta que una ejecución posterior podría reemplazar o eliminar |
| `release` | brambo deja de reclamar una ubicación; el archivo no se abre |
| `repair` | reescribe el libro propio de brambo para que contenga exactamente los registros que puede leer |
| `discard` | elimina de un archivo del proveedor la salida anterior de brambo: una clave `$.brambo` cuyos miembros son todos vocabulario de brambo, o un bloque `# BEGIN brambo-managed` |

Cada ruta remediada se resuelve y se demuestra dentro de la ubicación que posee brambo; un enlace a cualquier profundidad la descalifica, y `adopt` construye su reclamación a partir del plan del destino, nunca a partir de un listado de directorio.

## Véase también

- [ADR-009](../explanation/decisions/adr-009)
- [Arquitectura y topología](../explanation/architecture)
