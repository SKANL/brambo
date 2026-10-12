---
title: Solución de problemas
audience: Developers and operators debugging brambo
prerequisites: None
outcome: Relacionar un síntoma o un código con su causa probable y la corrección segura más pequeña
scope: Fallos habituales del SDK y la CLI de 0.5.x
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# Solución de problemas

Empiece por el error con código, el estado del sobre o el código de salida. Antes de cambiar la configuración o borrar estado, reúna la versión del paquete, la versión de Node.js, la plataforma, la capa de configuración que decidió la selección y el error con código completo. Corrija la frontera que nombra el código en lugar de editar a mano los archivos del proveedor, y conserve el estado de los espacios de trabajo y de la memoria hasta aclarar la propiedad y la retención. Todos los códigos figuran en [Códigos de error](./error-codes).

## No se encontró el executor

`BRAMBO_EXECUTOR_NOT_FOUND`: use `claude-code`, `codex` u `opencode` y compruebe la clave `executor` en la capa de configuración resuelta. Un error `BRAMBO_EXECUTOR_UNAVAILABLE` en el sobre significa que el identificador era válido pero no se pudo lanzar el binario: instale la CLI del proveedor e inicie sesión, o pase su ruta como `adapterOptions.command`.

## La configuración se informa como inutilizable

`BRAMBO_CONFIGURATION_UNUSABLE`: revise `~/.brambo/config.json` y `<project>/.brambo/config.json`. Cada uno debe ser JSON legible con un `executor` de tipo texto. Un archivo existente mal formado nunca se trata como ausente.

```bash
brambo run --executor codex "health check"
```

Una selección explícita puede sustituir un valor legible; no repara un documento que brambo no puede leer.

## Una ejecución nunca termina

brambo no fija tiempos de espera. Conecte `onInterrupt` a un plazo propio; consulte [Cancelación, tiempos de espera y reintentos](../guides/cancellation-timeouts-retries). Una ejecución cancelada resuelve un sobre `cancelled` después de terminar el árbol de procesos.

## Se rechazó una sesión antes de iniciar el executor

`BRAMBO_KERNEL_*_CAP_EXCEEDED`: se alcanzó un límite de presupuesto en un kernel compartido. Los límites de coste se comparan con la cifra de tokens que informaron las ejecuciones anteriores. Aumente el límite, construya un kernel nuevo o deténgase.

## Se rechazaron opciones junto a un kernel

`BRAMBO_CONTRACT_ENVELOPE_INVALID` mencionando `configLayers`, `executorId`, `createProvider` u opciones similares: un `kernel` suministrado es dueño de ellas. Configúrelas en `createSessionKernel`.

## Un proveedor rechaza operaciones tras su eliminación

`BRAMBO_CONTRACT_PROVIDER_DISPOSED`: los proveedores tienen un ciclo de vida con dueño. `runSession` desecha lo que devuelve `createProvider`, así que devuelva un proveedor nuevo en cada llamada.

## No se puede eliminar un espacio de trabajo

`BRAMBO_CONTRACT_WORKSPACE_REMOVAL_REFUSED`: el worktree tiene cambios sin confirmar o su commit HEAD no está contenido en ninguna referencia. Confirme o publique el trabajo, o elimínelo usted mismo con git. brambo nunca elimina directorios sin registro de propiedad.

## No se puede crear el sandbox

`BRAMBO_SANDBOX_CAPABILITY_UNAVAILABLE`: ningún proveedor registrado demuestra todos los controles requeridos. `createDefaultSandboxPolicy` exige aplicación completa de procesos y recursos, que ningún proveedor local incluido demuestra; exija solo los controles que necesita. En Linux, compruebe que `bwrap` está instalado y funciona para su usuario.

## El almacén durable no abre o está ocupado

`BRAMBO_WORKFLOW_STORE_UNAVAILABLE`: use Node.js >=24.15.0 y compruebe la ruta de la base de datos. `BRAMBO_WORKFLOW_STORE_BUSY`: otro escritor retuvo la base de datos más allá de la espera de 100 ms; reintente la operación. `BRAMBO_WORKFLOW_SCHEMA_UNSUPPORTED`: el archivo no lo creó esta versión de esquema.

## Una tarea durable está bloqueada

Un error de checkpoint `uncertain-attempt-recovery` significa que el motor encontró un intento que no puede demostrar que sea seguro repetir. Revise los eventos de la tarea y los efectos externos y después decida; brambo no adivina. `task-lease-contended` significa que otro dueño tiene la tarea o su espacio de trabajo.

## Un almacén de memoria no abre

`BRAMBO_CONTRACT_MEMORY_STORE_VERSION_MISMATCH`: el almacén tiene otra versión de formato; se rechaza y no se migra. Use una versión compatible o un almacén nuevo según su política de retención.

## Un paquete funciona en el repositorio pero no en un consumidor

Ejecute `pnpm build` y la prueba de instalación del consumidor. Compruebe que los exports apuntan a `dist`, que el tarball contiene las declaraciones y que el consumidor no depende de la condición `brambo-source`.

## El espacio de trabajo no está aislado

Es lo esperado: brambo no afirma contención del sistema operativo. Restrinja los permisos del proveedor y ejecute dentro de un sandbox del sistema operativo, un contenedor o una máquina virtual cuando su despliegue lo requiera.

## Próximo paso

Si el comportamiento sigue sin coincidir con el contrato, ejecute la [suite de contrato](../guides/contract-suites) correspondiente e informe de la infracción nombrada junto con la versión del paquete y el entorno.
