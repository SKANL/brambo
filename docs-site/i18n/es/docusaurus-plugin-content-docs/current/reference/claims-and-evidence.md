---
title: Afirmaciones y evidencia
audience: Developers, maintainers y reviewers que evalúan panda
prerequisites: Familiaridad con los paquetes públicos y las superficies de documentación
outcome: Rastrear las afirmaciones públicas hasta evidencia ejecutable del repositorio e identificar lo que sigue sin verificar
scope: Afirmaciones públicas sobre compatibilidad, packaging, arquitectura, límites de API, sandbox y procedencia de releases
compatibility: Los paquetes publicados están medidos desde Node.js >=20; el desarrollo del repositorio requiere Node.js >=24
translationStatus: translated
---
# Afirmaciones y evidencia

Esta página es la matriz de evidencia para las afirmaciones públicas de panda. Separa una garantía ejecutable del repositorio de una intención de diseño documentada, un resultado medido pero acotado y un hecho administrativo o externo que este repositorio no puede probar por sí solo.

## Cómo leer la matriz

```text
VERIFIED       Un test, workflow o proof ejecutable falla si se viola la afirmación.
MEASURED       Una ejecución acotada prueba la afirmación, pero el resultado se limita a su matriz declarada.
PARTIAL        La evidencia del repositorio cubre una parte; el límite restante está explicitado.
UNVERIFIED     El repositorio no contiene evidencia ejecutable suficiente para la afirmación.
ADMIN-ONLY     El hecho depende de configuración de GitHub, npm, el registry o el host fuera del repositorio.
```

Las rutas son relativas al repositorio. Los nombres de tests identifican la cláusula ejecutable que hay que inspeccionar; la prosa de un README o documento de arquitectura es contexto, no reemplazo de un gate que pueda fallar.

## Matriz de evidencia

