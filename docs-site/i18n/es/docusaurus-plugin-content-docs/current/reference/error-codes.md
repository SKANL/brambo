---
title: Códigos de error
audience: Developers handling brambo failures
prerequisites: Node.js >=20
outcome: Consultar cualquier código BRAMBO_*, qué lo lanza y qué significa
scope: Todos los errores con código, códigos de resultado y motivos de ausencia de 0.5.x
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# Códigos de error

Decida según estos códigos, nunca según el texto de los mensajes. `BRAMBO_ERROR_CODES` de `@brambodev/contracts` contiene todos los códigos de las seis primeras secciones salvo los códigos de resultado del sandbox, que están en `SANDBOX_ERROR_CODES`; los errores del kernel llevan las mismas cadenas. Para el modelo de errores, lea [Errores y sobres de resultado](../explanation/errors).

## Kernel

Los lanza `@brambodev/kernel` como subclases de `BramboKernelError` y se reflejan en `BRAMBO_ERROR_CODES`.

| Código | Significado |
|---|---|
| `BRAMBO_KERNEL_MANIFEST_INVALID` | Un manifiesto de plugin no superó la validación; se enumeran todos los problemas. |
| `BRAMBO_KERNEL_CYCLE_DETECTED` | Las dependencias `hard` entre plugins forman un ciclo. |
| `BRAMBO_KERNEL_SERVICE_NOT_PROVIDED` | Un servicio consumido como `hard` no tiene proveedor. |
| `BRAMBO_KERNEL_SERVICE_CONFLICT` | Dos plugins proveen el mismo servicio. |
| `BRAMBO_KERNEL_PLUGIN_INACTIVE` | El plugin o el kernel está inactivo o ya se detuvo. |
| `BRAMBO_KERNEL_PLUGIN_START_FAILED` | La fábrica de un plugin lanzó un error, lo rechazó o no proveyó lo que declaró. |
| `BRAMBO_KERNEL_SWAP_REJECTED` | Un candidato de sustitución no se activó; la implementación anterior sigue sirviendo. |
| `BRAMBO_KERNEL_REEMIT_DURING_FANOUT` | Un manejador de eventos emitió de forma síncrona durante la difusión. |
| `BRAMBO_KERNEL_INVALID_SCOPE` | Un ámbito del bus de eventos no es `global`, `project` ni `agent`. |
| `BRAMBO_KERNEL_INVALID_LAYER` | Una capa o clave de configuración no es válida. |
| `BRAMBO_KERNEL_LOG_RECORD_INVALID` | Una entrada de registro queda fuera de la forma cerrada de los registros. |
| `BRAMBO_KERNEL_ACTION_INVALID` | Una definición de acción o una política de presupuesto no es válida (por ejemplo, un límite `NaN`). |
| `BRAMBO_KERNEL_ACTION_DENIED` | El guard de una acción rechazó la invocación. |
| `BRAMBO_KERNEL_INVOCATION_CAP_EXCEEDED` | Se alcanzó `maxInvocations`; la acción no se ejecutó. |
| `BRAMBO_KERNEL_COST_CAP_EXCEEDED` | Se alcanzó `maxTotalCost`; la acción no se ejecutó. |
| `BRAMBO_KERNEL_CONCURRENCY_CAP_EXCEEDED` | Se alcanzó `maxConcurrent`; la acción no se ejecutó. |
| `BRAMBO_KERNEL_STAGE_FAILED` | Una etapa `pre`, `guard` o `around` lanzó un error. |
| `BRAMBO_KERNEL_SETTLEMENT_INVALID` | Una cifra de conciliación no era utilizable; se registra sin lanzarse y se mantiene la estimación. |
| `BRAMBO_KERNEL_SETTLEMENT_IN_PROGRESS` | Se admitió una acción mientras una conciliación seguía en curso. |

## Contratos

Los lanzan los validadores de contratos y las implementaciones de puertos.

