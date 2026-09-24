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
