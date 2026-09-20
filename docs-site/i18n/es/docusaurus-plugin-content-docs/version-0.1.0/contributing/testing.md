---
title: Testing
audience: Contributors y mantenedores
prerequisites: Node.js >=24 y pnpm 11
outcome: Ejecutar verificación focalizada y de repositorio para los cambios
scope: Flujo de testing para contributors
compatibility: Los checks del repositorio requieren Node.js >=24; CI prueba la matriz documentada
translationStatus: translated
---
# Testing

Mantén el cambio, su test y su explicación en la misma unidad de trabajo. Empieza con el proof más estrecho y luego ejecuta los gates relevantes.

## Camino rápido

```bash
pnpm check
pnpm build
pnpm proof:consumer-install
pnpm docs:check
```

`pnpm check` valida bytes fuente, types, tests y linting. No reemplaza consumer-install ni los checks de documentación.

## Contract suites

Los providers y adapters deben ejecutar clauses compartidas:

```ts
import { runWorkspaceContractSuite } from '@skanl/brambo-contracts'

const report = await runWorkspaceContractSuite(provider)
if (!report.passed) throw new Error(JSON.stringify(report.violations))
```

El runner ejecuta todas las clauses y nombra cada violación; un fallo no oculta las siguientes.

## Checks focalizados por paquete

```bash
pnpm --filter @skanl/brambo-contracts exec vitest run
pnpm --filter @skanl/brambo-session exec vitest run
pnpm docs:check
```

Si el comando recursivo se detiene temprano, ejecuta directamente Vitest del paquete afectado para no declarar verificados los paquetes posteriores.

## Gates de consumer y documentación

Cambios en exports, import specifiers, declarations o metadata requieren `pnpm build && pnpm proof:consumer-install`. Documentación requiere `pnpm docs:check`, que valida rutas, frontmatter, links, API y estructura de ejemplos.

## Siguiente paso

Lee [Contribuir](../guides/contributing) para el flujo y las expectativas de review.
