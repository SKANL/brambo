---
title: Los tres mundos
audience: Developers evaluating or adopting brambo
prerequisites: Node.js >=20
outcome: Saber a qué mundo pertenece su problema y el vocabulario que usa cada uno
scope: Conceptos públicos del SDK y agrupación de paquetes
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
import Diagram from '@site/src/components/Diagram'
import ThreeWorlds from '@site/src/components/diagrams/ThreeWorlds'

# Los tres mundos

Los paquetes de brambo responden a tres preguntas distintas. Cada mundo tiene su propio paquete de entrada y su vocabulario, y los tres comparten solo el paquete de contratos y el kernel. Se instala el mundo que se necesita y nada más.

<Diagram><ThreeWorlds /></Diagram>

## Mundo de sesión: ejecutar un turno

**Pregunta:** «Ejecuta este prompt con este executor en este espacio de trabajo y dime qué pasó».

| Concepto | Significado |
|---|---|
| Executor | Un agente de programación: una CLI de proveedor (`claude-code`, `codex`, `opencode`) mediante `adapter-cli`, o una API de modelo alojada mediante `adapter-api` con `adapter-openai` o `adapter-anthropic`. |
| `ExecutorAdapter` | El puerto: `run(request) → ResultEnvelope`. |
| Espacio de trabajo | Un directorio donde ocurre la ejecución, creado por un `WorkspaceProvider` (`workspace-local` o `workspace-git-worktree`) y retenido mediante un lease. |
| `ResultEnvelope` | El resultado tipado: `status` (`ok`, `failed`, `cancelled`), `summary`, `data`, `changedPaths`, `errors`. |
| Sandbox | Un `SandboxProvider` opcional que ejecuta argv explícitos de herramientas bajo una política. No envuelve el proceso del executor. |

Punto de entrada: `runSession` en `@brambodev/session`. Empiece por [Su primera sesión](../tutorials/first-session).

## Mundo durable: sobrevivir a caídas y relevos

**Pregunta:** «Ejecuta un grafo de tareas que pueda detenerse, caerse o pasar a otro worker sin repetir ni perder trabajo».

| Concepto | Significado |
|---|---|
| `RunStore` | El puerto durable: instantáneas confirmadas mediante comparación e intercambio sobre una revisión, eventos, recibos de comandos y leases. |
| Lease y época de fencing | Una reclamación con tiempo limitado sobre recursos (`run:<id>`, `workspace:<id>`, `task:<run>:<task>`). Cada adquisición incrementa una época, de modo que un dueño obsoleto no puede confirmar. |
| Recibo de comando | Admisión idempotente de un comando `start`, `continue` o `cancel` identificado por `clientId` e `idempotencyKey`. |
| Diario de efectos | Registro por tarea de los efectos de herramientas (`read-only`, `idempotent`, `non-idempotent`), para que una recuperación reproduzca los resultados completados y se niegue a adivinar sobre los inciertos. |
| `ArtifactProvider` | Revisiones inmutables y direccionadas por contenido: preparar y después publicar bajo un lease. |

Punto de entrada: `runDurableWorkflow` en `@brambodev/orchestration`, con `workflow-store-sqlite` como almacén de referencia. Lea después [Modelo de durabilidad](./durability).

## Mundo de entorno: proyectar configuración

**Pregunta:** «Mantén una lista canónica de skills y servidores MCP y escríbela en la configuración nativa de cada proveedor, de forma reversible».

| Concepto | Significado |
|---|---|
| Registro | Almacenamiento con ámbito (`global`, `project`, `agent`) de entradas `skill` y `mcp-server`. |
| Proyección | Escribir las entradas del registro en el archivo nativo de cada executor, en la ubicación que ese executor lee. |
| Registro de propiedad | La constancia de lo que escribió brambo, para informar de desviaciones y revertir solo la salida de brambo. |
| Remediación | Verbos explícitos `adopt`, `release`, `repair` y `discard`, cada uno con una vista previa `inspect`. |

Puntos de entrada: `registry`, `projection` y `environment`; la CLI `brambo` es su binding delgado de línea de comandos.

## Vocabulario compartido

| Concepto | Significado |
|---|---|
| Contrato | Un puerto tipado más sus reglas de comportamiento y una suite de cláusulas ejecutable. |
| Proveedor | Una implementación reemplazable de un contrato. |
| Plugin | Una unidad montada en el kernel con un manifiesto que declara los servicios que provee y consume. |
| Capas de configuración | `defaults → global → project → agent → invocation`; las capas posteriores sustituyen a las anteriores. |
| Ausencia tipada | La información no disponible se informa como ausencia explícita o error con código, nunca como un cero inventado o un `null` sin más. |

## Próximo paso

Lea [Arquitectura y topología](./architecture) para ver cómo se organizan los mundos en capas y después [Principios de diseño](./principles).
