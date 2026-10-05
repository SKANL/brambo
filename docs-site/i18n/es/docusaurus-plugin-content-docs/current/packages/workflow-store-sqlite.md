---
title: "@brambodev/workflow-store-sqlite"
audience: Integradores del SDK
prerequisites: Node.js >=24.15.0
outcome: Componer un workflow durable propio
scope: Referencia pública del paquete
compatibility: Node.js >=24.15.0
translationStatus: translated
---

# @brambodev/workflow-store-sqlite

Implementación opcional de RunStore neutral en un único host autoritativo local. Las transacciones conservan estado/eventos/recibos al reabrir; claim/renew/release/valid verifican recursos exactos, propietario, token, caducidad y épocas monotónicas. Importación diferida y runtimes no compatibles devuelven BRAMBO_WORKFLOW_STORE_UNAVAILABLE. Sin promesa de SQLite distribuido/montaje compartido/conmutación.

## Superficie pública

- `openSqliteRunStore`
- `WorkflowStoreError`

## Evidencia y límites

Las pruebas sintéticas locales demuestran comportamiento acotado de puertos, no un servicio Brambo, despliegue externo, aislamiento ni durabilidad distribuida. La instalación empaquetada, Windows/Linux alojados e instalación congelada siguen pendientes; importar fuentes no prueba artefactos publicados.

## Siguiente paso

Use la receta de composición verificada por tipos en [durable-orchestration](../guides/durable-orchestration.md).
