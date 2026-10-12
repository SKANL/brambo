---
title: Estado de los paquetes
audience: Desarrolladores que eligen de qué paquetes de brambo depender
prerequisites: Ninguno
outcome: Saber qué significan Estable, Experimental y Congelado y qué evidencia respalda la insignia de cada paquete
scope: Insignias de estado de los 28 paquetes en 0.5.x
compatibility: Todos los paquetes 0.5.x
translationStatus: translated
---

# Estado de los paquetes

Cada página de paquete lleva una insignia de estado. La insignia es una afirmación sobre evidencia, no sobre calidad ni popularidad. brambo es anterior a 1.0 en todos los estados: siguen siendo posibles cambios incompatibles, que se señalan en el registro de cambios.

## Definiciones

| Estado | Significado | Evidencia exigida |
|---|---|---|
| Estable | Se espera que la superficie se mantenga; los cambios son deliberados y se documentan. | La suite de pruebas del paquete pasa en CI; la suite de contrato de su puerto se ejecuta contra él cuando existe; la ruta de sesión o de CLI de brambo lo ejercita. |
| Experimental | Probado y utilizable, pero la superficie aún puede cambiar. | La suite de pruebas del paquete pasa en CI. Le falta al menos un criterio de Estable: un consumidor en el repositorio en la ruta de sesión o de CLI, o evidencia de plataforma (por ejemplo, conformidad en hosts que CI no ejecuta). |
| Congelado | Se mantiene funcionando, sin desarrollo. | Los defectos de protocolo verificados se corrigen con una prueba que falla y luego pasa; no se planean funcionalidades nuevas. |

Un paquete pasa de Experimental a Estable solo cuando la evidencia que falta existe en el repositorio; el cambio se registra en el registro de cambios. El estado no se guarda en `package.json`.

## Fuente legible por máquina

Cada insignia se comprueba contra `docs-site/src/data/package-status.json`. `pnpm docs:check` falla cuando la insignia de una página de paquete no coincide con él. La tabla siguiente se redactó a partir del mismo archivo.

## Estado actual

| Paquete | Estado |
|---|---|
| [`@brambodev/adapter-acp`](../packages/adapter-acp) | Congelado |
| [`@brambodev/adapter-anthropic`](../packages/adapter-anthropic) | Experimental |
| [`@brambodev/adapter-api`](../packages/adapter-api) | Experimental |
| [`@brambodev/adapter-cli`](../packages/adapter-cli) | Estable |
| [`@brambodev/adapter-openai`](../packages/adapter-openai) | Experimental |
| [`@brambodev/cli`](../packages/cli) | Estable |
| [`@brambodev/contracts`](../packages/contracts) | Estable |
| [`@brambodev/delegation`](../packages/delegation) | Experimental |
| [`@brambodev/environment`](../packages/environment) | Estable |
| [`@brambodev/kernel`](../packages/kernel) | Estable |
| [`@brambodev/lock`](../packages/lock) | Estable |
| [`@brambodev/memory-filesystem`](../packages/memory-filesystem) | Experimental |
| [`@brambodev/memory-sqlite`](../packages/memory-sqlite) | Experimental |
| [`@brambodev/orchestration`](../packages/orchestration) | Experimental |
| [`@brambodev/projection`](../packages/projection) | Estable |
| [`@brambodev/provenance`](../packages/provenance) | Experimental |
| [`@brambodev/registry`](../packages/registry) | Estable |
| [`@brambodev/runtime-local`](../packages/runtime-local) | Experimental |
| [`@brambodev/sandbox-local`](../packages/sandbox-local) | Experimental |
| [`@brambodev/sandbox-remote`](../packages/sandbox-remote) | Experimental |
| [`@brambodev/sandbox`](../packages/sandbox) | Experimental |
| [`@brambodev/session`](../packages/session) | Estable |
| [`@brambodev/workflow-coordinator`](../packages/workflow-coordinator) | Experimental |
| [`@brambodev/workflow-remote`](../packages/workflow-remote) | Experimental |
| [`@brambodev/workflow-store-sqlite`](../packages/workflow-store-sqlite) | Experimental |
| [`@brambodev/workspace-artifacts-local`](../packages/workspace-artifacts-local) | Experimental |
| [`@brambodev/workspace-git-worktree`](../packages/workspace-git-worktree) | Estable |
| [`@brambodev/workspace-local`](../packages/workspace-local) | Estable |

## Próximo paso

Consulte las [limitaciones conocidas](./known-limitations) para ver lo que cada paquete Experimental aún no demuestra.
