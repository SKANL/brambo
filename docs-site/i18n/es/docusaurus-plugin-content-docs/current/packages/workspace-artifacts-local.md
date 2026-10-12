---
title: workspace-artifacts-local
audience: Developers integrating @brambodev/workspace-artifacts-local
prerequisites: Node.js >=20
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/workspace-artifacts-local 0.5.x'
compatibility: Node.js >=20
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/workspace-artifacts-local

<Badge status="experimental">Experimental</Badge>

*Experimental: probado y utilizable, pero su superficie aún puede cambiar y tiene menos evidencia de plataforma o menos consumidores en el repositorio que los paquetes estables.* [Criterios de estado](../reference/package-status).

Un `ArtifactProvider` local direccionado por contenido: blobs inmutables y manifiestos de revisión bajo una raíz privada, publicación de espacios de trabajo protegida por un lease de `RunStore`, lecturas verificadas por resumen criptográfico y materialización segura. La preparación rechaza enlaces simbólicos, rutas inseguras y colisiones que no distinguen mayúsculas.

| | |
|---|---|
| Mundo | Mundo durable |
| Nivel de topología | 2 |
| Node.js | `>=20` |
| Depende de | [`contracts`](./contracts) |

## Instalación

```bash
npm install @brambodev/workspace-artifacts-local
```

## Ejemplo

```ts
import { openSqliteRunStore } from '@brambodev/workflow-store-sqlite'
import { createLocalArtifactProvider } from '@brambodev/workspace-artifacts-local'

const store = await openSqliteRunStore({ path: './workflow.sqlite' })
const artifacts = createLocalArtifactProvider({ rootDir: './private-artifacts', store, limits: { maxFiles: 10_000 } })
const manifest = await artifacts.stage('acme', './input')
console.log(manifest.revision, manifest.entries.length)
```

## Puertos

- **Implementa:** `ArtifactProvider`.
- **Consume:** `RunStore.valid` para la publicación.

## Errores

`Error` simples como `stale publication lease`, `artifact path collision`, `artifact byte budget exceeded`.

## Límites

- Valores predeterminados: 50.000 archivos, 256 MiB por archivo, 2 GiB por revisión, profundidad 128, tope absoluto de metadatos de 64 MiB.
- Las revisiones preparadas huérfanas no se recuperan automáticamente.
- Un host, sistema de archivos local.

## Véase también

- [Artefactos del espacio de trabajo](../guides/artifacts)
