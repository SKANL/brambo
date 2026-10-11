---
title: "@brambodev/workflow-remote"
audience: Integradores del SDK
prerequisites: Node.js >=20
outcome: Componer un workflow durable propio
scope: Referencia pública del paquete
compatibility: Node.js >=20
translationStatus: translated
---

# @brambodev/workflow-remote

Endpoint/fetch/encabezados vigentes inyectados; sin cuenta, escritor alternativo ni repetición automática de mutaciones. Namespace/owner no autentican. La reproducción avanza nextCursor, no latestCursor; el desbordamiento requiere instantánea autoritativa. Las lecturas verifican digests y tamaños.

## Superficie pública

- `createRemoteRunStore`
- `createRemoteArtifactProvider`
- `replayRun`

## Evidencia y límites

Las pruebas sintéticas locales demuestran comportamiento acotado de puertos, no un servicio Brambo, despliegue externo, aislamiento ni durabilidad distribuida. La instalación empaquetada, Windows/Linux alojados e instalación congelada siguen pendientes; importar fuentes no prueba artefactos publicados.

## Siguiente paso

Use la receta de composición verificada por tipos en [remote-orchestration](../guides/remote-orchestration.md).
