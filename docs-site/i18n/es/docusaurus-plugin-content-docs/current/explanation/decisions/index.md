---
title: Decisiones de arquitectura
audience: Developers evaluating brambo and contributors
prerequisites: None
outcome: Encontrar la razón registrada de cada decisión estructural de brambo
scope: Índice de registros de decisiones de arquitectura
compatibility: brambo 0.5.x
translationStatus: translated
---
# Decisiones de arquitectura

Estos registros explican por qué las fronteras de brambo están donde están. Cada uno indica el contexto, la decisión, sus consecuencias y los archivos del repositorio que la imponen o la materializan, de modo que la afirmación se puede comprobar con el código. Los comentarios del código se refieren a los dos primeros como AD-1 y AD-2.

| Registro | Decisión |
|---|---|
| [ADR-001](./adr-001) | Microkernel sin dependencias |
| [ADR-002](./adr-002) | Puertos en contracts y una topología descendente impuesta |
| [ADR-003](./adr-003) | Tres mundos sobre un núcleo compartido |
| [ADR-004](./adr-004) | Validación escrita a mano, que falla de forma cerrada, tras Standard Schema |
| [ADR-005](./adr-005) | Versionar por rechazo, nunca migrar |
| [ADR-006](./adr-006) | CLI de proveedores como registros de rasgos; executors de API mediante un registro explícito |
| [ADR-007](./adr-007) | brambo no es un sandbox; la autoridad pertenece al host |
| [ADR-008](./adr-008) | Almacén de ejecuciones SQLite de autoridad única con CAS, leases y fencing |
| [ADR-009](./adr-009) | Proyección bajo un registro de propiedad |
| [ADR-010](./adr-010) | Congelar el cliente ACP |

Se añade un registro nuevo cuando un cambio altera una de estas fronteras; un registro existente se sustituye por otro en lugar de reescribirse.
