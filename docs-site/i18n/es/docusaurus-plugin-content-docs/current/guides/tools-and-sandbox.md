---
title: Herramientas y sandbox
audience: Host integrators who execute tools for an agent
prerequisites: Node.js >=20
outcome: Ejecutar una invocación de herramienta aprobada mediante una sesión de sandbox y saber qué impone realmente ese sandbox en cada plataforma
scope: executeTool, ToolExecutor y proveedores de sandbox en 0.5.x
compatibility: Published packages support Node.js >=20; enforcement varies by platform
translationStatus: translated
---
import Diagram from '@site/src/components/Diagram'
import SessionLifecycle from '@site/src/components/diagrams/SessionLifecycle'

# Herramientas y sandbox

:::warning[Frontera de ejecución]

Descubrir una herramienta no da permiso para ejecutarla. Un host debe aprobar explícitamente una invocación y ejecutarla mediante un `ToolExecutor` vinculado a una sesión de sandbox propiedad del llamador.

:::

Esta página trata las herramientas que ejecuta **su host**, por ejemplo en nombre del bucle de herramientas de un executor de API. No envuelve a un executor de CLI: Claude Code, Codex y OpenCode ejecutan sus propias herramientas dentro de su propio proceso (consulte [Fronteras de seguridad](../explanation/security-boundaries)).

## Ruta de ejecución explícita

<Diagram><SessionLifecycle /></Diagram>

1. Construya una `SandboxPolicy`. `createDefaultSandboxPolicy(root)` da `workspace-write`, red `deny` y exige aplicación **completa** de sistema de archivos, procesos y recursos; ningún proveedor local incluido demuestra hoy las tres cosas, así que declare los requisitos que realmente acepta.
2. Resuelva un proveedor que pueda demostrar esa política y abra una sesión.
3. Vincule un `ToolExecutor` a la sesión con `createToolExecutor(session)`.
4. Llame a `executeTool`: valida la invocación, comprueba la evidencia de capacidades, consulta a su autorizador o a `approveTool`, ejecuta e informa del resultado.
5. Deseche la sesión en la frontera del ciclo de vida de su host.

```ts
import { createDefaultSandboxPolicy, validateSandboxPolicy } from '@brambodev/contracts'
import { createSandboxProviderResolver } from '@brambodev/sandbox'
import { createLocalSandboxProvider } from '@brambodev/sandbox-local'
import { createToolExecutor, executeTool } from '@brambodev/session'

const root = process.cwd()
// Require only proven filesystem confinement; process and resource limits stay unrequired.
const policy = validateSandboxPolicy({ ...createDefaultSandboxPolicy(root), requiredCapabilities: { filesystem: 'full' } })
const resolver = createSandboxProviderResolver([await createLocalSandboxProvider()])
const session = await resolver.createSession({ policy, snapshots: [] })
try {
  const result = await executeTool({
    invocation: { tool: { kind: 'local', argv: ['git'] }, arguments: ['status', '--short'] },
    context: { cwd: root, environment: { LANG: 'C' }, policy },
    toolExecutor: createToolExecutor(session),
    approveTool: ({ invocation }) => invocation.tool.kind === 'local',
  })
  console.log(result.status, result.stdout)
} finally {
  await session.dispose()
}
```

Si ningún proveedor registrado puede demostrar cada control requerido, `createSession` lanza `BRAMBO_SANDBOX_CAPABILITY_UNAVAILABLE` antes de ejecutar nada. Si ni su `permissionAuthorizer` ni `approveTool` aprueban, `executeTool` lanza `BRAMBO_SANDBOX_DENIED`.

## Tipos de invocación

| Tipo | Descriptor | Argumentos |
|---|---|---|
| `local` | `{ kind: 'local', argv: [...] }` | Tokens de texto añadidos a argv, sin interpretación de shell |
| `mcp-stdio` | `{ kind: 'mcp-stdio', argv: [...], name }` | Objeto JSON enviado como argumentos de `tools/call` de MCP por el canal stdio de la sesión |
| `mcp-streamable-http` | `{ kind: 'mcp-streamable-http', url, name }` | Objeto JSON; requiere un `RemoteMcpClient` pasado a `createToolExecutor` (tiempo de espera predeterminado de 30 s por solicitud) |

`ToolExecutor` conserva argv exactos: `['node', 'server.mjs']` con `['--config', 'a b']` llega al proveedor como `['node', 'server.mjs', '--config', 'a b']`. No hay manejadores JavaScript arbitrarios.

## Política

