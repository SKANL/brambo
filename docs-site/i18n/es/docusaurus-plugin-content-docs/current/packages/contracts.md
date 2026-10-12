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

*Estable: cubierto por sus pruebas (y por su suite de contrato cuando el puerto la tiene) y ejercitado por la ruta de sesión o de CLI de brambo. brambo es anterior a 1.0, por lo que siguen siendo posibles cambios incompatibles, que se señalan en el registro de cambios.* [Criterios de estado](../reference/package-status).

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

Es dueño de `BRAMBO_ERROR_CODES` y `SANDBOX_ERROR_CODES`. Consulte [Códigos de error](../reference/error-codes).

## Límites

- Los tipos por sí solos no demuestran nada: ejecute la suite correspondiente (`run*ContractSuite`).
- Los validadores indican las coordenadas dentro del mensaje, no en el `path` de Standard Schema.

## Cómo funciona

**La instalación solo de contratos está demostrada.** Una prueba de CI empaqueta este tarball, lo instala solo en un proyecto fuera del repositorio, compila un `WorkspaceProvider` contra las declaraciones distribuidas y ejecuta la suite de espacios de trabajo publicada desde el archivo; una dependencia de ejecución filtrada la hace fallar.

| Puerto | Interfaz | Cláusulas y ejecutor |
|---|---|---|
| Espacio de trabajo | `WorkspaceProvider` | `WORKSPACE_CLAUSES`, `runWorkspaceContractSuite` |
| Memoria | `MemoryProvider` | `MEMORY_CLAUSES`, `runMemoryContractSuite` |
| Executor | `ExecutorAdapter` | `EXECUTOR_CLAUSES`, `runExecutorContractSuite` |
| Descubrimiento de herramientas | `ToolProvider` | `TOOL_PROVIDER_CLAUSES`, `runToolProviderContractSuite` |

**El modelo de arrendamiento del espacio de trabajo.** Un handle es un arrendamiento, no una ruta. `create()` emite uno y `acquire(id)` devuelve uno para un id existente. Dos handles vivos para un mismo espacio de trabajo son válidos; liberar dos veces el mismo handle produce `BRAMBO_CONTRACT_WORKSPACE_DOUBLE_RELEASE`, y un handle que el proveedor no emitió debe rechazarse (cláusulas `release-forged-handle-rejected` y `double-release-rejected`). Después de `dispose()`, toda operación produce `BRAMBO_CONTRACT_PROVIDER_DISPOSED`; `dispose()` es idempotente y no destruye estado duradero. Un id desconocido o que no es cadena produce `BRAMBO_CONTRACT_WORKSPACE_UNKNOWN_ID`, porque el puerto es accesible desde JavaScript sin tipos.

**Detectar la degradación silenciosa de tipos.** Mientras conecta el paquete, mantenga una línea `// @ts-expect-error` sobre `const wrong: WorkspaceHandle = { id: 'x', rootPath: '/x', capabilities: ['execute'] }`. Si las declaraciones no se resolvieran, la importación se degradaría a `any`, la directiva quedaría sin uso y `tsc` lo informaría.

**Contratos de sandbox y herramientas.** `SandboxPolicy.networkMode` es `deny`, `allowlist` o `unrestricted`; una política sin ese campo se normaliza a `deny`, y un proveedor debe rechazar un modo que no puede demostrar. La evidencia de capacidades se comprueba antes de crear una sesión y de nuevo contra cada resultado de ejecución. Las instantáneas son solo de archivos: los metadatos de directorios y el estado de procesos nunca se restauran, y una identidad de instantánea desconocida falla de forma cerrada. `ToolExecutor` copia `tool.argv` exactamente y agrega los argumentos como elementos separados, sin cadena de shell ni callback; `ToolProvider` solo descubre y no concede autoridad de ejecución. `danger-full-access` exige un reconocimiento explícito y puede emitir eventos de auditoría validados `execution-started` y `execution-completed`, que aportan visibilidad, no aislamiento.

**Puntos de entrada y la condición `brambo-source`.** La exportación raíz incluye los tipos de puertos, los esquemas, `BramboError`, `BRAMBO_ERROR_CODES`, los validadores y los ejecutores de suites; `@brambodev/contracts/validation` publica el ayudante compartido de forma de registros. La condición `brambo-source` del manifiesto apunta a `./src/index.ts`, que el tarball no incluye; solo es accesible con `node --conditions=brambo-source`, así que los consumidores resuelven `dist`.

## Véase también

- [Suites de contrato](../guides/contract-suites)
- [Errores y sobres de resultado](../explanation/errors)