| Afirmación pública | Estado | Evidencia concreta | Límite o restricción |
| --- | --- | --- | --- |
| **Piso de Node publicado:** los paquetes publicables admiten Node.js `>=20`. | VERIFIED / MEASURED | `packages/contracts/test/versions.test.ts` revisa cada manifest y la matriz `consumer-floor`; `.github/workflows/ci.yml` ejecuta el smoke test del consumer empaquetado en `20`, `22.13.0`, `22.18.0` y `24`; `scripts/consumer-smoke.mjs` importa los tarballs empaquetados en un consumer de Node plano. | Es el piso medido para paquetes/consumers. No es el piso de desarrollo del repositorio y no prueba cada provider opcional en cada release de Node. |
| **Piso de desarrollo:** los checks y builds del repositorio requieren Node.js `>=24`. | VERIFIED | El `package.json` raíz declara `engines.node: ">=24"`; `packages/contracts/test/versions.test.ts` compara el piso raíz con el leg de CI `build-pack`; `.github/workflows/ci.yml` compila en Node `24`. | Es una restricción de tooling y desarrollo, no una afirmación de que los consumers necesiten Node 24. |
| **Packaging para consumers:** los artefactos empaquetados contienen la superficie construida y se importan correctamente fuera del repositorio. | VERIFIED | `scripts/pack-publishable.mjs` empaqueta el roster publicable declarado; `packages/session/test/consumer-install.proof.ts` instala artefactos empaquetados en un consumer aislado y revisa declaraciones/runtime; `scripts/consumer-smoke.mjs` prueba imports con Node plano; `.github/workflows/ci.yml` ejecuta tanto el proof de instalación como el job `consumer-floor`. | El proof cubre el roster declarado y la matriz de Node del repositorio. No prueba bundlers, sistemas operativos ni aplicaciones consumidoras arbitrarias. |
| **Topología de paquetes:** los imports fluyen estrictamente hacia abajo y el kernel no tiene dependencias de paquetes en runtime. | VERIFIED | `packages/contracts/test/topology.test.ts` escanea los imports de todos los paquetes contra el orden de tiers declarado y fuerza violaciones upward, sibling, paquete desconocido y kernel; `packages/kernel/test/guard.test.ts` refuerza el límite del kernel; los guards específicos agregan restricciones locales. | La regla universal de topología y los guards específicos cubren riesgos distintos; un paquete sin guard propio no queda exceptuado del test universal. |
| **Errores tipados:** los callers pueden rutear por códigos estables de `PandaError` en vez de parsear mensajes. | VERIFIED | `packages/contracts/src/errors.ts` define `PandaError` y `PANDA_ERROR_CODES`; `packages/contracts/test/errors.test.ts` revisa la forma estable y la convención de nombres; tests de providers como `packages/workspace-local/test/provider.test.ts` comprueban fallos reales con código. | Un código es estable solo cuando forma parte del contrato exportado y su comportamiento sigue cubierto; el texto libre del error no es una API de routing. |
| **Ownership de projection:** panda registra ownership en su ledger y no reclama un namespace de markers inventado dentro de archivos vendor. | VERIFIED | `packages/contracts/test/projection.test.ts` rechaza el vocabulario de markers retirado, versiona el ledger y comprueba la autoridad de target/file/native-location/content-hash; `packages/projection/test/ledger.test.ts`, `packages/projection/test/drift.test.ts` y `packages/projection/test/native-projection.test.ts` prueban ledger, drift y ubicaciones nativas. | La garantía se refiere a las decisiones y escrituras de ownership de panda. No significa que panda controle archivos o ubicaciones que el vendor no lee. |
| **Límites del sandbox y de plataforma:** la validación de policy es explícita, se comprueba el containment de paths y las implementaciones host se testean por plataforma. | PARTIAL / MEASURED | `packages/contracts/test/sandbox.test.ts` fuerza validación de policy, capabilities, paths, snapshots, resource limits y argv exacto; `packages/sandbox-local/test/host-conformance/linux.test.ts`, `macos.test.ts` y `windows.test.ts` cubren el comportamiento por host; `.github/workflows/sandbox-conformance.yml` ejecuta las suites sobre substrates nativos. | Panda **no** afirma aislamiento universal a nivel de OS, control irrestricto de procesos vendor ni enforcement idéntico en cada host. Una capability de host o vendor se trata como unavailable cuando no se puede probar. |
| **Superficie de API:** la documentación generada refleja los entrypoints públicos de los paquetes y no un inventario manual inventado. | VERIFIED | `scripts/publishable-packages.json` define el roster; `scripts/generate-api-docs.mjs` genera TypeDoc desde los entrypoints; `scripts/validate-api-docs.mjs` valida esos entrypoints; `docs-site/docs/reference/api.md` describe la superficie generada. | El HTML generado es un artefacto de build y no una garantía versionada por sí misma. Los archivos internos no son API pública solo porque existan. |
| **Procedencia de release:** el workflow de release solicita provenance de npm y revisa el resultado en el registry antes de terminar. | PARTIAL | `.github/workflows/release.yml` empaqueta y hace smoke test antes de publicar, publica con `--provenance` y ejecuta `scripts/assert-provenance.mjs`; ese script lee metadata del registry y distingue paquetes ausentes de paquetes publicados sin attestation. | El repositorio prueba el workflow y el checker, no el estado público actual del registry ni la configuración de las cuentas de GitHub/npm que lo ejecutan. |

## Afirmaciones no verificadas y solo administrativas

Estas afirmaciones no deben presentarse como hechos probados por el repositorio salvo que se adjunte evidencia externa:

- **ADMIN-ONLY:** branch protection de GitHub, reviewers obligatorios, approvals de environments, almacenamiento de secrets o status checks requeridos están configurados como corresponde.
- **ADMIN-ONLY:** la organización de npm, la política de acceso de paquetes, la identidad de publicación, la política de two-factor y la relación con el trusted publisher están configuradas como corresponde.
- **ADMIN-ONLY:** un release público particular está publicado, completo y asociado al commit esperado. El workflow puede revisar sus pasos, pero el estado del registry requiere igualmente la aserción del registry.
- **UNVERIFIED:** cualquier garantía de sandbox a nivel de OS más fuerte que la evidencia de conformance específica de cada plataforma.
- **UNVERIFIED:** comportamiento, autenticación, rate limits o defaults de permisos de executors vendor fuera de los adapters y tests de contratos de panda.

## Regla de revisión

Cuando cambie una afirmación pública, actualizá la afirmación y su evidencia concreta juntas. Si ningún gate ejecutable puede imponerla, etiquetala como `PARTIAL`, `UNVERIFIED` o `ADMIN-ONLY` en vez de convertir prosa en garantía.
