---
sidebar_position: 1
title: Overview
slug: /
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Understand this documentation page
scope: This page
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# brambo

**brambo is an SDK-first microkernel for composing AI coding environments.** It turns a canonical Registry into native executor configuration and composes explicit sessions through typed ports.

## Quick path

```bash
npm install @brambo/session
```

Read the [installation guide](guides/install) and then the package guide for the boundary you own. The [contracts package](packages/contracts) is the smallest starting point for a third-party port.

## Honest boundaries

Brambo does not claim arbitrary JavaScript sandboxing, a concrete remote protocol, or OS isolation on platforms where the provider has not demonstrated enforcement.
