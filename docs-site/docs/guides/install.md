---
title: Install brambo
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Install the SDK or CLI and verify the package version
scope: Published package installation
compatibility: Published packages support Node.js >=20
translationStatus: original
---
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Install brambo

Choose the package that matches the integration boundary. The SDK is for Node.js hosts; the CLI is a separate global command. Neither installs or authenticates a vendor executor.

:::info[Compatibility and release version]

Published packages support Node.js 20 or newer. Check the installed package with `npm ls`; the workspace documentation may describe the unreleased Next version.

:::

## Install the SDK

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

Import `runSession` from `@brambodev/session`; see [Your first session](../tutorials/first-session) for a runnable example.

## Install the CLI

```bash
npm install --global @brambodev/cli
brambo --version
```

Select and install a supported executor separately. The CLI reports structured results; see [Run the CLI](../how-to/run-cli).

## Install contracts for an extension

```bash
npm install --save-dev @brambodev/contracts
```

Use public contracts when implementing an adapter or provider. Before publishing, run `pnpm build && pnpm proof:consumer-install` from a repository checkout to check packed exports and declarations.

## Verify the installed package

Run `npm ls @brambodev/session` (or the package you installed) and inspect its resolved version. Use the [GitHub Releases](https://github.com/brambodev/brambo/releases) page for release status; do not infer a release version from workspace documentation.

## Next step

Continue to [Configuration](./configuration) before selecting an executor or workspace.
