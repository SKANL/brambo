---
title: Registry
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Understand this documentation page
scope: This page
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
Esta página documenta el paquete público correspondiente. La interfaz técnica canónica se conserva abajo para mantener ejemplos y nombres exactos.



# @brambo/registry

Canonical environment registry: scoped storage (`global | project | agent`) for
skill and mcp-server entry envelopes (defined in `@brambo/contracts`), with machine-scoped write serialization via a hand-rolled
portable lockfile protocol, atomic persistence (temp + rename), and write-time
path normalization for paths under the user home directory.

Mounts as a real plugin on the `@brambo/kernel` lifecycle via
`createRegistryPlugin()` — activation wires the store, disposal releases any
held lock.
