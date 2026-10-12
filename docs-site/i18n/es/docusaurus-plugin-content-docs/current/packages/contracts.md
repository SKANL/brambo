---
title: contracts
audience: Developers integrating @brambodev/contracts
prerequisites: Node.js >=20
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/contracts 0.5.x'
compatibility: Node.js >=20
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/contracts

<Badge status="stable">Estable</Badge>

*Estable: cubierto por sus pruebas (y por su suite de contrato cuando el puerto la tiene) y ejercitado por la ruta de sesión o de CLI de brambo. brambo es anterior a 1.0, por lo que siguen siendo posibles cambios incompatibles, que se señalan en el registro de cambios.*

Los puertos con los que programan todas las implementaciones de brambo y todos los autores de puertos de terceros: interfaces tipadas, validadores escritos a mano expuestos mediante Standard Schema, la clase `BramboError` con cada código `BRAMBO_*` y las suites de contrato ejecutables. No tiene dependencias de ejecución, así que un autor de puertos puede instalarlo solo.

| | |
|---|---|
| Mundo | Núcleo |
| Nivel de topología | 0 |
| Node.js | `>=20` |
| Depende de | ninguno |

## Instalación

```bash
npm install @brambodev/contracts
```

## Ejemplo

```ts
import { BRAMBO_ERROR_CODES, BramboError, validateEnvelope } from '@brambodev/contracts'

const envelope = validateEnvelope({ status: 'failed', data: null, summary: 'tests failed', errors: [{ message: '2 failing' }] })
console.log(envelope.status) // 'failed'

try {
  validateEnvelope({ status: 'failed', data: null, summary: 'no reason given' })
} catch (error) {
  // A failed envelope must say why: the schema refuses an empty errors array.
  console.log(error instanceof BramboError && error.code === BRAMBO_ERROR_CODES.contractEnvelopeInvalid)
}
```

## Puertos

- **Implementa:** Defines every port: `ExecutorAdapter`, `ExecutorProvider`, `WorkspaceProvider`, `MemoryProvider`, `SandboxProvider`, `ToolProvider`, `ExecutionDriver`, `ExecutionRuntime`, `RunStore`, `ArtifactProvider`, `MethodPlugin`, projection targets.
- **Consume:** Nada.

## Errores

Es dueño de `BRAMBO_ERROR_CODES` y `SANDBOX_ERROR_CODES`. Consulte [Errores y sobres de resultado](../explanation/errors).

## Límites

- Los tipos por sí solos no demuestran nada: ejecute la suite correspondiente (`run*ContractSuite`).
- Los validadores indican las coordenadas dentro del mensaje, no en el `path` de Standard Schema.

## Véase también

- [Suites de contrato](../guides/contract-suites)
- [Errores y sobres de resultado](../explanation/errors)
