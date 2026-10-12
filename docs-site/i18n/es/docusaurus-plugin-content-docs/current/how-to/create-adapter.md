---
title: Crear un adaptador
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Implementar y verificar una integración pública de ExecutorAdapter
scope: Interfaz publicada de adaptadores de executors
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# Crear un adaptador

Implemente `ExecutorAdapter` cuando su host tenga un executor que no sea uno de los rasgos de CLI incluidos en brambo. El adaptador recibe un prompt, un handle de espacio de trabajo con lease y una señal de aborto opcional; devuelve un `ResultEnvelope` validado.

## Pasos de implementación

1. Instale `@brambodev/contracts` y `@brambodev/session`.
2. Implemente el contrato público `ExecutorAdapter`; conserve el handle del espacio de trabajo y respete su señal de aborto.
3. Inyecte una fábrica con `createAdapter` en `runSession`; devuelva un adaptador nuevo para cada sesión.
4. Valide cada sobre devuelto y traduzca los fallos a errores con código en lugar de analizar el texto de los mensajes.
5. Ejecute la suite de cláusulas de executor publicada antes de distribuirlo.

## Adaptador mínimo

Este ejemplo usa solo la interfaz de sesión publicada y devuelve un resultado determinista sin iniciar ningún proceso hijo:

```js
import { runSession } from '@brambodev/session'

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

`createAdapter` es una fábrica, no una instancia de adaptador. Devuelva un adaptador nuevo para cada sesión. La ejecución sigue pasando por el pipeline de acciones del kernel y sus políticas.

## Requisitos del contrato

| Entrada o salida | Requisito |
| --- | --- |
| `workspace` | Trátelo como un lease; no lo sustituya por una ruta sin más. |
| `signal` | Al abortar, detenga todo el árbol de procesos y devuelva `cancelled` con un arreglo `errors` no vacío. |
| `status` | Use `ok`, `failed` o `cancelled`. Los sobres fallidos y cancelados deben explicarse en `errors`. |
| `data` | Incluya siempre la clave, con `null` cuando no haya carga. |
| `summary` | Proporcione siempre un resumen legible y no vacío. |

Valide los datos de frontera con los esquemas de `@brambodev/contracts` y dirija los fallos según `BramboError.code`, nunca analizando mensajes.

## Usar un rasgo de CLI incluido

Para Claude Code, Codex u OpenCode, prefiera `@brambodev/adapter-cli`. Su motor genérico gestiona el ciclo de vida del proceso hijo y el análisis de JSONL a partir de un registro `ExecutorTraits`. Los identificadores incluidos son `claude-code`, `codex` y `opencode`.

## Demostrar el adaptador

Implementar la interfaz de TypeScript no basta. Ejecute las `EXECUTOR_CLAUSES` publicadas con `runExecutorContractSuite` y corrija cada infracción antes de distribuirlo; [Suites de contrato](../guides/contract-suites) muestra un informe fallido y su corrección.

Mantenga la creación de procesos y las credenciales bajo el control del host. El paquete `@brambodev/adapter-cli` ofrece rasgos reutilizables para los executors de CLI incluidos; consulte su [referencia de paquete](../packages/adapter-cli).

## Próximo paso

Lea [Arquitectura y topología](../explanation/architecture) antes de añadir una dependencia de paquete: el grafo de paquetes de brambo es descendente a propósito.
