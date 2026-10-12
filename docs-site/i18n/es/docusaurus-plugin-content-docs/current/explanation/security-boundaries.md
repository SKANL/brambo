---
title: Fronteras de seguridad
audience: Host integrators and security reviewers
prerequisites: Node.js >=20
outcome: Saber exactamente qué impone brambo, qué delega en su host y qué no afirma
scope: Fronteras de confianza del SDK 0.5.x
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
import Diagram from '@site/src/components/Diagram'
import TrustBoundary from '@site/src/components/diagrams/TrustBoundary'

# Fronteras de seguridad

brambo impone fronteras de propiedad, validación y ciclo de vida. No convierte un proceso de proveedor en un sandbox del sistema operativo y no autentica a nadie. Lea esta página como un reparto de responsabilidades: lo que hace brambo y lo que debe hacer su host.

<Diagram><TrustBoundary /></Diagram>

## Lo que impone brambo

- **Entradas validadas.** Los validadores de contratos rechazan sobres, políticas, leases y manifiestos mal formados con errores con código. La configuración rechaza ciclos y claves que contaminan prototipos, y después congela su instantánea.
- **Leases de espacios de trabajo.** Los handles son leases de un solo uso; los handles falsificados y la doble liberación son rechazos con código. La eliminación solo borra directorios de los que brambo tiene un registro de propiedad.
- **Propiedad de la proyección.** El contenido de proveedores que brambo no escribió nunca se modifica en silencio; las desviaciones se informan.
- **Escrituras durables con fencing.** Un escritor cuyo lease fue tomado por otro no puede confirmar (consulte [Modelo de durabilidad](./durability)).
- **Argv exactos.** La ejecución de herramientas pasa arreglos argv al proveedor de sandbox. No se interpreta ninguna cadena de shell ni se acepta ningún manejador JavaScript arbitrario.
- **Redacción de secretos en los resultados.** El adaptador CLI redacta los secretos de su entorno y las formas habituales de credenciales (`Bearer …`, `sk-…`, `ghp_…`, `AKIA…`, `xox?-…`) del texto de fallo antes de que llegue a un sobre. Los adaptadores de API redactan la credencial de cada ejecución de los identificadores de solicitud, cabeceras, uso y resúmenes.

## Lo que no impone brambo

**brambo no es un sandbox.** `adapter-cli` inicia procesos hijo normales con los privilegios del usuario. Fija el directorio de trabajo en el espacio de trabajo, pero el executor puede llegar a cualquier ruta que su proceso alcance.

| Executor | Se lanza como | Postura de permisos |
|---|---|---|
| `claude-code` | `claude --print --output-format stream-json --verbose --no-session-persistence --dangerously-skip-permissions` | Las confirmaciones de permisos de Claude Code están **desactivadas**; no hay aprobador interactivo. |
| `codex` | `codex exec --json --skip-git-repo-check` | No se pasa ninguna opción de sandbox, por lo que Codex aplica su propio sandbox por defecto (solo lectura). |
| `opencode` | `opencode run --format json -- <prompt>` | Se aplica la propia configuración de OpenCode. |

```text
workspace root: the starting directory for the child process
OS sandbox: not provided by the CLI adapter
vendor permissions: controlled by the executor and its configuration
```

Un `MethodPlugin` no es un sandbox. Descubrir una herramienta mediante un `ToolProvider` no autoriza a ejecutarla; la ejecución pasa por `executeTool`, un `ToolExecutor` y una sesión de sandbox propiedad del llamador.

Los proveedores de sandbox declaran su evidencia en lugar de prometer aislamiento. `sandbox-local` anuncia bubblewrap en Linux solo después de superar una prueba funcional; en macOS usa Seatbelt con evidencia solo del sistema de archivos; en Windows requiere un broker externo. `sandbox-remote` es un transporte que usted inyecta, no un protocolo incluido. No se afirma aislamiento del sistema operativo donde un proveedor no lo ha demostrado en esa plataforma.

## Lo que corresponde a su host

| Aspecto | brambo hace | Su host hace |
|---|---|---|
| Autenticación | Pasa al almacén el `Principal` que usted suministra; el coordinador llama a sus funciones `authenticate` y `authorize`. | Identifica a los llamadores, termina TLS y despliega el endpoint. |
| Credenciales | Acepta una credencial opaca por ejecución de API y la redacta. | Guarda, rota e inyecta secretos; nunca los pone en la configuración de brambo. |
| Aprobación de herramientas | Llama a su `permissionAuthorizer` o `approveTool`; rechaza cuando ninguno aprueba. | Decide qué puede hacer una herramienta y quién la aprueba. |
| Aislamiento | Valida la política de sandbox frente a la evidencia del proveedor. | Elige un proveedor, una plataforma y una política que realmente aíslen. |
| Plazos y coste | Impone los límites de presupuesto del kernel que usted configura. | Fija plazos, aborta ejecuciones y limita el gasto en el proveedor. |
| Retención | Deja los espacios de trabajo en disco; no persiste transcripciones. | Decide qué conservar, dónde y durante cuánto tiempo. |

## Lista de comprobación para una integración segura

1. Trate la ruta del espacio de trabajo como directorio inicial, no como garantía de contención.
2. Ejecute los executors con una cuenta del sistema, un contenedor o una máquina virtual cuyo alcance acepte.
3. Mantenga las credenciales y los permisos del proveedor bajo los controles del proveedor.
4. Decida según `BramboError.code`, no según el texto del mensaje.
5. Ejecute la suite de contrato correspondiente para cada proveedor o adaptador que añada.

## Informes honestos

Si brambo no puede medir una capacidad, informa una ausencia tipada. No deduce aislamiento ni permisos a partir de una ruta o de un evento ausente.

## Próximo paso

Lea [Seguridad de los adaptadores de API](./api-adapter-security) para las fronteras de los modelos alojados y [Compatibilidad](../reference/compatibility) para los límites de ejecución.
