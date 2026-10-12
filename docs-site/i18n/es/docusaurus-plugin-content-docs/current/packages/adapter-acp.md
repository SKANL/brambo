---
title: adapter-acp
audience: Desarrolladores y mantenedores
prerequisites: Node.js >=20
outcome: Comprender el límite del adaptador ACP por stdio
scope: API pública del paquete
compatibility: Los paquetes publicados admiten Node.js >=20
translationStatus: translated
---
# @brambodev/adapter-acp

`@brambodev/adapter-acp` proporciona un cliente ACP v1 neutral respecto del proveedor para
JSON-RPC delimitado por líneas mediante la entrada y salida estándar de un proceso iniciado.
Expone inicialización, creación y carga de sesiones, envío de instrucciones, cancelación,
notificaciones de actualización y solicitudes de permisos sin elegir ni iniciar un agente ACP
específico.

El cliente limita el tamaño de cada trama, relaciona las respuestas con su identificador de
solicitud y rechaza las solicitudes pendientes cuando el proceso termina, informa un error,
produce JSON-RPC malformado o rechaza una escritura. Las solicitudes de permisos se deniegan de
forma predeterminada, salvo que el consumidor configure un controlador.

**Estado: congelado.** Este paquete es un cliente JSON-RPC por stdio para ACP v1, no un `ExecutorAdapter`; no tiene dependencia en tiempo de ejecución de `@brambodev/kernel`. No se planean funciones nuevas. Correcciones de protocolo posteriores a 0.5.0 (sin publicar): las solicitudes del servidor que el cliente no maneja se responden con el error JSON-RPC `-32601` (método no encontrado), los rechazos de permisos usan códigos de error enteros, `sessionCancel` se envía como notificación y se resuelve en `void`, y la comprobación del tamaño de trama se ejecuta en tiempo lineal, incluso con divisiones de caracteres multibyte.
