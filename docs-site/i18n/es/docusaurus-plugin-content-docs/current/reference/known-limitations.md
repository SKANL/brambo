---
title: Limitaciones conocidas
audience: Developers evaluating or operating brambo
prerequisites: None
outcome: Conocer en un solo lugar cada límite documentado de 0.5.x antes de depender de él
scope: Límites del SDK 0.5.x, expresados como lo que hace brambo y lo que hace su host
compatibility: brambo 0.5.x
translationStatus: translated
---
# Limitaciones conocidas

Cada límite de esta página también figura en la página de la funcionalidad que acota. Aquí se reúnen para poder revisarlos de una vez. Cada uno se expresa como lo que hace brambo y lo que sigue siendo tarea de su host.

## Aislamiento y permisos

| brambo hace | Su host hace |
|---|---|
| Ejecuta los executors de CLI como procesos hijo normales en el directorio del espacio de trabajo. | Proporciona el aislamiento (cuenta del sistema, contenedor, máquina virtual). brambo no es un sandbox. |
| Lanza `claude-code` con `--dangerously-skip-permissions`, porque una ejecución sin interfaz no tiene aprobador. | Decide si esa postura es aceptable y confina el proceso. |
| Valida las políticas de sandbox frente a la evidencia del proveedor y falla de forma cerrada. | Elige un proveedor y una plataforma que puedan demostrar los controles que necesita. |
| Informa con honestidad la evidencia de `sandbox-local`: en Linux, controles de procesos y recursos `none`; en macOS, solo sistema de archivos; en Windows, solo con un broker externo. | Relaja `requiredCapabilities` hasta lo que acepta, o suministra otro proveedor. |
| No incluye ningún protocolo de sandbox remoto. | Implementa el `RemoteSandboxTransport`. |

La conformidad opcional del sandbox en hosts reales solo se ejecuta en Linux y macOS, y solo cuando se lanza manualmente; la conformidad en hosts Windows no se ejecuta en CI.

## Tiempo, cancelación y reintentos

| brambo hace | Su host hace |
|---|---|
| No fija plazos para las ejecuciones de executors, las solicitudes de API ni los comandos git. | Fija plazos y cancela mediante `onInterrupt` o la señal de la solicitud. |
| Hace un intento por solicitud de API (`maxAttempts: 1`); nunca reintenta ejecuciones de CLI ni herramientas. | Reintenta solo el trabajo que sabe idempotente. |
| Rechaza las ejecuciones antes de empezar cuando se alcanza un límite de presupuesto. | Detiene una ejecución en curso con su propio plazo. |

## Persistencia y limpieza

| brambo hace | Su host hace |
|---|---|
| Deja los directorios de los espacios de trabajo en disco tras una sesión. | Los elimina con los ayudantes de eliminación según su propio calendario. |
| No persiste ninguna transcripción de una ejecución. | Captura `envelope.data`, los eventos del flujo o un `eventLog` si necesita un registro. |
| Nunca purga eventos durables, recibos ni artefactos preparados huérfanos. | Decide la retención, las copias de seguridad y la limpieza de huérfanos. |
| Rechaza los almacenes con otra versión de formato en lugar de migrarlos. | Instala una versión al menos tan nueva como los datos. |

## Mundo durable

| brambo hace | Su host hace |
|---|---|
| Garantiza confirmaciones con fencing y comprobación CAS en un único host SQLite autoritativo. | Evita montajes de red compartidos, clústeres y conmutación por error, o implementa otro `RunStore`. |
| Requiere Node.js >=24.15.0 para el almacén SQLite. | Ejecuta ese paquete con un Node.js compatible. |
| Reproduce los efectos completados y bloquea los inciertos. | Impone exactamente una vez en los sistemas externos y decide qué hacer con las tareas `blocked`. |
| Incluye un manejador de solicitudes del coordinador sin TLS, sin escucha y sin autenticación. | Proporciona TLS, identidad, política de autorización, despliegue y supervisión de workers. |

Varios fallos durables (precondiciones del motor, rechazos de importación, límites de artefactos, errores del cliente remoto) son instancias simples de `Error` sin código.

## Mundo de sesión

- `runSession` no tiene opción `signal`; la cancelación es `onInterrupt`.
- Suministrar `sandboxProvider` o `toolExecutor` a `runSession` configura la interfaz de herramientas, pero no dirige por ella las herramientas propias de un executor de CLI.
- Los límites de coste se comparan con la cifra de tokens que informó el executor tras cada ejecución, y las ejecuciones se admiten con un coste fijo de 1, por lo que los límites saltan en la ejecución siguiente a la que los superó. Una sola sesión no ejercita de forma significativa `maxConcurrent`.
- `ExecutorRegistry.create` tipa su argumento de opciones de modo que incluye `selection`, por lo que quien llama desde TypeScript pasa la selección dos veces.

## Paquetes de alcance limitado

- `memory-filesystem` y `memory-sqlite` superan su suite de contrato, pero no tienen consumidores dentro de brambo; `runSession` nunca lee ni escribe memoria. `memory-sqlite` solo se ha medido en Node.js 24.14.1 y 26.8.1.
- `delegation` es un ciclo de vida mínimo sin reintentos, planificación ni listados.
- `adapter-acp` está congelado y no es un `ExecutorAdapter`.

## Publicación y evidencia

- Los paquetes se publican sin atestaciones de procedencia de npm; consulte [Afirmaciones y evidencia](./claims-and-evidence).
- brambo es anterior a 1.0. Son posibles cambios incompatibles, que se registran en el registro de cambios.
- Esta documentación describe 0.5.x y se construye desde `main`; todavía no hay una instantánea congelada de 0.5.x.
