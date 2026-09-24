---
title: sandbox-remote
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Adaptar un transporte inyectado al contrato de sandbox
scope: Esta página
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# @brambodev/sandbox-remote

`@brambodev/sandbox-remote` adapta un transporte provisto por el caller al contrato `SandboxProvider` de brambo. Deliberadamente no define **ningún protocolo de red** ni abre conexiones por sí mismo.

## Ruta rápida

Implementa el seam de transporte y crea el proveedor con evidencia de capacidades que identifique el mismo provider ID y use `enforcement: 'remote'`.

```ts
import { createRemoteSandboxProvider } from '@brambodev/sandbox-remote'

const provider = createRemoteSandboxProvider({
  id: 'my-remote-sandbox',
  capabilities,
  transport,
  timeoutMs: 30_000,
})

const session = await provider.createSession({ policy, snapshots: [] })
try {
  const result = await session.execute({ argv, cwd, environment, policy })
  console.log(result.status)
} finally {
  await session.dispose()
}
```

## Contrato del transporte

| Operación | Payload y validación |
| --- | --- |
| `createSession` | Envía identidad inmutable, política y snapshots; la respuesta debe repetir la identidad y probar capacidades remotas. |
| `execute` | Envía argv exacto, cwd, environment, snapshots y una señal de cancelación; la respuesta debe repetir identidad y validar el resultado. |
| `openStdio` | Opcional; devuelve `sendFrame`, `receiveFrame` y `close`. |
| `destroy` | Recibe la identidad y se llama una vez mediante la promesa de liberación de la sesión. |

Las respuestas se revisan para detectar campos inesperados, identidad o política diferentes, provider ID incorrecto y enforcement que no sea `remote`. Las respuestas malformadas fallan de forma cerrada con errores codificados.

## Cancelación y timeouts

El proveedor compite cada operación remota contra la cancelación del caller y el timeout configurado. Devuelve resultados tipados `aborted` o `timed-out` si el transporte no termina. El transporte recibe la señal derivada, pero el adapter no puede obligar a una implementación remota a detenerse; el transporte debe respetar la cancelación para garantizar cleanup.

Si una sesión o canal stdio resuelve después de que ganó un timeout o una cancelación, el adapter cierra el canal tardío cuando puede. Así evita dejar silenciosamente abierto un recurso remoto.

## Reglas de stdio

La superficie stdio opcional reenvía frames UTF-8 completos. `sendFrame` rechaza `\n` y `\r` antes del dispatch, y `receiveFrame` exige un string. El adapter no interpreta un protocolo de framing remoto; ese detalle pertenece al transporte inyectado.

## Lo que este paquete no afirma

- No es un servicio remoto, cliente ni implementación de protocolo.
- `enforcement: 'remote'` es evidencia suministrada por el lado remoto y validada por identidad; no es una auditoría independiente de esa infraestructura.
- El adapter no puede garantizar cancelación si el transporte inyectado ignora su señal.
- Los snapshots siguen siendo responsabilidad del proveedor y conservan la semántica de solo archivos del paquete de contracts.

## Instantáneas de archivos

El transporte inyectado puede implementar operaciones de instantánea y restauración de archivos. No representan ni restauran el estado de procesos.
