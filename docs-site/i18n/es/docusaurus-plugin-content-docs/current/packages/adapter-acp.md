---
title: adapter-acp
audience: Developers integrating @brambodev/adapter-acp
prerequisites: Node.js >=20
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/adapter-acp 0.5.x'
compatibility: Node.js >=20
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/adapter-acp

<Badge status="frozen">Congelado</Badge>

*Congelado: solo recibe correcciones de protocolo verificadas; no se planean funcionalidades nuevas.*

Un cliente JSON-RPC sobre stdio con mensajes delimitados por saltos de línea para el Agent Client Protocol v1 (`initialize`, `session/new`, `session/load`, `session/prompt` y `session/cancel` como notificación), con las solicitudes de permiso dirigidas a una función `onPermission`. No es un `ExecutorAdapter` y no depende de ningún paquete de brambo.

| | |
|---|---|
| Mundo | De soporte |
| Nivel de topología | 2 |
| Node.js | `>=20` |
| Depende de | ninguno |

## Instalación

```bash
npm install @brambodev/adapter-acp
```

## Ejemplo

```ts
import { spawn } from 'node:child_process'
import { createStdioJsonRpcClient } from '@brambodev/adapter-acp'

const agent = spawn('my-acp-agent', [], { stdio: ['pipe', 'pipe', 'inherit'] })
const client = createStdioJsonRpcClient(agent, {
  onPermission: async () => ({ kind: 'denied', reason: 'host policy' }),
})
await client.initialize({ protocolVersion: 1 })
await client.close()
```

## Puertos

- **Implementa:** An ACP JSON-RPC client (no brambo port).
- **Consume:** Un proceso hijo que habla ACP sobre stdio.

## Errores

`AdapterAcpError` con sus propios códigos: `malformed-frame`, `frame-too-large`, `process-closed`, `process-error`, `rpc-error`, `write-failed`, `client-closed`. Las solicitudes del servidor no gestionadas se responden con JSON-RPC `-32601`.

## Límites

- Congelado: solo correcciones de protocolo.
- Mensajes de hasta 1 MiB por defecto (`maxFrameBytes`).
- Sin `onPermission`, toda solicitud de permiso se deniega.

## Véase también

- [ADR-010](../explanation/decisions/adr-010)
