---
title: "@brambodev/provenance"
audience: Mantenedores y hosts que aplican controles de entrega
prerequisites: Node.js >=20 y una instantánea de contenido con rutas y modos de archivos
outcome: Vincular una decisión de revisión con un objetivo de contenido exacto y validarla después
scope: Referencia del paquete para recibos de revisión y hashes de evidencia vinculados al contenido
compatibility: Los paquetes publicados admiten Node.js >=20
translationStatus: translated
---

# @brambodev/provenance

`@brambodev/provenance` crea y valida recibos que vinculan un resultado allow/deny con un objetivo de contenido. Úselo para detectar si las rutas, modos, evidencia de eventos o evidencia de delegación revisadas ya no coinciden; registra evidencia, pero no realiza la revisión.

## Ejemplo mínimo

Describa la referencia base y cada ruta revisada con su modo y SHA-256; luego cree un recibo y valídelo contra el objetivo actual.

```ts
import { createReceipt, validateReceipt } from '@brambodev/provenance'

const target = {
  baseRef: 'main',
  paths: [{ path: 'src/example.ts', mode: '100644', sha256: 'a'.repeat(64) }],
}
const receipt = createReceipt(target, 'allow')
validateReceipt(receipt, target)
```

## API pública

- `createReceipt()` y `validateReceipt()` crean y verifican recibos vinculados al contenido.
- `validateReviewGate()` valida un recibo allow existente en una instancia de control de entrega; nunca inicia una revisión.
- `hashTarget()`, `hashSessionEvents()` y `hashDelegations()` generan hashes SHA-256 deterministas de evidencia.
- `createJsonlReviewReceiptStore(path)` agrega recibos y carga el registro más reciente.
- `validateReviewReport()` y `reviewReportAllowsDelivery()` validan informes de revisión estructurados.
- Su única dependencia de paquete en tiempo de ejecución es `@brambodev/contracts`.

## Puntos de extensión y límites

El llamador debe proporcionar la instantánea exacta del objetivo y cualquier registro de eventos o delegaciones usado como evidencia. Las rutas del objetivo deben ser únicas e incluir hashes y modos válidos; las secuencias de eventos deben ser contiguas y los IDs de delegación, únicos. Un recibo demuestra que la evidencia suministrada coincide con el objetivo suministrado; no demuestra que la revisión haya sido de calidad, no autoriza una publicación por sí solo y no reemplaza el ciclo de revisión del repositorio. Los controles de entrega requieren un recibo allow.

## Guías relacionadas

- Conocé cómo brambo presenta [afirmaciones y evidencia](../reference/claims-and-evidence.md).
- Consulte la [referencia de la API pública](../reference/api.md).
