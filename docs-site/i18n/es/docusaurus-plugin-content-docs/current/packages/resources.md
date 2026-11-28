---
title: resources
audience: Desarrolladores que integran @brambodev/resources
prerequisites: Node.js >=20
outcome: Saber qué hace el paquete, cómo usarlo, qué puertos toca y cuáles son sus límites
scope: '@brambodev/resources 0.5.x'
compatibility: Node.js >=20
translationStatus: translated
---
import Badge from '@site/src/components/Badge'

# @brambodev/resources

<Badge status="experimental">Experimental</Badge>

*Experimental: probado y usable, pero su superficie todavía puede cambiar y tiene menos evidencia de plataforma o menos consumidores en el repositorio que los paquetes estables.* [Criterios de estado](../reference/package-status).

Medición neutral respecto del proveedor para reclamar el estado del sistema de archivos que crean los agentes: contabilidad de bytes únicos consciente de hardlinks, un escaneo de árbol seguro frente a puntos de reanálisis, una clasificación de reclamación, una identidad sin colisiones y el plan que aprueba una persona.

| | |
|---|---|
| Mundo | De soporte |
| Nivel de topología | 1 |
| Node.js | `>=20` |
| Depende de | Nada (hoja) |

## Instalación

```bash
npm install @brambodev/resources
```

## Ejemplo

```ts
import { buildReclaimPlan, classifyWorktree, reclaimIdentity, scanTree } from '@brambodev/resources'

const measured = await scanTree('/home/me/.brambo/trees/w-1')
if (measured.kind === 'measured') {
  console.log(measured.logicalBytes, measured.uniqueBytes)
}

const verdict = classifyWorktree({ dirtyPaths: 0, unpushedCommits: 0, commitReachableFromRemote: true })
const plan = buildReclaimPlan([
  {
    identity: reclaimIdentity({ repositoryPath: '/srv/repo', worktreeId: 'w-1' }),
    verdict,
    logicalBytes: measured.kind === 'measured' ? measured.logicalBytes : 0,
    uniqueBytes: measured.kind === 'measured' ? measured.uniqueBytes : 0,
  },
])
console.log(plan.totals.uniqueBytes)
```

## Puertos

- **Implementa:** Nada. Es una hoja: no posee sistema de archivos, ni ejecutor, ni puerto de workspace.
- **Consume:** Nada. El reloj es un argumento, nunca se lee.

## Errores

`RangeError` ante una medición imposible (tamaño negativo, ventana de lease no positiva, conteo negativo) y `TypeError` cuando falta el repositorio o el id del worktree, o cuando dos candidatos comparten identidad. Un árbol inexistente no es un error: `scanTree` responde `{ kind: 'absent' }`.

## Límites

- Mide y clasifica; no elimina nada. La eliminación queda del lado de `@brambodev/workspace-git-worktree`.
- Los bytes únicos siguen el conteo de enlaces del inodo. Los sistemas de archivos que clonan bloques (reflink) o comprimen no se modelan, así que la cifra es una cota superior de lo que liberaría una eliminación.
- `reclaimIdentity` no normaliza mayúsculas; quien llama en un volumen insensible a mayúsculas pasa una ruta canónica.
- Los puntos de reanálisis y los directorios ya visitados se omiten y se cuentan, nunca se siguen.

## Ver también

- [workspace-git-worktree](./workspace-git-worktree)
- [Principios de diseño](../explanation/principles)
