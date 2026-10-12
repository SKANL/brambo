---
title: Suites de contrato
audience: Port authors and provider authors
prerequisites: Node.js >=20
outcome: Demostrar una implementación de puerto con las suites de cláusulas publicadas y leer el informe
scope: Suites de contrato exportadas por @brambodev/contracts y @brambodev/adapter-api/testing en 0.5.x
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# Suites de contrato

Implementar la interfaz TypeScript de un puerto hace que su código compile; no lo hace correcto. Cada puerto de brambo incluye una suite ejecutable de cláusulas con nombre que ejercita el comportamiento que el tipo no puede expresar: cancelación, códigos de rechazo, eliminación idempotente, fencing. Las implementaciones incluidas ejecutan las mismas suites en CI, de modo que superar una pone su implementación al mismo nivel.

## Suites disponibles

| Ejecutor | Sujeto | Las cláusulas comprueban |
|---|---|---|
| `runExecutorContractSuite(adapter, options?)` | `ExecutorAdapter` | Esquema de la solicitud, `run` asíncrono, forma del sobre, completitud de `ok` y de los fallos, la cancelación produce `cancelled` |
| `runWorkspaceContractSuite(provider, options?)` | `WorkspaceProvider` | Handles válidos, ida y vuelta de `acquire`, rechazo de identificadores desconocidos y no textuales, rechazo de handles falsificados y doble liberación, el estado sobrevive entre sesiones, eliminación idempotente que conserva el estado, el proveedor eliminado rechaza operaciones |
| `runMemoryContractSuite(harness, options?)` | `MemoryContractHarness` (`providerName`, `provider`, `reopen`, `openDivergentFormatVersion`) | Almacén vacío tipado, procedencia literal, sin fugas entre espacios de trabajo, sobrescritura rechazada, la sustitución añade, línea temporal determinista, el estado sobrevive a la reapertura, formato divergente rechazado, eliminación |
| `runToolProviderContractSuite(provider, options?)` | `ToolProvider` | Identificador de origen no vacío, un `list()` que devuelve un arreglo, solo entradas válidas de servidores MCP |
| `runDriverContractSuite(driver, request, options?)` | `ExecutionDriver` y una `DriverRequest` | Conformidad del manifiesto, conformidad del resultado, cancelación |
| `runWorkflowStoreContractSuite(harness, options?)` | `WorkflowStoreHarness` (`open`, `reopen`, `advance`) | Autenticidad del lease, reapertura confirmada, admisión, lecturas con ámbito, confirmación atómica y fencing, ciclo de vida del lease |
| `defineExecutorProviderConformance(subject)` de `@brambodev/adapter-api/testing` | `ExecutorProvider` más fixtures | Escenarios de Vitest; consulte [Escribir un ExecutorProvider](./third-party-executor-providers) |

Todos los ejecutores salvo la conformidad de proveedores son funciones asíncronas simples exportadas por `@brambodev/contracts`; no necesitan un framework de pruebas. Cada cláusula tiene un presupuesto de tiempo (`timeoutMs`, 30 s por defecto); una cláusula que lo agota se informa como la infracción con nombre `<clause> (timeout)`. También se exportan los arreglos de cláusulas (`EXECUTOR_CLAUSES`, `WORKSPACE_CLAUSES`, ...) y los nombres de las suites (`EXECUTOR_SUITE`, ...).

## Ejecutar una suite y leer el informe

Este adaptador parece correcto, pero ignora un aborto que llega después de empezar:

```ts
import { runExecutorContractSuite } from '@brambodev/contracts'
import type { ExecutorAdapter, ResultEnvelope, RunRequest } from '@brambodev/contracts'

const adapter: ExecutorAdapter = {
  async run(request: RunRequest): Promise<ResultEnvelope> {
    if (request.signal?.aborted) return { status: 'cancelled', data: null, summary: 'cancelled', errors: [{ message: 'aborted' }] }
    return { status: 'ok', data: { prompt: request.prompt }, summary: 'done' }
  },
}

const report = await runExecutorContractSuite(adapter, { timeoutMs: 5_000 })
console.log(report.suite, report.passed)
for (const violation of report.violations) console.log(violation)
```

La suite nombra la cláusula rota:

```text
executor-adapter false
{
  clause: 'cancel-yields-cancelled-envelope',
  detail: "adapter resolved status 'ok' after cancellation instead of 'cancelled'"
}
```

Escuchar el aborto mientras el trabajo está en curso lo corrige:

```ts
import { runExecutorContractSuite } from '@brambodev/contracts'
import type { ExecutorAdapter, ResultEnvelope, RunRequest } from '@brambodev/contracts'

const adapter: ExecutorAdapter = {
  async run(request: RunRequest): Promise<ResultEnvelope> {
    const work = new Promise<string>((resolve) => setTimeout(() => resolve('done'), 10))
    const aborted = new Promise<'aborted'>((resolve) => {
      if (request.signal?.aborted) resolve('aborted')
      request.signal?.addEventListener('abort', () => resolve('aborted'), { once: true })
    })
    const outcome = await Promise.race([work, aborted])
    if (outcome === 'aborted') return { status: 'cancelled', data: null, summary: 'cancelled', errors: [{ message: 'aborted by host' }] }
    return { status: 'ok', data: { prompt: request.prompt }, summary: outcome }
  },
}

const report = await runExecutorContractSuite(adapter, { timeoutMs: 5_000 })
console.log(report.suite, report.passed, report.clauses.length) // executor-adapter true 6
```

Ambos programas se ejecutaron contra el código fuente de 0.5.x al redactar esta página.

Un `SuiteReport` tiene `suite`, `clauses` (nombres en orden), `passed`, `outcomes` (por cláusula: `clause`, `passed`, `detail?`, `durationMs`) y `violations` (`clause`, `detail`). Un puerto implementado a medias falla nombrando **cada** cláusula infringida, no solo la primera.

## Usar una suite en CI

Los ejecutores devuelven un informe en lugar de lanzar excepciones, así que conéctelos con el ejecutor de pruebas que use:

```ts
import { expect, it } from 'vitest'
import { runWorkspaceContractSuite } from '@brambodev/contracts'
import { createMyWorkspaceProvider } from '../src/index.ts'

it('satisfies the workspace contract', async () => {
  const report = await runWorkspaceContractSuite(createMyWorkspaceProvider())
  expect(report.violations).toEqual([])
})
```

Las suites que modifican almacenamiento (memoria, almacén de flujos) reciben un harness para poder abrir almacenamiento nuevo y reabrirlo. Apúntelas a almacenamiento desechable, nunca a una base de datos en uso, y dé al harness del almacén de flujos un reloj inyectable (`advance(ms)`) para que la caducidad de los leases sea determinista.

## Qué significa superar una suite

Superar una suite es evidencia de comportamiento acotada a las cláusulas que enumera y a la plataforma donde se ejecutó. No certifica durabilidad distribuida, aislamiento del sistema operativo ni rendimiento. Vuelva a ejecutarla cada vez que cambie su implementación o sus dependencias.

## Próximo paso

Escriba un proveedor en [Escribir un ExecutorProvider](./third-party-executor-providers), un proveedor de espacios de trabajo en [Usar un proveedor de espacios de trabajo](../how-to/use-workspace-provider) o un almacén según la [semántica durable](../reference/durable-semantics).
