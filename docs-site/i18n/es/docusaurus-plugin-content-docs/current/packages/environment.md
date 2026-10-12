---
title: environment
audience: Developers integrating @brambodev/environment
prerequisites: Node.js >=20
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/environment 0.5.x'
compatibility: Node.js >=20
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/environment

<Badge status="stable">Estable</Badge>

*Estable: cubierto por sus pruebas (y por su suite de contrato cuando el puerto la tiene) y ejercitado por la ruta de sesión o de CLI de brambo. brambo es anterior a 1.0, por lo que siguen siendo posibles cambios incompatibles, que se señalan en el registro de cambios.*

Las operaciones de entorno de máquina y de proyecto detrás de `brambo init`, `brambo doctor` y `brambo remediate`: detección de executors, orquestación de la proyección, un diagnóstico con tipos de hallazgo tipados y remediación con inspección previa. Su código nunca toca el sistema de archivos directamente; compone `registry` y `projection`.

| | |
|---|---|
| Mundo | Mundo de entorno |
| Nivel de topología | 3 |
| Node.js | `>=20` |
| Depende de | [`contracts`](./contracts), [`kernel`](./kernel), [`projection`](./projection), [`registry`](./registry) |

## Instalación

```bash
npm install @brambodev/environment
```

## Ejemplo

```ts
import { diagnose, hasProblem } from '@brambodev/environment'

const diagnosis = await diagnose({ scope: 'machine' })
console.log(hasProblem(diagnosis))
for (const finding of diagnosis.findings) console.log(finding.severity, finding.kind, finding.executorId ?? '')
```

## Puertos

- **Implementa:** `initMachine`, `initProject`, `diagnose`, `remediate`, `detectExecutors`, `ingestMachine`; `@brambodev/environment/api-executors`.
- **Consume:** `registry`, `projection`, `kernel`.

## Errores

`BRAMBO_ENVIRONMENT_SCOPE_UNAVAILABLE`, `BRAMBO_REGISTRY_STORE_UNAVAILABLE`, `BRAMBO_PROJECTION_LEDGER_UNAVAILABLE`, `BRAMBO_PROJECTION_REMEDIATION_REFUSED`.

## Límites

- `remediate` usa por defecto `mode: 'inspect'`; solo aplica cambios cuando se le pide.
- Solo detecta `claude-code`, `codex` y `opencode`.

## Véase también

- [Apéndice de la CLI](../how-to/run-cli)
