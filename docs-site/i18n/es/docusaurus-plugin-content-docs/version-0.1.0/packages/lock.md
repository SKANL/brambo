---
title: Lock
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Understand this documentation page
scope: This page
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
Esta página documenta el paquete público correspondiente. La interfaz técnica canónica se conserva abajo para mantener ejemplos y nombres exactos.



# @brambo/lock

The hand-rolled portable lockfile protocol brambo uses to serialize writes to a
file across PROCESSES: exclusive create, a holder document written through the
creating handle, stale-lock breaking with reported evidence, and an
ownership-safe release that restores a successor's lock rather than deleting it.

It is a LEAF. It depends on `@brambo/contracts` and nothing else (AD-2), and it
raises its own neutral codes — `BRAMBO_LOCK_CONTENTION` and
`BRAMBO_LOCK_UNAVAILABLE` — so no consumer inherits another package's vocabulary
(AD-7). `@brambo/registry` and `@brambo/projection` each translate those two codes
into their own at their own boundary.

This code was moved here from `@brambo/registry`, where it had been the store's
private serialization since Story 2.x. Nothing about the algorithm changed;
duplicating it into a second consumer was refused because two copies of
concurrency-critical code drifting is the failure a lock exists to prevent.
