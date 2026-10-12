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

*Estable: cubierto por sus pruebas (y por su suite de contrato cuando el puerto la tiene) y ejercitado por la ruta de sesión o de CLI de brambo. brambo es anterior a 1.0, por lo que siguen siendo posibles cambios incompatibles, que se señalan en el registro de cambios.*

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

## Véase también

- [ADR-009](../explanation/decisions/adr-009)
- [Arquitectura y topología](../explanation/architecture)
