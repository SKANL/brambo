---
title: sandbox-remote
audience: Developers integrating @brambodev/sandbox-remote
prerequisites: Node.js >=20
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/sandbox-remote 0.5.x'
compatibility: Node.js >=20
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/sandbox-remote

<Badge status="experimental">Experimental</Badge>

*Experimental: probado y utilizable, pero su superficie aún puede cambiar y tiene menos evidencia de plataforma o menos consumidores en el repositorio que los paquetes estables.*

Un adaptador `SandboxProvider` para un servicio de sandbox remoto que usted opera. Usted inyecta el transporte (`createSession`, `execute`, `destroy` y, de forma opcional, stdio, instantánea y restauración); el paquete valida cada respuesta frente a la identidad y la política de la sesión y puede acotar cada operación con un tiempo de espera de vigilancia.

| | |
|---|---|
| Mundo | Mundo de sesión |
| Nivel de topología | 1 |
| Node.js | `>=20` |
| Depende de | [`contracts`](./contracts) |

## Instalación

```bash
npm install @brambodev/sandbox-remote
```

## Ejemplo

```ts
import { createRemoteSandboxProvider, type RemoteSandboxTransport } from '@brambodev/sandbox-remote'

declare const transport: RemoteSandboxTransport // your client for your remote service
const provider = createRemoteSandboxProvider({
  id: 'acme-remote',
  capabilities: {
    version: 1, providerId: 'acme-remote', enforcement: 'remote',
    controls: { filesystem: 'full', network: 'full', process: 'full', resources: 'partial' },
  },
  transport,
  timeoutMs: 60_000,
})
```

## Puertos

- **Implementa:** `SandboxProvider`.
- **Consume:** Un `RemoteSandboxTransport` suministrado por el host.

## Errores

`BRAMBO_SANDBOX_RESPONSE_INVALID`, `BRAMBO_SANDBOX_UNAVAILABLE`, `BRAMBO_SANDBOX_REQUEST_INVALID`; un tiempo agotado es un resultado `timed-out` para `execute` y un `BRAMBO_SANDBOX_TIMED_OUT` lanzado para las demás operaciones.

## Límites

- No incluye ningún protocolo; el transporte es suyo.
- Sin `timeoutMs` no hay temporizador; la creación de la sesión nunca queda cubierta.
- Los hechos de capacidad que declara son los que brambo cree; deben reflejar su servicio.

## Véase también

- [Herramientas y sandbox](../guides/tools-and-sandbox)
