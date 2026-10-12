---
title: sandbox-local
audience: Developers integrating @brambodev/sandbox-local
prerequisites: Node.js >=20
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/sandbox-local 0.5.x'
compatibility: Node.js >=20
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/sandbox-local

<Badge status="experimental">Experimental</Badge>

*Experimental: probado y utilizable, pero su superficie aún puede cambiar y tiene menos evidencia de plataforma o menos consumidores en el repositorio que los paquetes estables.*

Un `SandboxProvider` local conservador que solo afirma lo que puede demostrar en esta máquina: Linux usa bubblewrap tras una prueba funcional (más cgroup v2 y `prlimit` para los límites), macOS usa un perfil Seatbelt con evidencia solo del sistema de archivos y Windows delega en un `brambo-windows-sandbox-broker` externo. Los controles no demostrados se informan como `none`.

| | |
|---|---|
| Mundo | Mundo de sesión |
| Nivel de topología | 1 |
| Node.js | `>=20` |
| Depende de | [`contracts`](./contracts) |

## Instalación

```bash
npm install @brambodev/sandbox-local
```

## Ejemplo

```ts
import { createLocalSandboxProvider } from '@brambodev/sandbox-local'

const provider = await createLocalSandboxProvider()
console.log(provider.id, provider.capabilities.enforcement, provider.capabilities.controls)
```

## Puertos

- **Implementa:** `SandboxProvider` (`local-linux`, `local-macos`, `local-windows`).
- **Consume:** `bwrap`, `sandbox-exec` o el broker de Windows cuando existen.

## Errores

Los resultados usan `SANDBOX_ERROR_CODES` (`BRAMBO_SANDBOX_TIMED_OUT`, `_ABORTED`, `_UNAVAILABLE`, `_COMMAND_DENIED`, `_RUNNER_FAILED`); la creación de la sesión lanza `BRAMBO_SANDBOX_CAPABILITY_UNAVAILABLE` para un modo de red no demostrable. Las plataformas no soportadas lanzan un `Error` simple.

## Límites

- En Linux, los controles de procesos y recursos informan `none`; en Windows, los recursos son `partial`; por eso `createDefaultSandboxPolicy` no se puede satisfacer tal cual.
- La red `allowlist` no está implementada.
- Tiempo real predeterminado de 5 minutos; salida limitada a 1 MiB por flujo; se eliminan las variables de entorno que parecen secretos.
- La conformidad en hosts Linux, macOS y Windows no se afirma como ejecutada en CI.

## Véase también

- [Herramientas y sandbox](../guides/tools-and-sandbox)
- [Fronteras de seguridad](../explanation/security-boundaries)
