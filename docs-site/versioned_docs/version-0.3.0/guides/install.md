---
title: Install brambo
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Understand this documentation page
scope: This page
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# Install brambo

Published packages support Node `>=20`. Repository development uses Node `>=24` and pnpm `11.23.0`.

```bash
npm install @brambodev/session
```

For port authors:

```bash
npm install --save-dev @brambodev/contracts
```

The contracts-only package is tested as a packed consumer. Run `pnpm build && pnpm proof:consumer-install` when changing exports or package metadata.
