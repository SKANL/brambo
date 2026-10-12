---
title: Preguntas frecuentes
audience: Developers evaluating or adopting brambo
prerequisites: None
outcome: Obtener respuestas breves y fundamentadas a las primeras preguntas habituales
scope: Preguntas frecuentes sobre el SDK 0.5.x
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# Preguntas frecuentes

## ¿brambo es un sandbox del sistema operativo?

No. Los adaptadores de CLI ejecutan procesos hijo normales con sus privilegios; Claude Code se lanza con sus confirmaciones de permisos desactivadas. El aislamiento proviene del entorno donde se ejecuta brambo y de un proveedor de sandbox que pueda demostrar sus controles. Consulte [Fronteras de seguridad](../explanation/security-boundaries).

## ¿Necesito la CLI para usar brambo?

No. El producto es el SDK; `@brambodev/session` hace todo lo que hace `brambo run` excepto el análisis de argumentos, la salida JSON y los códigos de salida. La CLI es un binding delgado documentado en el [apéndice de la CLI](../how-to/run-cli).

## ¿brambo instala Claude Code, Codex u OpenCode?

No. Los executors de los proveedores se instalan y autentican por separado. Para modelos alojados, use los proveedores de API de OpenAI o Anthropic con una credencial que inyecte su host.

## ¿Cómo cancelo una ejecución o le pongo un plazo?

Pase `onInterrupt` a `runSession` y conéctelo a su propio `AbortSignal`; `runSession` no tiene opción `signal` y no fija tiempos de espera. Consulte [Cancelación, tiempos de espera y reintentos](../guides/cancellation-timeouts-retries).

## ¿brambo reintenta las ejecuciones fallidas?

No. Las ejecuciones de CLI nunca se reintentan y los proveedores de API oficiales hacen un intento por solicitud. El motor durable reintenta una tarea solo cuando su diario de efectos demuestra que el intento fue seguro.

## ¿Dónde se crean los espacios de trabajo y quién los borra?

Por defecto, en `<cwd>/.brambo/workspaces`. Nunca se borran automáticamente; use `removeLocalWorkspace` o `removeWorktree`, que solo eliminan directorios de los que brambo tiene un registro de propiedad.

## ¿Se puede sobrescribir una entrada de memoria?

No. La memoria es de solo adición. Añada una entrada nueva con `supersedes`; la anterior sigue siendo legible. Tenga en cuenta que ningún paquete de brambo consume todavía los proveedores de memoria; es su host quien los conecta.

## ¿Por qué el uso ausente no aparece como cero?

Cero es una medición. brambo informa una ausencia tipada (`BRAMBO_USAGE_NO_SURFACE`, `BRAMBO_USAGE_NOT_OBSERVED`) cuando un executor no tiene superficie de uso o brambo no la ha observado.

## ¿Qué versión de Node debo usar?

Los paquetes publicados admiten Node.js `>=20`, salvo `@brambodev/workflow-store-sqlite`, que necesita `>=24.15.0`. El desarrollo del repositorio necesita Node.js `>=24`. Consulte [Compatibilidad](./compatibility).

## ¿Por qué la configuración no volvió al valor predeterminado?

Una capa ausente se trata como ausente, pero un documento existente ilegible o inválido es `BRAMBO_CONFIGURATION_UNUSABLE`. Volver al valor predeterminado en silencio ejecutaría un executor distinto del que eligió el documento.

## ¿Puedo ejecutar flujos durables en varias máquinas?

Sí, mediante `workflow-coordinator` y `workflow-remote`, con un único almacén autoritativo detrás del coordinador. El almacén SQLite es para un solo host; no se afirma soporte para montajes de red compartidos ni clústeres.

## ¿Por dónde empiezo?

[Su primera sesión](../tutorials/first-session) para integrar, [Su primer flujo durable](../tutorials/durable-workflow) para orquestar y [Escribir un ExecutorProvider](../guides/third-party-executor-providers) para extender.
