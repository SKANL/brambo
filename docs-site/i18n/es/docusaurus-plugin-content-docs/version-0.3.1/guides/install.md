---
title: Instalar brambo
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Instalar el SDK o CLI y verificar la versión del paquete
scope: Instalación de paquetes publicados
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Instalar brambo

Elige el paquete según el límite de integración. El SDK está pensado para hosts Node.js; el CLI es un comando global separado. Ninguno instala ni autentica un executor vendor.

:::info[Compatibilidad y versión publicada]

Los paquetes publicados admiten Node.js 20 o posterior. Comprueba el paquete instalado con `npm ls`; la documentación del workspace puede describir la versión Next, aún no publicada.

:::

## Instalar el SDK

<Tabs groupId="package-manager">
<TabItem value="npm" label="npm">

```bash
npm install @brambodev/session
```

</TabItem>
<TabItem value="pnpm" label="pnpm">

```bash
pnpm add @brambodev/session
```

</TabItem>
</Tabs>

Importa `runSession` desde `@brambodev/session`; consulta [Tu primera sesión](../tutorials/first-session) para ver un ejemplo ejecutable.

## Instalar el CLI

```bash
npm install --global @brambodev/cli
brambo --version
```

Elige e instala un executor compatible por separado. El CLI informa resultados estructurados; consulta [Ejecutar el CLI](../how-to/run-cli).

## Instalar contratos para una extensión

```bash
npm install --save-dev @brambodev/contracts
```

Usa los contratos públicos al implementar un adapter o provider. Antes de publicar, ejecuta `pnpm build && pnpm proof:consumer-install` desde un checkout del repositorio para verificar exports y declaraciones empaquetadas.

## Verificar el paquete instalado

Ejecuta `npm ls @brambodev/session` (o el paquete que instalaste) y revisa la versión resuelta. Consulta [GitHub Releases](https://github.com/brambodev/brambo/releases) para conocer el estado de publicación; no infieras la versión publicada a partir de la documentación del workspace.

## Siguiente paso

Continúa con [Configuración](./configuration) antes de elegir un executor o workspace.
