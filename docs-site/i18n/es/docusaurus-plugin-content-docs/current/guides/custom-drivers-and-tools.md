---
title: "Registrar drivers y herramientas"
audience: Integradores del SDK
prerequisites: Node.js >=20; SQLite >=24.15.0
outcome: Componer puertos con autoridad del host
scope: Orquestación durable del SDK
compatibility: Node.js >=20; SQLite >=24.15.0
translationStatus: translated
---

# Registrar drivers y herramientas

Registre integraciones ejecutables explícitamente en el host. La configuración selecciona identificadores estables registrados; el modelo nunca instala módulos, selecciona credenciales ni concede capacidades.

## Receta de composición

El host proporciona fábricas CLI/API y servicios vigentes de política y journal. Este driver de eco declara solo reconstrucción y cancelación previa al despacho. No es un agente de producción, sandbox ni implementación de protocolo de proveedor. Los adaptadores API permanecen en su límite existente; el motor no incorpora ramas de proveedores.

```ts
import { defineStandardSchema, type DriverFactory, type DriverServices, type JsonObject } from '@brambodev/contracts'
import { createDriverRegistry, createCliDriverFactory } from '@brambodev/orchestration'
import { createApiDriverFactory } from '@brambodev/adapter-api'
import type { ApiDriverOptions } from '@brambodev/adapter-api'
import { createWorkflowToolDispatcher } from '@brambodev/session'
import type { WorkflowToolDispatcherOptions } from '@brambodev/session'

// Host adapters and authorization/journal/secret services; never model-controlled.
declare const cli: Parameters<typeof createCliDriverFactory>[0]
declare const api: ApiDriverOptions
declare const services: DriverServices
declare const toolPolicy: Omit<WorkflowToolDispatcherOptions, 'tools'>
const manifest: DriverFactory['manifest'] = { id: 'custom-echo', version: '1', kind: 'custom',
  capabilities: ['context-reconstruction', 'cancellation'],
  configurationSchema: defineStandardSchema(value => ({ value })) }
const drivers = createDriverRegistry()
drivers.register(createCliDriverFactory(cli))
drivers.register(createApiDriverFactory(api))
drivers.register({ manifest, async create() { return { manifest, async run(request) {
  return { result: request.signal.aborted
    ? { status: 'cancelled', data: null, summary: 'cancelled', errors: [{ message: 'aborted' }] }
    : { status: 'ok', data: request.context, summary: 'echo' } }
} } } })
const custom = await drivers.resolve('custom-echo').create({}, services)
const dispatch = createWorkflowToolDispatcher({ ...toolPolicy, tools: [{
  id: 'read-label', effect: 'read-only',
  inputSchema: defineStandardSchema<JsonObject>(value =>
    value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === 1 && typeof (value as JsonObject).label === 'string'
      ? { value: value as JsonObject } : { issues: [{ message: 'Expected only a string label' }] }),
  async execute(args) { return args.label ?? null },
}] })
void custom; void dispatch
```

## Evidencia de capacidades

| Integración | Evidencia local verificada | No establecido |
|---|---|---|
| OpenAI y Anthropic | Fixtures sintéticos oficiales, composición durable, ID de llamada/herramienta/argumentos/señal y efecto/reproducción autorizados | Endpoints activos, cobertura de cuentas/modelos o continuación nativa |
| API de terceros | `createApiDriverFactory` genérica con adaptadores inyectados y despacho autorizado | Seguridad de cualquier SDK/proveedor; el wrapper genérico rechaza continuación nativa |
| CLI | Spawner/driver inyectados, ciclo de vida y rechazo de capacidades; ejecución sincrónica existente | Binarios/versiones reales, terminación de procesos o portabilidad de sesión nativa |
| Driver/herramienta propios | Suite pública, validación de esquema, autorización vigente y journal redactado | Sandbox de closures del host o efectos externos arbitrarios exactamente una vez |
| Runtime/backend | Materialización privada, fencing y cláusulas públicas idénticas SQLite/no SQLite | SQLite distribuido, aceptación alojada Windows/Linux o instalación empaquetada |

Solo es efectiva la intersección de driver, runtime y política vigente. Las capacidades requeridas no compatibles se rechazan; la degradación opcional es explícita. La suite pública usa pruebas aisladas activas y cancelación previa al despacho; no demuestra continuación nativa, cancelación en curso ni interceptación. Las herramientas CLI no interceptadas o alojadas por el proveedor no deben declararse como controles de sandbox local.

## Aprobaciones, secretos e incertidumbre

Los argumentos son JSON no confiable. Proporcione esquemas estrictos y autorice/apruebe al principal/run/espacio antes de admitir efectos o consultar secretos. Las referencias secretas pertenecen al registro del host, no a los argumentos; redacte antes del journal, observadores, resultados y contexto. Las closures del host pueden filtrar secretos o evitar controles: son código de confianza, no aislamiento. Ante cambios de usuario/dispositivo/proveedor, reautorice y resuelva credenciales independientemente; no se heredan aprobaciones ni identidad nativa.

Los efectos completados reproducen resultados registrados sin volver a ejecutar. Un efecto no idempotente incompleto requiere conciliación, no repetición ciega. La cancelación es intención hasta la devolución confiable; el host debe aplicar pruebas más fuertes de terminación/aislamiento. Consulte [orquestación durable](./durable-orchestration.md) y [ejecutores API](./api-executors.md).
