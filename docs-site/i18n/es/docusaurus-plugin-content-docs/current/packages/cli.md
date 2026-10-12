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

*Estable: cubierto por sus pruebas (y por su suite de contrato cuando el puerto la tiene) y ejercitado por la ruta de sesión o de CLI de brambo. brambo es anterior a 1.0, por lo que siguen siendo posibles cambios incompatibles, que se señalan en el registro de cambios.*

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

## Véase también

- [Apéndice de la CLI](../how-to/run-cli)
