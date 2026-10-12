---
title: adapter-api
audience: Developers integrating @brambodev/adapter-api
prerequisites: Node.js >=20
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/adapter-api 0.5.x'
compatibility: Node.js >=20
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/adapter-api

<Badge status="experimental">Experimental</Badge>

*Experimental: probado y utilizable, pero su superficie aún puede cambiar y tiene menos evidencia de plataforma o menos consumidores en el repositorio que los paquetes estables.*

Piezas neutrales respecto al transporte para executors de API: un `ExecutorRegistry` explícito, descubrimiento opcional con lista de permitidos, `executeWithRetry`, un bucle local de herramientas acotado que dirige cada llamada por el `executeTool` del host, flujos de eventos SSE, normalización y redacción de errores, autorización de capacidades remotas y la suite de conformidad de proveedores en `@brambodev/adapter-api/testing`.

| | |
|---|---|
| Mundo | Mundo de sesión |
| Nivel de topología | 5 |
| Node.js | `>=20` |
| Depende de | [`contracts`](./contracts), [`session`](./session) |

## Instalación

```bash
npm install @brambodev/adapter-api
```

## Ejemplo

```ts
import type { ExecutorSelection } from '@brambodev/contracts'
import { createExecutorRegistry } from '@brambodev/adapter-api'
import { createAnthropicProvider } from '@brambodev/adapter-anthropic'
import { createOpenAIProvider } from '@brambodev/adapter-openai'

const registry = createExecutorRegistry()
registry.register(createOpenAIProvider({ credential: () => process.env.OPENAI_API_KEY ?? '' }))
registry.register(createAnthropicProvider({ credential: () => process.env.ANTHROPIC_API_KEY ?? '' }))
console.log(registry.list().map((manifest) => manifest.id)) // ['openai', 'anthropic']

const selection: ExecutorSelection = { providerId: 'anthropic', model: process.env.ANTHROPIC_MODEL ?? '' }
const adapter = registry.create(selection, { credential: undefined })
```

## Puertos

- **Implementa:** `ExecutorRegistry`; an API `DriverFactory` (`createApiDriverFactory`) for durable runs.
- **Consume:** Las instancias de `ExecutorProvider` que se registren; `executeTool` de `@brambodev/session` para herramientas locales.

## Errores

`BRAMBO_EXECUTOR_PROVIDER_*` (manifiesto, selección, desconocido, registro duplicado); los rechazos del bucle de herramientas y de las capacidades remotas son `Error` simples.

## Límites

- Un identificador de proveedor selecciona un proveedor registrado; nunca importa un paquete.
- `executeWithRetry` solo reintenta fallos `rate-limit`, `timeout` y `unavailable` demostrablemente no aceptados; los proveedores oficiales lo llaman con `maxAttempts: 1`.
- El bucle de herramientas nunca reintenta una herramienta y no tiene continuación ilimitada implícita.
- El argumento de opciones de `registry.create` tiene un tipo que incluye `selection`, por lo que quien llama desde TypeScript la pasa dos veces.

## Véase también

- [Executors de API](../guides/api-executors)
- [Escribir un ExecutorProvider](../guides/third-party-executor-providers)
