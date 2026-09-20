---
title: sandbox-local
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Ejecutar comandos mediante un proveedor local conservador
scope: Esta página
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# @brambo/sandbox-local

`@brambo/sandbox-local` ofrece proveedores locales específicos para Linux, macOS y Windows. Sondean un mecanismo de enforcement utilizable y fallan de forma cerrada cuando no pueden probar la política solicitada.

## Ruta rápida

```ts
import { createLocalSandboxProvider } from '@brambo/sandbox-local'

const provider = await createLocalSandboxProvider()
const session = await provider.createSession({ policy, snapshots: [] })

try {
  const result = await session.execute({
    argv: ['node', 'script.mjs'],
    cwd: policy.workspaceRoot,
    environment: {},
    policy,
  })
  console.log(result.status)
} finally {
  await session.dispose()
}
```

Pasa `platform` solo en tests deterministas. En uso normal, la fábrica decide a partir de `process.platform`.

## Backends por plataforma

| Plataforma | Mecanismo verificado | Limitación cuando no está disponible |
| --- | --- | --- |
| Linux | Sonda funcional de bubblewrap; `prlimit` opcional para límites de tamaño y cgroup v2 opcional para recursos. | Sin bubblewrap, los modos seguros no tienen backend verificado. Los límites de recursos se rechazan si no se prueban los controladores o el containment de inicio. |
| macOS | Sonda funcional de `sandbox-exec` Seatbelt. | Los modos seguros no están disponibles si la sonda funcional de Seatbelt falla. |
| Windows | Sonda de versión de `brambo-windows-sandbox-broker` y self-test de aislamiento. | El proveedor devuelve `unavailable` tipado y no ejecuta un hijo sin containment cuando falta el broker. |

Los tests de `test/host-conformance/` son opt-in con `BRAMBO_RUN_SANDBOX_CONFORMANCE=1` y solo se ejecutan en su plataforma correspondiente. No prueban que todos los hosts hayan pasado la matriz.

## Salvaguardas comunes

- El hijo se inicia con `shell: false` y el vector exacto entregado por el caller.
- El directorio de trabajo físico debe probarse dentro de la raíz física del workspace; los escapes por symlink o junction se rechazan antes de crear el proceso.
- Se eliminan nombres de variables de entorno sensibles y no se usa el `PATH` aportado por la ejecución para buscar wrappers.
- Timeout, cancelación, límites de salida y teardown producen resultados tipados.
- Se exige un backend verificado para los modos seguros. `danger-full-access` es un modo reconocido explícitamente, no aislamiento del sistema operativo.
- En `danger-full-access`, un callback de auditoría inyectado puede recibir eventos validados `execution-started` y `execution-completed`. La entrega es best effort y no cambia la ejecución.

## Límites de recursos y cgroups

La implementación Linux escribe límites en cgroup v2 y adjunta el hijo después de que `spawn()` devuelve. Como esa implementación directa no puede contener la ventana de inicio previa a la ejecución, rechaza ejecuciones limitadas en memoria, procesos o CPU cuando no existe containment de startup. Si falla el attach, termina el hijo cuando puede; una sesión con resultado incierto de teardown o attach no se considera sana.

## Límite honesto

Este paquete expone evidencia de capacidades locales; descubrir un ejecutable no se convierte en evidencia de enforcement. Un helper ausente, una sonda funcional fallida, un límite no soportado o un modo de red no soportado producen un error codificado de disponibilidad/capacidad en vez de una ruta más débil.
