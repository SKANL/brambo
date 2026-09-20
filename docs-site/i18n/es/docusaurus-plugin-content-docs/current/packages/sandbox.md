---
title: sandbox
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Elegir y administrar un proveedor de sandbox mediante el SDK
scope: Esta página
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# @skanl/brambo-sandbox

`@skanl/brambo-sandbox` es la capa neutral del SDK para seleccionar un sandbox, crear una sesión administrada y validar el límite alrededor de la ejecución. **No** implementa aislamiento del sistema operativo por sí misma.

## Ruta rápida

1. Registra una o más implementaciones de `SandboxProvider`.
2. Crea un resolver con `createSandboxProviderResolver`.
3. Solicita una sesión con una política validada y snapshots.
4. Libera la sesión cuando termine el ciclo de vida que administra el host.

```ts
import { createSandboxProviderResolver } from '@skanl/brambo-sandbox'

const resolver = createSandboxProviderResolver([provider])
const session = await resolver.createSession({ policy, snapshots: [] })

try {
  const result = await session.execute({ argv, cwd, environment, policy })
  console.log(result.status, result.enforcement)
} finally {
  await session.dispose()
}
```

## Qué garantiza el resolver

| Tema | Comportamiento |
| --- | --- |
| Selección | Elige el primer proveedor registrado cuyas capacidades prueban la política solicitada. |
| Identidad de la política | La ejecución debe usar la misma política de creación, incluidas capacidades y límites. |
| Validación del resultado | Normaliza y valida los resultados antes de devolverlos. |
| Capacidad no soportada | Falla de forma cerrada con un error codificado, sin debilitar la política. |
| Ciclo de vida | La sesión deja de ser reutilizable al comenzar la liberación; liberar varias veces reutiliza la misma promesa. |
| Superficies opcionales | `openStdio`, `snapshot` y `restore` quedan no disponibles si el proveedor no las expone. |

## Superficies de ejecución

`execute()` recibe un vector exacto de argumentos. El resolver no interpreta comandos de shell ni agrega un shell. `openStdio()` es una superficie opcional para comunicación stdio de larga duración. Los snapshots son solo de archivos: no restauran metadatos de directorios ni estado de procesos, y una identidad desconocida debe fallar de forma cerrada.

El paquete valida la identidad del proveedor en la evidencia de enforcement devuelta. Un resultado de otro proveedor o con campos inválidos se rechaza y la sesión pasa a estado incierto en vez de reutilizarse como si fuera segura.

## Lo que este paquete no afirma

- No es un sandbox del sistema operativo ni crea uno.
- Detectar un proveedor no prueba que el host pueda aplicar todos los controles.
- Seleccionar un proveedor no prueba aislamiento de red, filesystem, procesos o recursos más allá de la evidencia validada.
- El paquete no define un protocolo remoto.

Usa `@skanl/brambo-sandbox-local` para proveedores conservadores respaldados por el host o `@skanl/brambo-sandbox-remote` para un transporte remoto inyectado.
