---
title: provenance
audience: Developers integrating @brambodev/provenance
prerequisites: Node.js >=20
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/provenance 0.5.x'
compatibility: Node.js >=20
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/provenance

<Badge status="experimental">Experimental</Badge>

*Experimental: probado y utilizable, pero su superficie aún puede cambiar y tiene menos evidencia de plataforma o menos consumidores en el repositorio que los paquetes estables.* [Criterios de estado](../reference/package-status).

Recibos e informes de revisión ligados al contenido: hashes SHA-256 de un objetivo canónico (referencia base más resúmenes de rutas), de eventos de sesión y de delegaciones; recibos `allow`/`deny` con un almacén JSONL; y una regla de entrega en la que solo bloquean los hallazgos bloqueantes causados por el cambio o de causalidad desconocida.

| | |
|---|---|
| Mundo | De soporte |
| Nivel de topología | 1 |
| Node.js | `>=20` |
| Depende de | [`contracts`](./contracts) |

## Instalación

```bash
npm install @brambodev/provenance
```

## Ejemplo

```ts
import { createJsonlReviewReceiptStore, createReceipt, hashTarget } from '@brambodev/provenance'

const target = { baseRef: 'main', paths: [{ path: 'src/index.ts', mode: '100644', sha256: 'a'.repeat(64) }] }
const receipt = createReceipt(target, 'allow')
console.log(receipt.targetHash === hashTarget(target))
await createJsonlReviewReceiptStore('./receipts.jsonl').save(receipt)
```

## Puertos

- **Implementa:** Receipt and report primitives; `ReviewReceiptStore`.
- **Consume:** Eventos de sesión y registros de delegación (para calcular su hash).

## Errores

`BRAMBO_PROVENANCE_INVALID`.

## Límites

- Registra y valida; no ejecuta ningún revisor.
- Un hallazgo bloqueante con causalidad `unknown` bloquea la entrega.

## Véase también

- [Principios de diseño](../explanation/principles)
