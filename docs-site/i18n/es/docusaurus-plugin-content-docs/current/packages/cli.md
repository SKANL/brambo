---
title: cli
audience: Developers integrating @brambodev/cli
prerequisites: Node.js >=20
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/cli 0.5.x'
compatibility: Node.js >=20
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/cli

<Badge status="stable">Estable</Badge>

*Estable: cubierto por sus pruebas (y por su suite de contrato cuando el puerto la tiene) y ejercitado por la ruta de sesión o de CLI de brambo. brambo es anterior a 1.0, por lo que siguen siendo posibles cambios incompatibles, que se señalan en el registro de cambios.* [Criterios de estado](../reference/package-status).

El comando `brambo`: análisis de argumentos, salida JSON y códigos de salida sobre `@brambodev/session` y `@brambodev/environment`, y nada más. No lee archivos por sí mismo y no puede componer un kernel; las reglas de lint imponen ambas cosas. Los hosts de biblioteca deben usar los paquetes del SDK.

| | |
|---|---|
| Mundo | De soporte |
| Nivel de topología | 8 |
| Node.js | `>=20` |
| Depende de | [`adapter-anthropic`](./adapter-anthropic), [`adapter-api`](./adapter-api), [`adapter-openai`](./adapter-openai), [`environment`](./environment), [`session`](./session) |

## Instalación

```bash
npm install --global @brambodev/cli
```

## Ejemplo

```bash
npm install --global @brambodev/cli
brambo run --executor codex "List the files in this workspace"
brambo doctor
```

## Puertos

- **Implementa:** `runBrambo(argv, options)` and the `brambo` binary.
- **Consume:** `session`, `environment`, `adapter-api`, `adapter-openai`, `adapter-anthropic`.

## Errores

Códigos de salida: para `run`, `0` sobre correcto, `1` sobre fallido o cancelado, `2` fallo de uso o del entorno. Los errores con código se imprimen; no se analizan desde los mensajes.

## Límites

- Un binding de conveniencia, no la arquitectura.
- Nunca carga un proveedor nombrado por los argumentos o la configuración; los perfiles de API necesitan un registro suministrado por el host.

## Cómo funciona

- **Una capa delgada.** La CLI analiza argv, llama a `@brambodev/session`, imprime el sobre como JSON y lo convierte en un código de salida. `eslint.config.js` le prohíbe importar `node:fs`, así que toda capacidad que necesite leer un archivo vive en `session` o en `environment`.
- **La selección se anuncia.** Cada ejecución escribe una línea en stderr como `executor: codex (selected by the 'project' layer)`. Los scripts deben decidir según el código de salida, no según la presencia de salida en stderr.
- **Una configuración inutilizable nunca recurre en silencio al valor por defecto.** Un documento ausente es una capa ausente; uno que existe pero no se puede usar (ilegible, un enlace simbólico roto, JSON no válido, algo que no es un objeto, un `executor` que no es cadena) sale con 2 y `BRAMBO_CONFIGURATION_UNUSABLE`. `--executor` reemplaza un documento que brambo puede leer; no rescata uno que no puede leer.
- **El ámbito viene de la gramática.** `brambo <verbo>` es el ámbito de la máquina y `brambo project <verbo> … [directorio]` el de un proyecto. No existe `--scope agent`, porque el ámbito de agente vive en memoria y no persistiría nada.
- **`add` registra, nunca proyecta.** Imprime el comando que entregaría la entrada, derivado del mismo planificador que usa `brambo init`, y lo indica cuando nada en ese ámbito la aceptaría (`NOTHING TAKES IT HERE`). Los tipos retirados `tool` y `profile` son errores de uso para `add`, pero `brambo remove` todavía los acepta para poder vaciar un registro antiguo.
- **`remediate` actúa sobre un hallazgo con nombre.** Cero o varias coincidencias son rechazos que enumeran lo que podría haberse nombrado; sin `--apply` solo describe.
- **`status` no invoca ningún executor ni escribe nada.** Informa las ventanas de cuota que el proveedor publicó en la última ejecución, sin promediarlas ni convertirlas; una superficie ausente es `BRAMBO_USAGE_NO_SURFACE` y un executor que todavía no se ejecutó es `BRAMBO_USAGE_NOT_OBSERVED`, nunca `0%`. Hoy solo `claude-code` publica esa superficie.

## Véase también

- [Apéndice de la CLI](../how-to/run-cli)
