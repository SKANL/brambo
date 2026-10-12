---
title: Principios de diseño
audience: Developers evaluating brambo and port authors
prerequisites: Node.js >=20
outcome: Predecir cómo se comporta cualquier paquete de brambo en sus bordes
scope: Reglas transversales impuestas en el código y las pruebas de 0.5.x
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# Principios de diseño

Cinco reglas se repiten en todos los paquetes. Conocerlas permite predecir cómo se comporta una parte desconocida de brambo cuando algo falta, está mal formado, es concurrente o es antiguo. Cada regla indica dónde se impone, porque un principio que no se prueba es solo una preferencia.

## Fallar de forma cerrada

Cuando brambo no puede demostrar que algo es seguro o válido, lo rechaza con un error con código en lugar de suponer un valor por defecto.

| Ejemplo | Comportamiento |
|---|---|
| Límites de presupuesto del kernel | Un límite `NaN` o negativo se rechaza (`BRAMBO_KERNEL_ACTION_INVALID`) porque desactivaría el límite en silencio. |
| `mode` de proyección | Cualquier valor distinto de `apply`, `inspect` u omitido lanza `BRAMBO_PROJECTION_MODE_INVALID`; nunca se asume un valor, porque el modo decide si brambo escribe archivos que no son suyos. |
| Capacidades de sandbox | Un proveedor que no aporta evidencia de cada control requerido se rechaza antes de que exista una sesión (`BRAMBO_SANDBOX_CAPABILITY_UNAVAILABLE`). |
| Auditoría de permisos | Si falla el sink de auditoría, una decisión `ask` sigue siendo `ask`; nada se aprueba automáticamente. |
| Entrega tras revisión | En `provenance`, un hallazgo bloqueante con causalidad `unknown` bloquea la entrega. |
| Respuestas del almacén remoto | `workflow-remote` rechaza una respuesta que no repite el filtro que pidió. |
| Recuperación durable | La falta de evidencia de efectos no prueba que no hubo efectos: un intento no demostrado pasa a `blocked`, no se reintenta. |

## Instantánea defensiva y congelación

Las entradas se leen una vez, se validan y se copian; brambo opera sobre la copia. Las salidas que cruzan una frontera se congelan.

- `runSession` lee cada campo de opciones una vez antes de su primer `await`, de modo que un accesor no puede responder un valor en la validación y otro en el uso.
- El kernel lee cada campo de una definición de acción una sola vez con `Object.hasOwn`, cerrando huecos de contaminación de prototipos y de comprobación frente a uso, y congela contextos de etapa, handles y registros.
- Las políticas de sandbox, los hechos de capacidad, los permisos y los registros de drivers son copias congeladas.
- `workflow-remote` y el worker del coordinador aplican `structuredClone` a los argumentos en el momento de la llamada.

La consecuencia práctica: modificar un objeto después de pasarlo a brambo no afecta a la ejecución, y modificar un objeto que devolvió brambo lanza un error en modo estricto.

## Registro de propiedad

brambo anota lo que escribe para poder revertir solo su propia salida.

- La proyección escribe primero el archivo nativo del proveedor y después anota la reclamación en `~/.brambo/projection-ledger.json`, de modo que una caída reclama de menos. Las desviaciones (`edited`, `removed-by-user`, `foreign-collision`) se informan y nunca se resuelven escribiendo.
- Los espacios de trabajo llevan un registro de propiedad (`.brambo-workspace.json` para el local y un registro bajo el directorio de estado para git). Los ayudantes de eliminación solo borran directorios con un registro coincidente, y la eliminación de un git worktree se niega ante un árbol con cambios o un commit que ninguna referencia contiene.
- Un registro ilegible se informa y se deja intacto; nunca se sobrescribe.

## Versionar por rechazo

Cada formato persistido y cada contrato llevan una versión. Una discrepancia se rechaza con un error con código; brambo nunca lee parcialmente ni migra.

| Formato | Comprobación de versión |
|---|---|
| Almacén del registro | `STORE_VERSION = 1`; un almacén más nuevo lanza `BRAMBO_REGISTRY_STORE_VERSION_MISMATCH`. |
| Almacenes de memoria | Sello de formato; una discrepancia lanza `BRAMBO_CONTRACT_MEMORY_STORE_VERSION_MISMATCH`. Publicado como cláusula en la suite de contrato de memoria. |
| Almacén SQLite de ejecuciones | Versión de esquema 1; los esquemas desconocidos lanzan `BRAMBO_WORKFLOW_SCHEMA_UNSUPPORTED`. |
| Proveedores de executors | `manifest.contractVersion` debe ser `'1'`. |
| Protocolo y registros | `WORKFLOW_PROTOCOL_VERSION`, `SANDBOX_POLICY_VERSION`, `LOG_RECORD_VERSION`, `PROJECTION_LEDGER_VERSION`. |

Un almacén ausente no es una discrepancia: se sella y se usa. Actualizar a través de un cambio de formato implica instalar una versión al menos tan nueva como la que escribió los datos.

## Ausencia tipada

La información que brambo no pudo observar se informa como ausencia explícita o como error con código, nunca como `0`, `''` o un `null` sin más. Un servicio del kernel que no se provee es `{ kind: 'absent' }`. El uso que un proveedor no publica se informa con un motivo (`BRAMBO_USAGE_NO_SURFACE`, `BRAMBO_USAGE_NOT_OBSERVED`), no como cero tokens.

## La arquitectura como prueba

La dirección de dependencias entre paquetes la imponen `topology.test.ts` y `eslint.config.js`, no un diagrama. Consulte [Arquitectura y topología](./architecture).
