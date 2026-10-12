---
title: adapter-cli
audience: Developers integrating @brambodev/adapter-cli
prerequisites: Node.js >=20
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/adapter-cli 0.5.x'
compatibility: Node.js >=20
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/adapter-cli

<Badge status="stable">Estable</Badge>

*Estable: cubierto por sus pruebas (y por su suite de contrato cuando el puerto la tiene) y ejercitado por la ruta de sesión o de CLI de brambo. brambo es anterior a 1.0, por lo que siguen siendo posibles cambios incompatibles, que se señalan en el registro de cambios.* [Criterios de estado](../reference/package-status).

El `ExecutorAdapter` para CLI de programación. Un único motor genérico lanza el binario del proveedor sin interfaz en el espacio de trabajo y traduce su salida JSON a un `ResultEnvelope`; cada executor (`claude-code`, `codex`, `opencode`) es un registro de rasgos con comando, argumentos, entrega del prompt y análisis de la salida. La mayoría de los hosts lo usan mediante `runSession`.

| | |
|---|---|
| Mundo | Mundo de sesión |
| Nivel de topología | 2 |
| Node.js | `>=20` |
| Depende de | [`contracts`](./contracts), [`kernel`](./kernel) |

## Instalación

```bash
npm install @brambodev/adapter-cli
```

## Ejemplo

```ts
import { createExecutorAdapter } from '@brambodev/adapter-cli'
import { LocalWorkspaceProvider } from '@brambodev/workspace-local'

const workspaces = new LocalWorkspaceProvider({ rootDir: './.brambo/workspaces' })
const handle = await workspaces.create()
try {
  const adapter = createExecutorAdapter('codex', { inheritEnv: ['PATH', 'HOME'] })
  const envelope = await adapter.run({ prompt: 'List the files', workspace: handle })
  console.log(envelope.status, envelope.summary)
} finally {
  await workspaces.release(handle)
  await workspaces.dispose()
}
```

## Puertos

- **Implementa:** `ExecutorAdapter`; a kernel executor plugin (`createExecutorPlugin`).
- **Consume:** La CLI del proveedor en `PATH` (o `command`) y un `WorkspaceHandle`.

## Errores

Errores en el sobre `BRAMBO_EXECUTOR_UNAVAILABLE`, `BRAMBO_EXECUTOR_RUN_FAILED`, `BRAMBO_EXECUTOR_CANCELLED`; lanza `BRAMBO_EXECUTOR_NOT_FOUND` para un identificador desconocido y `BRAMBO_CONTRACT_ENVELOPE_INVALID` para una solicitud inválida.

## Límites

- **No es un sandbox.** `claude-code` se lanza con `--dangerously-skip-permissions`; `codex` se ejecuta con su propio valor predeterminado de solo lectura; todos se ejecutan con los privilegios de su usuario.
- Sin tiempo de espera; abortar termina el árbol de procesos.
- stdout y stderr limitados a 1 MiB cada uno; prompts como argumento limitados a 30.000 caracteres en Windows y 100.000 en el resto.
- Los controles de modelo tipados rechazan shims `.cmd`/`.bat` de Windows.

## Cómo funciona

**Registros de rasgos.** `ExecutorTraits` es `{executorId, command, args, promptDelivery, promptArgSeparator?, output}`. La fábrica rechaza con un error codificado las formas que fallarían en silencio: `command` vacío, `resultPath` vacío, `errorStatusPrefix` vacío, `usagePaths` sin el `usageWhen` que lo acota, o una clave de `metadata` que coincide con una clave de `data` propia del motor. `test/trait-stub.test.ts` supera toda la suite de cláusulas con un registro que el motor nunca vio.

| Executor | Prompt | El resultado se lee de |
|---|---|---|
| `claude-code` | stdin | `result` donde `type == "result"` |
| `codex` | stdin | `item.text` donde `item.type == "agent_message"` |
| `opencode` | última entrada de argv, después de `--` | `part.text` donde `part.type == "text"` |

**Lectura del flujo JSONL.** El motor conserva el primer registro que informa un fallo y el último que lleva un resultado utilizable, comparando solo las rutas que nombra el rasgo, nunca los nombres de eventos del proveedor. La detección de fallos no depende de la posición, porque OpenCode emite eventos `error` recuperables y continúa. Se exige un discriminador porque los elementos `reasoning` de codex y las partes `reasoning` de opencode también llevan `text`; sin él, el adaptador devolvería el razonamiento como respuesta.

