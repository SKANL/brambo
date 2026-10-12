---
title: adapter-anthropic
audience: Developers integrating @brambodev/adapter-anthropic
prerequisites: Node.js >=20
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/adapter-anthropic 0.5.x'
compatibility: Node.js >=20
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/adapter-anthropic

<Badge status="experimental">Experimental</Badge>

*Experimental: probado y utilizable, pero su superficie aún puede cambiar y tiene menos evidencia de plataforma o menos consumidores en el repositorio que los paquetes estables.*

El `ExecutorProvider` oficial de la Messages API de Anthropic. `fetch` directo con un transporte inyectable, streaming SSE, un bucle local de herramientas controlado por el host y capacidades alojadas opcionales. Capacidades del manifiesto: streaming, herramientas locales, caché de prompts, razonamiento extendido, archivos del proveedor, MCP remoto y búsqueda web alojada (sin estado de conversación).

| | |
|---|---|
| Mundo | Mundo de sesión |
| Nivel de topología | 6 |
| Node.js | `>=20` |
| Depende de | [`adapter-api`](./adapter-api), [`contracts`](./contracts), [`kernel`](./kernel), [`session`](./session) |

## Instalación

```bash
npm install @brambodev/adapter-anthropic
```

## Ejemplo

```ts
import type { ExecutorSelection } from '@brambodev/contracts'
import { createExecutorRegistry } from '@brambodev/adapter-api'
import { createAnthropicProvider } from '@brambodev/adapter-anthropic'

const registry = createExecutorRegistry()
registry.register(createAnthropicProvider({ credential: () => process.env.ANTHROPIC_API_KEY ?? '' }))
const selection: ExecutorSelection = { providerId: 'anthropic', model: process.env.ANTHROPIC_MODEL ?? '', capabilities: ['streaming'], configuration: { stream: true, maxTokens: 256 } }
const adapter = registry.create(selection, { credential: undefined })
```

## Puertos

- **Implementa:** `ExecutorProvider` (id `anthropic`).
- **Consume:** Una credencial y un `transport` opcional del host; las primitivas de `adapter-api`.

## Errores

Los fallos de ejecución son sobres `failed` con un `providerError` normalizado (categoría, fase, estado); los problemas de construcción (endpoint no HTTPS, credencial ausente) lanzan `Error` simples.

## Límites

- Una solicitud por turno: sin reintento (`maxAttempts: 1`) ni tiempo de espera.
- El host suministra un identificador de modelo vigente; no hay valor predeterminado.
- Se rechazan los marcos SSE de más de 1.048.576 caracteres.
- Las capacidades alojadas se ejecutan en el proveedor, fuera de cualquier sandbox local.

## Véase también

- [Adaptador de la API de Anthropic](../guides/anthropic-api-adapter)
- [Seguridad de los adaptadores de API](../explanation/api-adapter-security)
