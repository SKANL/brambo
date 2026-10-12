---
title: kernel
audience: Developers integrating @brambodev/kernel
prerequisites: Node.js >=20
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/kernel 0.5.x'
compatibility: Node.js >=20
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/kernel

<Badge status="stable">Estable</Badge>

*Estable: cubierto por sus pruebas (y por su suite de contrato cuando el puerto la tiene) y ejercitado por la ruta de sesión o de CLI de brambo. brambo es anterior a 1.0, por lo que siguen siendo posibles cambios incompatibles, que se señalan en el registro de cambios.* [Criterios de estado](../reference/package-status).

El kernel de plugins sin dependencias: manifiestos, un grafo de servicios con consumo `hard` y `soft`, arranque, parada y sustitución ordenados, un bus de eventos con ámbito, configuración por capas, un pipeline de acciones con límites de presupuesto, un flujo de registros secuenciado y las primitivas de supervisión de sesiones y permisos neutrales respecto a ACP. Nunca importa `@brambodev/contracts`.

| | |
|---|---|
| Mundo | Núcleo |
| Nivel de topología | 0 |
| Node.js | `>=20` |
| Depende de | ninguno |

## Instalación

```bash
npm install @brambodev/kernel
```

## Ejemplo

```ts
import { createActionPipeline, createMemoryLogSink } from '@brambodev/kernel'

const log = createMemoryLogSink()
const pipeline = createActionPipeline(log, { maxInvocations: 1 })
const action = pipeline.register({ id: 'demo.add', cost: 1, run: () => 1 + 1 })

console.log(await action.invoke()) // 2
await action.invoke().catch((error) => console.log(error.code)) // BRAMBO_KERNEL_INVOCATION_CAP_EXCEEDED
```

## Puertos

- **Implementa:** The plugin host itself (`createKernel`).
- **Consume:** Los plugins que se registren.

## Errores

Códigos `BRAMBO_KERNEL_*` mediante subclases de `BramboKernelError` (`KERNEL_ERROR_CODES`).

## Límites

- Un kernel ejecuta un único ciclo de arranque y parada; no se puede reiniciar.
- Sin transportes, almacenes, tiempos de espera ni reintentos.
- Los límites de presupuesto rechazan antes de una ejecución; no detienen una ejecución en curso.

## Véase también

- [El kernel](../explanation/kernel)
- [Contratos del kernel](../guides/kernel-contracts)
