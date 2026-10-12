---
title: Artefactos del espacio de trabajo
audience: Platform engineers moving workspace content through durable runs
prerequisites: Completed the durable workflow tutorial
outcome: Preparar, publicar, leer y materializar revisiones inmutables del espacio de trabajo y conocer sus límites
scope: ArtifactProvider y @brambodev/workspace-artifacts-local en 0.5.x
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# Artefactos del espacio de trabajo

Las ejecuciones durables nunca comparten un directorio mutable. El contenido del espacio de trabajo se mueve como revisiones inmutables direccionadas por contenido mediante un `ArtifactProvider`, y una revisión solo pasa a formar parte de una ejecución cuando la propia confirmación por comparación e intercambio de la ejecución la referencia.

## El puerto

| Método | Hace |
|---|---|
| `stage(namespace, directory)` | Copia un directorio en almacenamiento inmutable y devuelve un `ArtifactManifest` (`revision` más `entries` con `path`, `digest`, `size`, `executable`). No asocia nada. |
| `publish(ref, manifest, lease)` | Asocia una revisión preparada a `ref.workspaceId`, solo bajo un lease vigente que cubra `workspace:<id>`. No hace avanzar la ejecución. |
| `manifest(ref)` | Devuelve el manifiesto de una revisión publicada. |
| `read(ref, path)` | Devuelve los bytes de un archivo, verificados con su resumen criptográfico. |
| `materialize(ref, directory)` | Escribe una revisión publicada en un directorio nuevo y devuelve un `WorkspaceHandle`. |

Los manifiestos rechazan rutas inseguras: barras invertidas, `:<>"|?*`, caracteres de control, segmentos vacíos, `.` o `..`, puntos o espacios finales, nombres reservados de Windows y duplicados.

## El proveedor local

```ts
import { createLocalArtifactProvider } from '@brambodev/workspace-artifacts-local'
import { openSqliteRunStore } from '@brambodev/workflow-store-sqlite'

const store = await openSqliteRunStore({ path: './workflow.sqlite' })
const artifacts = createLocalArtifactProvider({ rootDir: './private-artifacts', store })
```

El `store` solo se usa para comprobar `valid(lease)` al publicar, una vez antes de escribir la asociación y otra dentro de la escritura; un lease que perdió su reclamación falla con `stale publication lease`.

En disco, bajo `rootDir/namespaces/<sha256(namespace)>/`, guarda `blobs/` direccionados por contenido, manifiestos canónicos de revisión en `revisions/` y asociaciones por espacio de trabajo en `workspaces/`. Cada escritura es un archivo temporal, `fsync` y después un renombrado.

| Límite | Valor predeterminado |
|---|---|
| Archivos por revisión | 50.000 |
| Bytes por archivo | 256 MiB |
| Bytes por revisión | 2 GiB |
| Entradas de directorio recorridas | 100.000 |
| Profundidad | 128 |
| Longitud de ruta | 4.096 bytes |
| Metadatos | 64 MiB (también el máximo absoluto) |

Puede cambiar cualquiera con `limits`. La preparación también rechaza enlaces simbólicos y archivos no regulares, un directorio de origen que se solapa con `rootDir`, un archivo sustituido entre la apertura y la lectura, y dos rutas que colisionan tras la normalización Unicode y el paso a minúsculas.

`materialize` rechaza un destino que se solapa con la raíz o que ya existe, escribe los archivos con modo `0600` y los directorios con `0700`, y elimina la salida parcial si falla.

## Durabilidad y trabajo interrumpido

- **Preparado no es progreso.** Una caída tras la preparación deja una revisión huérfana que nada referencia. Las huérfanas no se recuperan automáticamente; programe su propia limpieza.
- **Publicado no es confirmado.** La publicación asocia una revisión a un espacio de trabajo; la ejecución solo avanza cuando la confirmación CAS del motor la registra. Un escritor que perdió su lease no puede publicar, y la ejecución no puede referenciar una revisión de un escritor obsoleto.
- **Una sola máquina.** El proveedor local supone un único host y un sistema de archivos local. Para otras topologías, colóquelo detrás del coordinador y use `createRemoteArtifactProvider`, o implemente su propio `ArtifactProvider`.
- **Los fallos son errores simples** con mensajes descriptivos (`artifact path collision`, `artifact byte budget exceeded`, `unsafe directory path: symlink or non-directory`); no llevan código.

## Próximo paso

Vea cómo usa el motor estas llamadas en [Su primer flujo durable](../tutorials/durable-workflow) y la tabla completa de límites en [Semántica durable](../reference/durable-semantics).
