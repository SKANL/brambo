---
title: Conceptos centrales
audience: Desarrolladores y mantenedores
prerequisites: Node.js >=20
outcome: Entender las abstracciones públicas y el modelo de ownership de panda
scope: Conceptos públicos del SDK
compatibility: Los paquetes publicados admiten Node.js >=20
translationStatus: translated
---
# Conceptos centrales

panda es un microkernel para componer entornos de coding con IA. Separa contracts, providers, projections y composición de sesiones para que un host reemplace un límite sin adoptar internals del vendor.

## Mapa rápido

| Concepto | Significado |
| --- | --- |
| Contract | Port tipado y reglas de comportamiento. |
| Provider | Implementación reemplazable de un contract. |
| Projection | Salida con vocabulario nativo y ownership para revertir. |
| Session | Composición de configuración, executor, workspace, policy y ciclo de vida. |
| Lease | Handle de un solo uso que representa ownership del workspace. |

## Contracts y providers

`@skanl/panda-contracts` es el seam portable. Un provider puede usar archivos, SQLite u otra implementación y debe conservar el mismo contract y sus rechazos codificados.

```ts
import type { MemoryProvider, WorkspaceProvider } from '@skanl/panda-contracts'

function mount(memory: MemoryProvider, workspace: WorkspaceProvider): void {
  void memory
  void workspace
}
```

Implementar solo la forma de TypeScript no alcanza cuando el comportamiento es observable; ejecutá la clause suite publicada.

## Capas de configuración

La configuración se resuelve de más amplia a más específica: `defaults`, `global`, `project`, `agent` y `invocation`. Las capas posteriores sobrescriben las anteriores. El documento compuesto se valida antes de entregar settings a los plugins.

## Ownership y ausencia

panda registra lo que escribe para revertir únicamente su propia salida. La información no disponible se representa como ausencia tipada o error codificado, no como cero inventado ni `null` sin contexto.

## Siguiente paso

Leé [Arquitectura](./architecture) para conocer el grafo y los límites del ciclo de vida.
