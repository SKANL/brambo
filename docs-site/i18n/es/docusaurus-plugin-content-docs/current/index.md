---
sidebar_position: 1
title: Introducción
slug: /
audience: Developers evaluating or adopting the brambo SDK
prerequisites: Node.js >=20
outcome: Saber qué es brambo, qué ruta encaja con su trabajo y por dónde empezar
scope: Punto de entrada de la documentación del SDK 0.5.x
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
import {Card, CardGrid} from '@site/src/components'
import Diagram from '@site/src/components/Diagram'
import ThreeWorlds from '@site/src/components/diagrams/ThreeWorlds'

# brambo

**brambo es un microkernel orientado al SDK para integrar agentes de programación con IA en su propio producto.** Ejecuta sesiones de executors (Claude Code, Codex, OpenCode o las API de OpenAI y Anthropic) detrás de un único resultado tipado, orquesta flujos durables con leases con fencing y recibos idempotentes, y proyecta un registro canónico en la configuración nativa de cada proveedor. Cada frontera es un puerto tipado en `@brambodev/contracts` y cada puerto incluye una suite de contrato ejecutable.

El SDK es una biblioteca, no un servicio: no hay cuenta de brambo, ni plano de control alojado, ni demonio. Su proceso es dueño de la autoridad, las credenciales, la planificación y la política de limpieza; brambo es dueño de los contratos y de las comprobaciones que fallan de forma cerrada a su alrededor.

## Elija su ruta

<CardGrid columns={3}>
  <Card eyebrow="Integrar" title="Ejecutar un agente desde su host" to="/docs/tutorials/first-session">
    Llame a `runSession`, obtenga un `ResultEnvelope` tipado y cancele con su propia señal.
  </Card>
  <Card eyebrow="Orquestar" title="Ejecutar flujos durables" to="/docs/guides/durable-orchestration">
    Componga un almacén SQLite, leases, épocas de fencing y artefactos en ejecuciones reanudables.
  </Card>
  <Card eyebrow="Extender" title="Añadir un proveedor o puerto" to="/docs/guides/third-party-executor-providers">
    Escriba un `ExecutorProvider`, regístrelo de forma explícita y demuéstrelo con la suite de conformidad.
  </Card>
</CardGrid>

| Usted es... | Empiece por | Después lea |
|---|---|---|
| Integrador de un host que añade un turno de agente a un producto | [Su primera sesión](tutorials/first-session) | [Executors y espacios de trabajo](guides/executors-and-workspaces), [Herramientas y sandbox](guides/tools-and-sandbox) |
| Ingeniero de plataforma con trabajo largo y reanudable | [Orquestación durable](guides/durable-orchestration) | [Orquestación remota](guides/remote-orchestration), [Drivers y herramientas personalizados](guides/custom-drivers-and-tools) |
| Autor de un proveedor o puerto | [Proveedores de executors de terceros](guides/third-party-executor-providers) | [Contratos del kernel](guides/kernel-contracts), [Crear un adaptador](how-to/create-adapter) |
| Evaluando brambo | [Arquitectura](explanation/architecture) | [Fronteras de seguridad](explanation/security-boundaries), [Afirmaciones y evidencia](reference/claims-and-evidence) |

## Tres mundos, un kernel

Los 28 paquetes de brambo se agrupan en tres mundos que comparten el paquete de contratos y el kernel sin dependencias. Solo se instala el mundo que se necesita.

<Diagram><ThreeWorlds /></Diagram>

- **Mundo de sesión**: un turno de executor en un espacio de trabajo. `@brambodev/session` con `adapter-cli` o `adapter-api` (+ `adapter-openai`, `adapter-anthropic`), espacios de trabajo locales o git worktree y proveedores de sandbox.
- **Mundo durable**: ejecuciones que sobreviven a caídas y relevos. `@brambodev/orchestration` con `runtime-local`, `workflow-store-sqlite`, `workflow-coordinator`, `workflow-remote` y `workspace-artifacts-local`.
- **Mundo de entorno**: un registro canónico proyectado en la configuración nativa de cada proveedor con un registro de propiedad. `registry`, `projection`, `environment`.

## Instalación

```bash
npm install @brambodev/session
```

El paquete de sesión reexporta todos los tipos y utilidades que su superficie necesita, por lo que no se instalan `@brambodev/contracts` ni `@brambodev/kernel` por separado. Consulte [Instalación](guides/install) para el conjunto completo de paquetes y [Compatibilidad](reference/compatibility) para las versiones de Node.js por paquete.

## Fronteras explícitas

brambo declara sus límites junto a sus funcionalidades:

- **brambo valida y registra; su host decide.** La aprobación, las credenciales, la planificación y la retención son responsabilidad del host.
- **brambo no es un sandbox.** El adaptador CLI lanza los binarios de los proveedores con sus propias confirmaciones de permisos desactivadas (Claude Code se ejecuta con `--dangerously-skip-permissions`); el aislamiento proviene del espacio de trabajo y del proveedor de sandbox elegidos, y no se afirma aislamiento del sistema operativo donde un proveedor no lo ha demostrado.
- **El SDK no establece tiempos de espera ni reintenta nada por defecto.** La cancelación solo llega a una ejecución mediante la interrupción o la señal que su host conecte.
- **No se incluye ningún protocolo remoto concreto** para sandboxes; el proveedor de sandbox remoto es un adaptador de transporte que usted suministra.

Todos los límites se reúnen en [Limitaciones conocidas](reference/known-limitations), y la evidencia de cada afirmación está en [Afirmaciones y evidencia](reference/claims-and-evidence).