| Código | Significado |
|---|---|
| `BRAMBO_CONTRACT_ENVELOPE_INVALID` | Un valor no superó la validación del contrato (sobre, solicitud, instantánea, lease, opciones). |
| `BRAMBO_CONTRACT_WORKFLOW_PROTOCOL_INVALID` | Una solicitud o respuesta del protocolo de flujos está mal formada. |
| `BRAMBO_CONTRACT_LEASE_SCOPE_INVALID` | Un lease válido no cubre la tarea o el espacio de trabajo solicitados. |
| `BRAMBO_CONTRACT_WORKSPACE_UNKNOWN_ID` | El proveedor no conoce ese identificador de espacio de trabajo. |
| `BRAMBO_CONTRACT_WORKSPACE_INVALID_HANDLE` | El handle no lo emitió este proveedor, o las opciones no son válidas. |
| `BRAMBO_CONTRACT_WORKSPACE_DOUBLE_RELEASE` | El lease ya se había liberado. |
| `BRAMBO_CONTRACT_WORKSPACE_UNAVAILABLE` | Falló el medio del espacio de trabajo (E/S, git). |
| `BRAMBO_CONTRACT_WORKSPACE_REMOVAL_REFUSED` | brambo se negó a borrar trabajo que no existe en ningún otro lugar. |
| `BRAMBO_CONTRACT_WORKSPACE_CONTENTION` | Otro proceso tiene el registro o la intención de eliminación del espacio de trabajo. |
| `BRAMBO_CONTRACT_PROVIDER_DISPOSED` | Una operación llegó a un proveedor ya desechado. |
| `BRAMBO_CONTRACT_MEMORY_SAVE_INVALID` | Un guardado de memoria tiene una carga que no es texto o una procedencia incompleta. |
| `BRAMBO_CONTRACT_MEMORY_UNKNOWN_ENTRY` | `supersedes` nombra una entrada que el almacén no tiene. |
| `BRAMBO_CONTRACT_MEMORY_OVERWRITE_UNSUPPORTED` | La memoria es de solo adición; `overwrite` siempre se rechaza. |
| `BRAMBO_CONTRACT_MEMORY_STORE_VERSION_MISMATCH` | El almacén tiene otra versión de formato; se rechaza y nunca se migra. |
| `BRAMBO_CONTRACT_MEMORY_STORE_UNAVAILABLE` | No se pudo abrir ni escribir el almacén de memoria. |

## Executors

Los lanzan la selección de executors, los adaptadores de CLI y el registro de proveedores de API. Los adaptadores de CLI ponen los tres primeros en los `errors` del sobre en lugar de lanzarlos.

| Código | Significado |
|---|---|
| `BRAMBO_EXECUTOR_UNAVAILABLE` | No se pudo lanzar el binario del executor. |
| `BRAMBO_EXECUTOR_RUN_FAILED` | El executor se ejecutó y falló, o no produjo resultado. |
| `BRAMBO_EXECUTOR_CANCELLED` | La ejecución se canceló. |
| `BRAMBO_EXECUTOR_NOT_FOUND` | Ningún adaptador incluido tiene ese identificador de executor. |
| `BRAMBO_EXECUTOR_PROVIDER_MANIFEST_INVALID` | El manifiesto de un `ExecutorProvider` no es válido. |
| `BRAMBO_EXECUTOR_PROVIDER_SELECTION_INVALID` | Una selección de proveedor o su configuración no superó la validación. |
| `BRAMBO_EXECUTOR_PROVIDER_USAGE_OBSERVATION_INVALID` | Un proveedor informó una observación de uso mal formada. |
| `BRAMBO_EXECUTOR_PROVIDER_ERROR_INVALID` | Un error de proveedor normalizado no cumple el contrato. |
| `BRAMBO_EXECUTOR_PROVIDER_UNKNOWN` | Ningún proveedor registrado tiene ese identificador. |
| `BRAMBO_EXECUTOR_PROVIDER_DUPLICATE_REGISTRATION` | Ya hay un proveedor registrado con ese identificador. |

## Sandbox y herramientas

Los códigos de validación se lanzan; los `SANDBOX_ERROR_CODES` aparecen en los resultados de ejecución.

| Código | Significado |
|---|---|
| `BRAMBO_SANDBOX_POLICY_INVALID` | Una política de sandbox no es válida (por ejemplo, `danger-full-access` sin `allowDangerous`). |
| `BRAMBO_SANDBOX_REQUEST_INVALID` | Una solicitud de ejecución no es válida o no coincide con la política de la sesión. |
| `BRAMBO_SANDBOX_RESPONSE_INVALID` | Una respuesta del proveedor está mal formada o pertenece a otra sesión. |
| `BRAMBO_SANDBOX_SNAPSHOT_INVALID` | Una instantánea no es válida. |
| `BRAMBO_SANDBOX_CAPABILITY_UNAVAILABLE` | Ningún proveedor demuestra todos los controles requeridos. |
| `BRAMBO_SANDBOX_UNAVAILABLE` | Sin proveedor, sin ejecutor, una sesión fallida o una limpieza incierta. También es un código de resultado. |
| `BRAMBO_SANDBOX_DENIED` | El autorizador del host o `approveTool` denegó la llamada a la herramienta. |
| `BRAMBO_SANDBOX_COMMAND_DENIED` | Código de resultado: el proveedor rechazó el comando. |
| `BRAMBO_SANDBOX_RUNNER_FAILED` | Código de resultado: falló el ejecutor. |
| `BRAMBO_SANDBOX_TIMED_OUT` | Código de resultado (lanzado por stdio, instantánea, restauración y destrucción remotas): se agotó el tiempo real. |
| `BRAMBO_SANDBOX_ABORTED` | Código de resultado: la señal abortó la ejecución. |
| `BRAMBO_TOOL_INVOCATION_INVALID` | La declaración de una herramienta o sus argumentos no son ejecutables. |

