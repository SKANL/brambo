---
title: Troubleshooting
audience: Desarrolladores y mantenedores
prerequisites: Node.js >=20
outcome: Diagnosticar fallos de CLI, providers, configuración y packaging con evidencia
scope: Guía pública de troubleshooting
compatibility: Los paquetes publicados admiten Node.js >=20 salvo rangos medidos más estrechos
translationStatus: translated
---
# Troubleshooting

Empieza por el error codificado o el código de salida. Antes de cambiar la configuración o eliminar estado, reúne la versión del paquete, la versión de Node.js, la plataforma, el comando o capa de configuración y el error codificado completo. Corrige el límite indicado, no archivos del vendor a mano.

Para cada síntoma, compara el código y el entorno observados con la causa probable y aplica la acción reversible más pequeña. Conserva el estado de workspaces y memoria hasta confirmar los requisitos de ownership y retención.

## El CLI no encontró el executor

Usá `claude-code`, `codex` u `opencode`. Revisá `--executor` y la layer resuelta. El binario vendor también debe instalarse y autenticarse por separado.

## Hay configuración inutilizable

Inspeccioná `~/.brambo/config.json` y `<project>/.brambo/config.json`. Confirmá JSON legible y `executor` string. Un archivo malformado no se trata como ausente.

```bash
brambo run --executor codex "health check"
```

El flag puede sobrescribir un valor legible; no repara un documento ilegible.

## Un provider rechaza después de dispose

El ciclo de vida tiene ownership. No uses providers después de `dispose()` ni liberes handles mediante uno disposed. Crea un provider para la siguiente session.

## Un memory store no abre

Revisá la versión de formato. Las versiones no soportadas se rechazan, no se migran. Confirmá el path y elegí un build compatible o un store nuevo según retención.

## Funciona en el repositorio pero no en consumer

Ejecutá `pnpm build` y la prueba de consumer-install. Verificá exports a `dist`, declarations en el tarball y ausencia de dependencia en `brambo-source`.

## El workspace no está aislado

Es esperable en el límite del adapter. brambo no afirma containment del sistema operativo. Restringe permisos y usa un sandbox del OS si hace falta.

## Siguiente paso

Si difiere del contract, ejecuta la clause suite correspondiente y reporta la violación con versión y environment.
