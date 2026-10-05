---
title: "@brambodev/workspace-artifacts-local"
audience: Integradores del SDK
prerequisites: Node.js >=20
outcome: Componer un workflow durable propio
scope: Referencia pública del paquete
compatibility: Node.js >=20
translationStatus: translated
---

# @brambodev/workspace-artifacts-local

Revisiones SHA-256 inmutables y copias independientes con RunStore inyectado. Publicar requiere una concesión del espacio; el padre confirma progreso por separado. Los datos sin referencia no son progreso. Los directorios antecesores deben ser confiables; las comprobaciones portables no aíslan a procesos hostiles del mismo usuario.

## Superficie pública

- `createLocalArtifactProvider`

## Evidencia y límites

Las pruebas sintéticas locales demuestran comportamiento acotado de puertos, no un servicio Brambo, despliegue externo, aislamiento ni durabilidad distribuida. La instalación empaquetada, Windows/Linux alojados e instalación congelada siguen pendientes; importar fuentes no prueba artefactos publicados.

## Siguiente paso

Use la receta de composición verificada por tipos en [durable-orchestration](../guides/durable-orchestration.md).
