---
title: Crear un adapter
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Understand this documentation page
scope: This page
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# Crear un adapter

Implementá `ExecutorAdapter` cuando tu host sea dueño de un executor que no tenga uno de los traits CLI incluidos en brambo. El adapter recibe un prompt, un workspace leaseado y una señal opcional de abort; devuelve un `ResultEnvelope` validado.

## Adapter mínimo

Este ejemplo usa únicamente el seam publicado de session y devuelve un resultado determinista sin iniciar un proceso hijo:

```js
import { runSession } from '@skanl/brambo-session'

const adapter = {
  async run({ prompt, workspace }) {
    return {
      status: 'ok',
      data: { prompt, workspaceId: workspace.id },
      summary: 'Adapter completed the request',
    }
  },
}

const result = await runSession({
  prompt: 'health check',
  createAdapter: () => adapter,
})

console.log(result.data.workspaceId)
```

`createAdapter` es una factory, no una instancia de adapter. Devuelve un adapter nuevo en cada sesión. La ejecución sigue pasando por el action waterfall del kernel y sus políticas.

## Requisitos del contrato

| Entrada/salida | Requisito |
| --- | --- |
| `workspace` | Tratálo como un lease; no lo reemplaces por una ruta suelta. |
| `signal` | Al abortar, terminá todo el árbol de procesos y devuelve `cancelled` con un arreglo `errors` no vacío. |
| `status` | Usá `ok`, `failed` o `cancelled`. Los dos últimos deben explicar el motivo en `errors`. |
| `data` | Incluye siempre la clave; usa `null` cuando no haya payload. |
| `summary` | Proporcioná siempre un resumen humano no vacío. |

Validá los datos en los límites con los schemas de `@skanl/brambo-contracts` y enrutá los fallos por `BramboError.code`, nunca parseando mensajes.

## Usar un trait CLI incluido

Para Claude Code, Codex u OpenCode, preferí `@skanl/brambo-adapter-cli`. Su motor genérico resuelve el ciclo de vida del proceso hijo y el parseo JSONL desde un registro `ExecutorTraits`. Los IDs incluidos son `claude-code`, `codex` y `opencode`.

## Probar el adapter

Implementar la interfaz de TypeScript no alcanza. Ejecutá los `EXECUTOR_CLAUSES` publicados con `runExecutorContractSuite` y corregí cada violation antes de publicar. La suite comprueba comportamientos como cancelación, envelopes de error y manejo del workspace.

## Siguiente paso

Lee [Arquitectura](../explanation/architecture) antes de agregar una dependencia: el grafo de paquetes de brambo es deliberadamente descendente.
