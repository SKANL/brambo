---
title: "@brambodev/runtime-local"
audience: Integradores del SDK
prerequisites: Node.js >=20
outcome: Componer un workflow durable propio
scope: Referencia pública del paquete
compatibility: Node.js >=20
translationStatus: translated
---

# @brambodev/runtime-local

Materialización privada y renovación de concesión hija para un driver inyectado. Resolver la promesa es una devolución confiable, no prueba de terminación del sistema operativo. Un driver que no termina conserva su espacio privado. El host proporciona aislamiento y limpieza.

## Superficie pública

- `createLocalExecutionRuntime`
- `createLeaseRenewalController`

## Evidencia y límites

Las pruebas sintéticas locales demuestran comportamiento acotado de puertos, no un servicio Brambo, despliegue externo, aislamiento ni durabilidad distribuida. La instalación empaquetada, Windows/Linux alojados e instalación congelada siguen pendientes; importar fuentes no prueba artefactos publicados.

## Siguiente paso

Use la receta de composición verificada por tipos en [remote-orchestration](../guides/remote-orchestration.md).
