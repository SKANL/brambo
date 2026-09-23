---
title: Herramientas y sandbox
audience: Developers and maintainers
prerequisites: Node.js >=20 y una sesión sandbox creada explícitamente
outcome: Comprender la ejecución explícita de herramientas y los límites del sandbox
scope: Límites del SDK de herramientas y sandbox
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# Herramientas y sandbox

:::warning[Límite de ejecución]

Descubrir una herramienta no autoriza su ejecución. El host debe aprobar explícitamente una invocación y ejecutarla mediante un `ToolExecutor` asociado a una sesión sandbox que pertenezca al host.

:::

## Ruta de ejecución explícita

El SDK expone `executeTool` y `createToolExecutor` desde `@brambodev/session`. El host crea una sesión sandbox mediante un provider registrado, vincula el executor y pasa una invocación validada por la ruta explícita. Libera la sesión al terminar su ciclo de vida. `runSession` no invoca esta ruta automáticamente.

Los descriptores admiten procesos locales con argv exacto, MCP sobre stdio y MCP streamable HTTP. El contrato de API no implica que se incluya un transporte remoto concreto; el provider remoto requiere un transporte inyectado.

## Comprender la aplicación de políticas

La política predeterminada solicita escritura en el workspace y deniega la red. Los providers deben demostrar las capacidades solicitadas con evidencia; si falta, la solicitud se rechaza. La evidencia del provider local es conservadora.

:::caution[Sin afirmación de aislamiento del sistema operativo]

Los adapters CLI no ofrecen contención del sistema operativo; los tipos de sandbox por sí solos no demuestran aislamiento.

:::

## Siguiente paso

Lee [Límites de seguridad](../explanation/security-boundaries) y revisa las referencias del [paquete sandbox](../packages/sandbox) y del [provider local](../packages/sandbox-local) antes de habilitar ejecución.