**Directorio de trabajo y entorno.** El proceso hijo arranca en `workspace.rootPath` y `PWD` siempre se restablece a esa ruta: OpenCode resuelve sus herramientas de archivos contra `$PWD`, por lo que un `PWD` heredado enviaba sus escrituras al directorio desde el que se lanzó brambo. `inheritEnv` selecciona qué variables del host se heredan (si se omite, todas), `env` se aplica encima y `extraArgs` va después de los argumentos del rasgo y antes del separador del prompt. `HOME` se transmite sin cambios, por lo que el estado por usuario de cada executor (la base de datos SQLite de OpenCode, `~/.claude/`) se comparte entre sesiones concurrentes.

**Lo que el espacio de trabajo no es.** Medido con los binarios reales (`test/confinement-live.test.ts`): claude-code y opencode escriben dentro del espacio de trabajo los archivos con ruta relativa; `codex exec` usa por defecto su sandbox `read-only`, así que, tal como se distribuye, codex no crea archivos. Cuando se le pidió escribir en una ruta absoluta fuera del espacio de trabajo, claude lo hizo. brambo hace que el espacio de trabajo sea real; no lo impone.

**La entrega de argumentos es una frontera de confianza.** Un separador `--` impide que un prompt que empieza con `-` ocupe la posición de una opción. Un prompt más largo que el límite conservador de argv (30 000 caracteres en win32, 100 000 en el resto) se rechaza con un sobre codificado. Un comando `.cmd`/`.bat` en win32 se redirigiría a través de `cmd.exe`, que interpreta `&`, `|`, `>`, `^` y `%VAR%` sin importar cómo se entrecomille el argumento, de modo que la ejecución falla de forma cerrada con `BRAMBO_EXECUTOR_UNAVAILABLE` e indica la solución: apuntar `command` al ejecutable real.

**Garantías del sobre.** `BRAMBO_EXECUTOR_UNAVAILABLE` cuando el binario no puede iniciarse; `BRAMBO_EXECUTOR_RUN_FAILED` ante errores de canalización, salidas distintas de cero, salida no analizable y fallos informados por el proveedor, incluso con código de salida 0. La finalización se observa antes de que una interrupción pueda declarar la cancelación, así que una interrupción posterior a una salida correcta produce el `ok` real. La cancelación termina todo el árbol de procesos (`taskkill /T /F` en win32, `SIGKILL` al grupo de procesos en POSIX). Una carga estructurada sobrevive a una salida distinta de cero, y una captura que alcanzó el tope del flujo es un fallo codificado que nombra el truncamiento.

**Ganchos de observación.** `onStreamEvent({ index, payload, raw })` recibe cada registro JSONL (`payload: null` para una línea mal formada) sin contrapresión; los fallos del observador no pueden reemplazar el sobre. `onTiming` recibe `{ spawnSetupMs, runMs }`; `test/overhead.test.ts` mantiene la sobrecarga del adaptador dentro de 150 ms por encima de un inicio directo.

**Uso de tokens.** `usageWhen` selecciona los registros que llevan el uso (`result` para claude-code, `turn.completed` para codex, `step_finish` para opencode) y `usagePaths` nombra los campos numéricos. Se suman dentro de un registro y entre todos los registros coincidentes, porque un proveedor que trabaja por pasos factura cada paso. El total queda en `envelope.data.usage` como número. Falla de forma cerrada en conjunto: si algún registro facturado no puede leerse, no se informa ninguna cifra. Las ventanas de cuota se entregan mediante `onUsageObservation`, nunca en el sobre.

**Las pruebas en vivo son opcionales.** Las comprobaciones por defecto inyectan un lanzador falso y nunca inician un executor. `test/opencode-live.test.ts` solo se ejecuta con `BRAMBO_LIVE_OPENCODE=1`; la suite de confinamiento omite cualquier binario ausente o sin sesión iniciada e imprime qué executors midió, así que lea esa línea antes de confiar en un resultado verde.

## Véase también

- [Executors y espacios de trabajo](../guides/executors-and-workspaces)
- [Fronteras de seguridad](../explanation/security-boundaries)
