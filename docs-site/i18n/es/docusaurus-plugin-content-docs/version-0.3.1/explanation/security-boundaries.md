---
title: Límites de seguridad
audience: Desarrolladores y mantenedores
prerequisites: Node.js >=20
outcome: Entender qué protege brambo y qué no afirma
scope: Límites públicos de seguridad
compatibility: Los paquetes publicados admiten Node.js >=20
translationStatus: translated
---
# Límites de seguridad

brambo protege límites de ownership, validación y ciclo de vida. No convierte un proceso ordinario del vendor en un sandbox del sistema operativo.

## Qué impone brambo

- La configuración rechaza ciclos y claves que contaminan prototipos, y congela snapshots.
- Los handles de workspace son leases de un solo uso; handles falsificados y double release son rechazos codificados.
- Las projections usan el ledger de ownership; el contenido del vendor sin ownership no se cambia en silencio.
- Los writes de memoria son append-only y llevan provenance de agent, workspace y timestamp.

## Qué no impone brambo

Los adapters CLI inician procesos hijos ordinarios. Usan el workspace como directorio de trabajo, pero no afirman containment del sistema operativo. Un executor puede acceder a paths absolutos cuando su proceso y configuración lo permiten.

```text
workspace root: directorio inicial del proceso hijo
OS sandbox: no lo provee el contrato del adapter CLI
vendor permissions: los controla el executor y su configuración
```

Un `MethodPlugin` no es un sandbox y descubrir un tool no autoriza su ejecución. `ToolExecutor` ejecuta una invocación explícita mediante una sesión de sandbox del caller.

## Checklist de integración segura

1. Tratá los paths del workspace como una pista, no una garantía de seguridad.
2. Mantén credenciales y permisos del vendor bajo controles del vendor.
3. Elegí ramas por `BramboError.code`, no por el mensaje.
4. Conservá registros de ownership al mover archivos proyectados.
5. Ejecutá la contract suite de cada provider o adapter.

## Reporte honesto

Si brambo no puede medir una capacidad del vendor, informa ausencia tipada. No infiere aislamiento o permisos desde un path o evento faltante.

## Siguiente paso

Lee [Compatibilidad](../reference/compatibility) para conocer los límites de procesos, workspaces y runtime.
