---
title: Troubleshooting
audience: Desarrolladores y mantenedores
prerequisites: Node.js >=20
outcome: Diagnosticar fallos comunes del CLI, providers y packaging
scope: Guía pública de troubleshooting
compatibility: Los paquetes publicados admiten Node.js >=20 salvo rangos medidos más estrechos
translationStatus: translated
---
# Troubleshooting

Empezá por el error codificado o exit status. Corregí el límite nombrado, no archivos del vendor a mano.

## El CLI no encontró el executor

Usá `claude-code`, `codex` u `opencode`. Revisá `--executor` y la layer resuelta. El binario vendor también debe instalarse y autenticarse por separado.

## Hay configuración inutilizable

Inspeccioná `~/.panda/config.json` y `<project>/.panda/config.json`. Confirmá JSON legible y `executor` string. Un archivo malformado no se trata como ausente.

```bash
panda run --executor codex "health check"
```

El flag puede sobrescribir un valor legible; no repara un documento ilegible.

## Un provider rechaza después de dispose

El ciclo de vida tiene ownership. No uses providers después de `dispose()` ni liberes handles mediante uno disposed. Creá un provider para la siguiente session.

## Un memory store no abre

Revisá la versión de formato. Las versiones no soportadas se rechazan, no se migran. Confirmá el path y elegí un build compatible o un store nuevo según retención.

## Funciona en el repositorio pero no en consumer

Ejecutá `pnpm build` y la prueba de consumer-install. Verificá exports a `dist`, declarations en el tarball y ausencia de dependencia en `panda-source`.

## El workspace no está aislado

Es esperable en el límite del adapter. panda no afirma containment del sistema operativo. Restringí permisos y usá un sandbox del OS si hace falta.

## Siguiente paso

Si difiere del contract, ejecutá la clause suite correspondiente y reportá la violación con versión y environment.
