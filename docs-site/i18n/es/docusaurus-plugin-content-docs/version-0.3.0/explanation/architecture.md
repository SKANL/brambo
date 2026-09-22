---
title: Arquitectura
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Understand this documentation page
scope: This page
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# Arquitectura

brambo es un microkernel orientado al SDK. Mantiene las reglas estables de composición en paquetes pequeños y deja el comportamiento específico del vendor en seams tipados.

## El grafo descendente

```text
contracts
  ↓
registry → projection → environment
  ↓           ↓
lock        kernel
               ↓
workspace / memory / adapter-cli
               ↓
             session
               ↓
              cli
```

El grafo es una regla de dependencias, no solo un diagrama: los paquetes solo pueden depender de paquetes inferiores en la topología declarada. `@brambodev/kernel` no tiene dependencias de runtime y nunca importa `@brambodev/contracts` en runtime.

## Composición en runtime

Un host normalmente entra por `@brambodev/session`:

1. `readExecutorConfigLayers` lee las capas de configuración.
2. `createSessionKernel` monta los plugins de executor y workspace seleccionados.
3. `runSession` crea un lease de workspace y registra la ejecución del executor como una acción del kernel.
4. El adapter devuelve un `ResultEnvelope`; session libera el lease y detiene el kernel que creó.

Un kernel entregado por el caller sigue siendo responsabilidad del caller y `runSession` no lo detiene.

## Límites estables

| Límite | Responsabilidad |
| --- | --- |
| Registry | Skills y tools canónicos y con scope. |
| Projection | Vocabulario y ubicaciones nativas del executor, más ownership para revertir. |
| Kernel | Validación de plugins, configuración, servicios, acciones, registros y ciclo de vida. |
| Session | Composición de executor, workspace, policy, logging y ciclo de vida. |
| Contracts | Tipos públicos de ports, schemas, errores con código y suites de comportamiento. |

Adapters y providers son reemplazables porque el kernel consume sus contratos, no los internals del vendor. Un autor de ports puede instalar solo `@brambodev/contracts` y ejecutar las suites de clauses publicadas.

## Límites deliberadamente honestos

- Un `MethodPlugin` no es un sandbox.
- `ToolProvider` descubre tools; `ToolExecutor` ejecuta invocaciones explícitas mediante una sesión de sandbox propiedad del caller.
- Los adapters CLI actuales ejecutan procesos hijos ordinarios. El comportamiento relativo al workspace se mide por executor; el paquete de adapters no afirma aislamiento del sistema operativo.
- La información no disponible se representa como ausencia tipada, no como cero inventado ni como `null` sin contexto.

## Por dónde empezar

Usá `@brambodev/session` para un host SDK, `@brambodev/cli` solo para el binding de argv/JSON/códigos de salida del equipo, y `@brambodev/contracts` al crear un port de terceros.
