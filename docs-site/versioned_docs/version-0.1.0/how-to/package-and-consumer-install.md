---
title: Package and install for a consumer
audience: Developers and maintainers
prerequisites: Node.js >=20 for published consumers; Node.js >=24 for repository development
outcome: Pack a package and verify it from an isolated consumer project
scope: Published package consumption
compatibility: Consumer proof covers published package imports on Node.js >=20; repository tooling requires Node.js >=24
translationStatus: original
---
# Package and install for a consumer

Consumers resolve published entrypoints to `dist`; they do not need the repository-only `panda-source` condition or development toolchain.

## Install a published package

```bash
npm install @skanl/panda-session
```

Port authors can install only the contracts package:

```bash
npm install --save-dev @skanl/panda-contracts
```

The contracts-only scenario verifies that a third-party provider compiles against shipped declarations without pulling in the monorepo.

## Build and pack locally

```bash
pnpm install
pnpm build
pnpm --filter @skanl/panda-contracts pack --pack-destination ./.scratch
```

Inspect the package manifest before publishing, and do not copy repository `node_modules` into a consumer project.

## Verify from isolation

```bash
mkdir .scratch/consumer
cd .scratch/consumer
npm init --yes
npm install ../../packages/contracts/*.tgz
node -e "import('@skanl/panda-contracts').then(() => console.log('import ok'))"
```

The repository consumer proof also checks package contents, imports, dependency boundaries, and `WorkspaceProvider` declarations.

## Runtime boundary

Repository development requires Node.js `>=24`. Published-package proof covers Node.js `>=20`; this is the consumer claim backed by repository evidence. Optional providers and vendor executors may have narrower measured requirements.

## Next step

Read [Compatibility](../reference/compatibility) before choosing optional providers or adapters.
