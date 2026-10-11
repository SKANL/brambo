---
title: "@brambodev/workflow-coordinator"
audience: Integradores del SDK
prerequisites: Node.js >=20
outcome: Componer un workflow durable propio
scope: Referencia pública del paquete
compatibility: Node.js >=20
translationStatus: translated
---

# @brambodev/workflow-coordinator

RequestListener autenticado por el host y trabajador iniciado explícitamente. Son obligatorias autenticación/autorización y elegibilidad de trabajador. El plano de control no ejecuta herramientas; el host opera TLS/servidor/almacenamiento/retención/supervisión. Cada runtime hijo usa un store nuevo de runtimeForTask y se autoriza al actor del recibo inicial.

## Superficie pública

- `createWorkflowCoordinator`
- `createWorkflowWorker`

## Evidencia y límites

Las pruebas sintéticas locales demuestran comportamiento acotado de puertos, no un servicio Brambo, despliegue externo, aislamiento ni durabilidad distribuida. La instalación empaquetada, Windows/Linux alojados e instalación congelada siguen pendientes; importar fuentes no prueba artefactos publicados.

## Siguiente paso

Use la receta de composición verificada por tipos en [remote-orchestration](../guides/remote-orchestration.md).