| Campo | Valores |
|---|---|
| `mode` | `read-only`, `workspace-write`, `danger-full-access` (requiere `allowDangerous: true`) |
| `networkMode` | `deny` (predeterminado), `allowlist` (requiere `networkAllowlist`), `unrestricted` |
| `requiredCapabilities` | Por control (`filesystem`, `network`, `process`, `resources`): `partial` o `full` |
| `resourceLimits` | `wallTimeMs`, `memoryBytes`, `outputBytes`, `fileSizeBytes`, `processCount`, `cpuQuotaMicros`, `cpuPeriodMicros` |

Un proveedor informa hechos de capacidad por control con evidencia `none`, `partial` o `full`. Un requisito `full` necesita evidencia `full`, y `none` nunca satisface nada. La falta de evidencia falla de forma cerrada.

## Qué impone cada proveedor

| Proveedor | Mecanismo | Evidencia que puede afirmar |
|---|---|---|
| `sandbox-local` en Linux | bubblewrap (`bwrap`), solo tras superar una prueba funcional; cgroup v2 para límites de memoria, procesos y CPU; `prlimit` para tamaño de archivo | Sistema de archivos y red `full` cuando se supera la prueba; la red `allowlist` no está soportada |
| `sandbox-local` en macOS | Perfil Seatbelt (`sandbox-exec`), denegación por defecto | Solo sistema de archivos, cuando se supera una autoprueba; ningún modo de red aparte de `deny` |
| `sandbox-local` en Windows | Binario externo `brambo-windows-sandbox-broker` | Sistema de archivos, procesos y red completos y recursos parciales, solo si el broker está instalado y supera su autoprueba; si no, no disponible |
| `sandbox-remote` | Un transporte que **usted** inyecta (`createSession`, `execute`, `destroy`, y opcionalmente stdio, instantánea y restauración) | Lo que informe su servicio remoto, con `enforcement: 'remote'` |

En todas las plataformas, el proveedor local elimina las variables de entorno cuyo nombre parece un secreto, limita la salida a 1 MiB por flujo, impone por defecto 5 minutos de tiempo real y exige que el directorio de trabajo esté físicamente dentro de la raíz del espacio de trabajo.

### Política que debe pasar en cada plataforma

`createDefaultSandboxPolicy(root)` es deliberadamente de cierre seguro: exige evidencia `full` de sistema de archivos, procesos y recursos, por lo que con cualquier proveedor local incluido `executeTool` la rechaza con `BRAMBO_SANDBOX_CAPABILITY_UNAVAILABLE`. El error nombra el primer control no cumplido, el nivel exigido y la evidencia que informó el proveedor, por ejemplo `sandbox provider 'local-linux' cannot prove 'process' at 'full' evidence (it reports 'none')`. Pase los `requiredCapabilities` más estrictos que el proveedor pueda demostrar, y solo después de decidir que el resto es aceptable o que su host lo contiene:

| Plataforma y proveedor | `requiredCapabilities` más estrictos que puede satisfacer | Lo que se pierde |
|---|---|---|
| Linux, `sandbox-local` con un `bwrap` funcional | `{ filesystem: 'full', network: 'full' }` (red solo cuando la prueba la demostró) | Contención de procesos y recursos; agregue límites desde su host (cgroups, contenedor) |
| macOS, `sandbox-local` con Seatbelt | `{ filesystem: 'full' }` | Evidencia de red, procesos y recursos |
| Windows, `sandbox-local` con el broker instalado | `{ filesystem: 'full', network: 'full', process: 'full', resources: 'partial' }` | Evidencia completa de recursos |
| Cualquier plataforma, `sandbox-remote` | La política por defecto, si su servicio remoto informa `full` en cada control | Nada, siempre que los datos del servicio sean ciertos |

```ts
import { createDefaultSandboxPolicy, validateSandboxPolicy } from '@brambodev/contracts'

const root = process.cwd()
const linuxPolicy = validateSandboxPolicy({ ...createDefaultSandboxPolicy(root), requiredCapabilities: { filesystem: 'full', network: 'full' } })
```

:::caution[Sin afirmación de aislamiento del sistema operativo]

Los adaptadores de executors de CLI no ofrecen contención a nivel del sistema operativo, y los tipos de la API de sandbox por sí solos no establecen aislamiento. Las ejecuciones opcionales de conformidad en hosts Linux, macOS y Windows no se afirman como ejecutadas en CI.

:::

## Conectar herramientas a un executor de API

Los proveedores de OpenAI y Anthropic aceptan un `toolLoop` cuyo `createExecution(call, signal)` devuelve las opciones de `executeTool` para cada llamada a herramienta del modelo. Cada llamada pasa entonces por la misma validación, comprobación de evidencia y aprobación descritas arriba. Consulte [Executors de API](./api-executors).

## Próximo paso

Lea [Fronteras de seguridad](../explanation/security-boundaries) y después las referencias de los paquetes [sandbox](../packages/sandbox), [sandbox-local](../packages/sandbox-local) y [sandbox-remote](../packages/sandbox-remote).
