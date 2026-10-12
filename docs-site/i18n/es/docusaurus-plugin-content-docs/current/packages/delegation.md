---
title: delegation
audience: Developers integrating @brambodev/delegation
prerequisites: Node.js >=20
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/delegation 0.5.x'
compatibility: Node.js >=20
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/delegation

<Badge status="experimental">Experimental</Badge>

*Experimental: probado y utilizable, pero su superficie aún puede cambiar y tiene menos evidencia de plataforma o menos consumidores en el repositorio que los paquetes estables.*

Un ciclo de vida de delegación mínimo: `createDelegationRegistry` ejecuta un manejador para una solicitud con identificador único y la registra como `running` y después `succeeded`, `failed` o `cancelled`, persistiendo opcionalmente instantáneas en un almacén de estado JSONL.

| | |
|---|---|
| Mundo | De soporte |
| Nivel de topología | 1 |
| Node.js | `>=20` |
| Depende de | [`contracts`](./contracts) |

## Instalación

```bash
npm install @brambodev/delegation
```

## Ejemplo

```ts
import { createDelegationRegistry, createJsonlDelegationStateStore } from '@brambodev/delegation'

const registry = createDelegationRegistry<string, number>({ stateStore: createJsonlDelegationStateStore('./delegations.jsonl') })
const record = await registry.delegate({ id: 'count-words', input: 'one two three' }, {
  execute: async (request) => request.input.split(' ').length,
})
console.log(record.status, record)
```

## Puertos

- **Implementa:** `DelegationRegistry`, `DelegationStateStore` (JSONL).
- **Consume:** Un `DelegationHandler` que usted suministra.

## Errores

`BRAMBO_ORCHESTRATION_INVALID` para un identificador vacío o duplicado; una línea JSONL corrupta lanza un `Error` simple.

## Límites

- Sin reintentos, planificación ni listados.
- El almacén JSONL añade una instantánea completa en cada guardado.
- Los fallos del manejador se capturan en el registro, no se lanzan.

## Véase también

- [Compatibilidad](../reference/compatibility)
