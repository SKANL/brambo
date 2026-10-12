---
title: sandbox
audience: Developers integrating @brambodev/sandbox
prerequisites: Node.js >=20
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/sandbox 0.5.x'
compatibility: Node.js >=20
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/sandbox

<Badge status="experimental">Experimental</Badge>

*Experimental: probado y utilizable, pero su superficie aún puede cambiar y tiene menos evidencia de plataforma o menos consumidores en el repositorio que los paquetes estables.*

Selección de sandbox neutral respecto al proveedor: dados unos `SandboxProvider` registrados y una política, `createSandboxProviderResolver` elige el primer proveedor cuya evidencia de capacidades demuestra cada control requerido y devuelve una sesión gestionada con eliminación idempotente y comprobaciones de política.

| | |
|---|---|
| Mundo | Mundo de sesión |
| Nivel de topología | 1 |
| Node.js | `>=20` |
| Depende de | [`contracts`](./contracts) |

## Instalación

```bash
npm install @brambodev/sandbox
```

## Ejemplo

```ts
import { createDefaultSandboxPolicy, validateSandboxPolicy } from '@brambodev/contracts'
import { createSandboxProviderResolver } from '@brambodev/sandbox'
import { createLocalSandboxProvider } from '@brambodev/sandbox-local'

const policy = validateSandboxPolicy({ ...createDefaultSandboxPolicy(process.cwd()), requiredCapabilities: { filesystem: 'full' } })
const resolver = createSandboxProviderResolver([await createLocalSandboxProvider()])
const session = await resolver.createSession({ policy, snapshots: [] })
try {
  console.log(await session.execute({ argv: ['git', 'status', '--short'], cwd: process.cwd(), environment: {}, policy }))
} finally {
  await session.dispose()
}
```

## Puertos

- **Implementa:** Session management over `SandboxProvider` (`ResolvedSandboxSession`).
- **Consume:** Uno o varios `SandboxProvider`.

## Errores

`BRAMBO_SANDBOX_UNAVAILABLE`, `BRAMBO_SANDBOX_CAPABILITY_UNAVAILABLE`, `BRAMBO_SANDBOX_REQUEST_INVALID`, `BRAMBO_SANDBOX_RESPONSE_INVALID`.

## Límites

- El aislamiento solo es tan fuerte como la evidencia del proveedor elegido.
- Una sesión cuyo proveedor lanzó un error pasa a ser incierta y no se puede reutilizar.

## Véase también

- [Herramientas y sandbox](../guides/tools-and-sandbox)
