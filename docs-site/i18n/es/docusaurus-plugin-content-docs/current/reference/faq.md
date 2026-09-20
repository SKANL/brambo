---
title: Preguntas frecuentes
audience: Desarrolladores y mantenedores
prerequisites: Node.js >=20
outcome: Resolver preguntas comunes sobre los límites públicos de brambo
scope: Preguntas frecuentes
compatibility: Los paquetes publicados admiten Node.js >=20 salvo rangos medidos más estrechos
translationStatus: translated
---
# Preguntas frecuentes

## ¿brambo es un sandbox del sistema operativo?

No. Los adapters CLI ejecutan procesos hijos ordinarios; el contrato no incluye aislamiento del sistema operativo.

## ¿brambo instala Claude Code, Codex u OpenCode?

No. Los executors vendor se instalan y autentican por separado.

## ¿Se puede sobrescribir memoria?

No. Es append-only. Agregá una entrada con `supersedes`; la anterior sigue siendo legible.

## ¿Por qué usage faltante no aparece como cero?

Cero es una medición. brambo informa ausencia tipada si no hay superficie de usage o aún no hubo observación.

## ¿Qué versión de Node uso?

Node.js `>=24` para el repositorio y cobertura desde `>=20` para paquetes publicados; features opcionales pueden ser más estrechas.

## ¿Por qué no hubo fallback al default?

Una layer faltante está ausente, pero un documento existente inválido es un error. El fallback silencioso ejecutaría otro executor.

## ¿Por dónde empiezo?

Usá `@brambo/session` para SDK, `@brambo/cli` para argv/JSON/exit codes y `@brambo/contracts` para un port.
