---
title: Errores y envelopes de resultado
audience: Desarrolladores y mantenedores
prerequisites: Node.js >=20
outcome: Manejar fallos de brambo sin parsear mensajes
scope: Manejo público de errores
compatibility: Los paquetes publicados admiten Node.js >=20
translationStatus: translated
---
# Errores y envelopes de resultado

Usá el código o estado como señal para máquinas. Los mensajes explican el fallo a las personas; no son una API estable de routing.

## Dos superficies de fallo

Una ejecución de session devuelve un `ResultEnvelope` con `status` `ok`, `failed` o `cancelled`; los dos últimos tienen un array `errors` no vacío. Los fallos de environment y configuración lanzan `BramboError`.

```ts
import { BRAMBO_ERROR_CODES, BramboError } from '@skanl/brambo-contracts'

try {
  await startHost()
} catch (error) {
  if (error instanceof BramboError && error.code === BRAMBO_ERROR_CODES.configurationUnusable) {
    console.error('Repará el documento de configuración antes de reintentar')
  }
  throw error
}
```

## Tabla de routing

| Señal | Significado | Acción |
| --- | --- | --- |
| `status: ok` | Envelope exitoso del executor. | Consumí `data` y `summary`. |
| `status: failed` | Fallo del executor o adapter. | Inspeccioná `errors`; no reintentes a ciegas. |
| `status: cancelled` | El caller o timeout detuvo la ejecución. | Liberá recursos propios. |
| `BramboError.code` | brambo rechazó un input u operación. | Elegí por código y corregí ese límite. |

## Errores codificados frecuentes

- `BRAMBO_EXECUTOR_NOT_FOUND`: no hay adapter para el id.
- `BRAMBO_CONFIGURATION_UNUSABLE`: una configuración existente no se puede usar.
- `BRAMBO_CONTRACT_PROVIDER_DISPOSED`: la operación llegó a un provider disposed.
- `BRAMBO_CONTRACT_WORKSPACE_UNKNOWN_ID`: el provider no conoce el id.
- `BRAMBO_CONTRACT_MEMORY_STORE_VERSION_MISMATCH`: el formato persistido no es compatible.

El catálogo completo está exportado por `@skanl/brambo-contracts`.

## Exit codes del CLI

Para `run`, `0` significa envelope `ok`, `1` significa `failed` o `cancelled`, y `2` significa fallo de uso, request, configuración o environment.

## Siguiente paso

Lee [Troubleshooting](../reference/troubleshooting) cuando el código apunte a configuración, providers o packaging.