## Configuración, métodos y orquestación

| Código | Significado |
|---|---|
| `BRAMBO_CONFIGURATION_UNUSABLE` | El documento de configuración de brambo existe pero no se puede usar. Un documento ausente no es este error. |
| `BRAMBO_METHOD_INVALID_PLUGIN` | Un plugin de método no superó la validación. |
| `BRAMBO_METHOD_HOOK_FAILED` | Un hook de activación o desactivación de un método lanzó un error. |
| `BRAMBO_ORCHESTRATION_INVALID` | Un grafo de tareas, una delegación o una configuración de ejecución no es válida. |
| `BRAMBO_PROVENANCE_INVALID` | Un recibo o informe de revisión no es válido o no coincide con su objetivo. |

## Mundo de entorno

| Código | Significado |
|---|---|
| `BRAMBO_LOCK_CONTENTION` | Expiró la espera acotada por un archivo de bloqueo. |
| `BRAMBO_LOCK_UNAVAILABLE` | Falló el medio del archivo de bloqueo. |
| `BRAMBO_REGISTRY_INVALID_ENTRY` | Una entrada del registro no es válida para su tipo. |
| `BRAMBO_REGISTRY_CONTENTION` | Otro escritor tiene el bloqueo del registro. |
| `BRAMBO_REGISTRY_STORE_UNAVAILABLE` | El almacén del registro no se puede leer ni escribir, o es irreconocible. |
| `BRAMBO_REGISTRY_STORE_VERSION_MISMATCH` | El almacén del registro lo escribió una versión más nueva de brambo. |
| `BRAMBO_REGISTRY_INACTIVE` | El plugin del registro no está activo. |
| `BRAMBO_REGISTRY_PROVIDER_REJECTED` | Se rechazó un origen de ingesta. |
| `BRAMBO_REGISTRY_ORIGIN_CONFLICT` | Una entrada entra en conflicto con otra de otro origen. |
| `BRAMBO_REGISTRY_BUNDLE_UNAVAILABLE` | Un paquete no se puede leer, escribir ni interpretar. |
| `BRAMBO_PROJECTION_NATIVE_MALFORMED` | Un archivo de configuración del proveedor está mal formado. |
| `BRAMBO_PROJECTION_TARGET_FAILED` | Falló un destino de proyección; los demás continúan. |
| `BRAMBO_PROJECTION_TRAITS_INVALID` | Los rasgos de un destino de proyección no son válidos. |
| `BRAMBO_PROJECTION_LEDGER_UNAVAILABLE` | No se puede leer ni escribir el registro de propiedad. |
| `BRAMBO_PROJECTION_LEDGER_CONTENTION` | Otro escritor tiene el bloqueo del registro de propiedad. |
| `BRAMBO_PROJECTION_NATIVE_UNCLAIMABLE` | No se puede reclamar una ubicación nativa. |
| `BRAMBO_PROJECTION_MODE_INVALID` | El modo de proyección no es `apply` ni `inspect`; nunca se asume un valor. |
| `BRAMBO_PROJECTION_REMEDIATION_REFUSED` | brambo rechazó una remediación; nada falló. Se devuelve, no se lanza. |
| `BRAMBO_ENVIRONMENT_SCOPE_UNAVAILABLE` | Un directorio personal o de proyecto está vacío o no se puede usar. |

## Almacén durable

Los lanza `@brambodev/workflow-store-sqlite` como `WorkflowStoreError`; no forman parte de `BRAMBO_ERROR_CODES`.

| Código | Significado |
|---|---|
| `BRAMBO_WORKFLOW_STORE_UNAVAILABLE` | Node.js anterior a 24.15.0, o no se puede abrir la base de datos. |
| `BRAMBO_WORKFLOW_STORE_BUSY` | Otro escritor retuvo la base de datos más allá de la espera acotada de 100 ms. |
| `BRAMBO_WORKFLOW_SCHEMA_UNSUPPORTED` | La base de datos no tiene la versión de esquema 1. |
| `BRAMBO_WORKFLOW_STORE_INVALID` | Entrada inválida, como una ruta vacía o demasiados eventos en una confirmación. |

## Motivos de ausencia de uso

No son errores: `USAGE_ABSENCE_REASONS` explican por qué no hay cifra de uso.

| Código | Significado |
|---|---|
| `BRAMBO_USAGE_NO_SURFACE` | El executor no publica ninguna superficie de uso. |
| `BRAMBO_USAGE_NOT_OBSERVED` | brambo aún no ha observado el uso de este executor. |
| `BRAMBO_USAGE_NOT_REPORTED` | La ejecución no informó ninguna cifra de uso. |
