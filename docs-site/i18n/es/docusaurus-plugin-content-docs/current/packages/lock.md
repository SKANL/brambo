---
title: lock
audience: Developers integrating @brambodev/lock
prerequisites: Node.js >=20
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/lock 0.5.x'
compatibility: Node.js >=20
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/lock

<Badge status="stable">Estable</Badge>

*Estable: cubierto por sus pruebas (y por su suite de contrato cuando el puerto la tiene) y ejercitado por la ruta de sesión o de CLI de brambo. brambo es anterior a 1.0, por lo que siguen siendo posibles cambios incompatibles, que se señalan en el registro de cambios.*

Un protocolo portable de archivos de bloqueo para serializar escrituras a nivel de máquina: creación exclusiva, un documento del titular, ruptura de bloqueos obsoletos con evidencia informada y liberación segura respecto a la propiedad. Lo usan el almacén del registro, el registro de propiedad de la proyección y el registro de los git worktrees.

| | |
|---|---|
| Mundo | De soporte |
| Nivel de topología | 1 |
| Node.js | `>=20` |
| Depende de | [`contracts`](./contracts) |

## Instalación

```bash
npm install @brambodev/lock
```

## Ejemplo

```ts
import { acquireLock } from '@brambodev/lock'

const lock = await acquireLock('./state.lock', { timeoutMs: 2_000, onStaleBreak: (broken) => console.warn('broke stale lock', broken) })
try {
  // exclusive section
} finally {
  await lock.release()
}
```

## Puertos

- **Implementa:** `acquireLock`.
- **Consume:** El sistema de archivos local.

## Errores

`BRAMBO_LOCK_CONTENTION` (expiró la espera acotada), `BRAMBO_LOCK_UNAVAILABLE` (falló el medio del bloqueo).

## Límites

- Valores predeterminados: espera de 2 s, sondeo de 25 ms, antigüedad de obsolescencia de 30 min, 60 s de gracia para bloqueos corruptos.
- De ámbito de máquina; no es un bloqueo distribuido.

## Véase también

- [Principios de diseño](../explanation/principles)
