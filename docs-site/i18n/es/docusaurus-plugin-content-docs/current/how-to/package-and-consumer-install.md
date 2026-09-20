---
title: Empaquetar e instalar para un consumer
audience: Desarrolladores y mantenedores
prerequisites: Node.js >=20 para consumers publicados; Node.js >=24 para desarrollo del repositorio
outcome: Empaquetar un paquete y verificarlo desde un proyecto consumer aislado
scope: Consumo de paquetes publicados
compatibility: La prueba de consumer cubre imports en Node.js >=20; las herramientas del repositorio requieren Node.js >=24
translationStatus: translated
---
# Empaquetar e instalar para un consumer

Los consumers resuelven entrypoints publicados hacia `dist`; no necesitan la condición `brambo-source` ni el toolchain de desarrollo.

## Instalar un paquete publicado

```bash
npm install @skanl/brambo-session
```

Los autores de ports pueden instalar solamente contracts:

```bash
npm install --save-dev @skanl/brambo-contracts
```

El escenario contracts-only verifica compilación contra declarations publicadas sin traer el monorepo.

## Build y pack local

```bash
pnpm install
pnpm build
pnpm --filter @skanl/brambo-contracts pack --pack-destination ./.scratch
```

Inspeccioná el manifest antes de publicar y no copies `node_modules` del repositorio al consumer.

## Verificar en aislamiento

```bash
mkdir .scratch/consumer
cd .scratch/consumer
npm init --yes
npm install ../../packages/contracts/*.tgz
node -e "import('@skanl/brambo-contracts').then(() => console.log('import ok'))"
```

La prueba de consumer también verifica contenido, imports, dependencias y declarations de `WorkspaceProvider`.

## Límite de runtime

El desarrollo del repositorio requiere Node.js `>=24`. La prueba de paquetes publicados cubre Node.js `>=20`; esa es la afirmación respaldada para consumers. Providers opcionales y executors vendor pueden requerir rangos más estrechos.

## Siguiente paso

Lee [Compatibilidad](../reference/compatibility) antes de elegir providers opcionales o adapters.
