---
title: Escribir un ExecutorProvider
audience: Provider authors and SDK hosts
prerequisites: API executor guide
outcome: Escribir, registrar, empaquetar y verificar un proveedor de executors de API sin carga de código guiada por la configuración
scope: Manifiesto de ExecutorProvider, invariantes del adaptador, conformidad y descubrimiento opcional en 0.5.x
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# Escribir un ExecutorProvider

Un `ExecutorProvider` empaqueta un executor de API para que un host pueda registrarlo junto a OpenAI y Anthropic. Es un manifiesto más una fábrica `create(options)` que devuelve un `ExecutorAdapter`. El host instala su paquete, lo importa y llama a `registry.register(provider)`; un `providerId` en un perfil solo resuelve un proveedor registrado de esta forma. Nunca es un nombre de paquete npm, una ruta, una URL ni un comando.

## Un proveedor mínimo completo

Este proveedor envía el prompt mediante un transporte que inyecta el host y devuelve la respuesta. No tiene herramientas ni streaming, y es el contrato completo:

```ts
import { defineStandardSchema } from '@brambodev/contracts'
import type { ExecutorProvider, ExecutorProviderCreateOptions, ResultEnvelope, RunRequest } from '@brambodev/contracts'
import { normalizeProviderError } from '@brambodev/adapter-api'

/** What this provider needs from the network: one call per turn, injected by the host. */
export type EchoTransport = (body: { model: string; prompt: string }, signal?: AbortSignal) => Promise<{ text: string }>

interface EchoConfiguration { readonly uppercase?: boolean }

const configurationSchema = defineStandardSchema<EchoConfiguration>((value) => {
  if (value === undefined) return { value: {} }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { issues: [{ message: 'configuration must be an object' }] }
  const unknown = Object.keys(value).filter((key) => key !== 'uppercase')
  if (unknown.length > 0) return { issues: [{ message: `unknown configuration keys: ${unknown.join(', ')}` }] }
  const { uppercase } = value as { uppercase?: unknown }
  if (uppercase !== undefined && typeof uppercase !== 'boolean') return { issues: [{ message: 'uppercase must be a boolean' }] }
  return { value: { uppercase: uppercase as boolean | undefined } }
})

export function createEchoProvider(defaults: { transport?: EchoTransport } = {}): ExecutorProvider {
  return {
    manifest: {
      id: 'echo',
      displayName: 'Echo API',
      contractVersion: '1',
      packageName: '@acme/brambo-echo',
      capabilities: [],
      configurationSchema,
    },
    create(options: ExecutorProviderCreateOptions) {
      const transport = (options.transport as EchoTransport | undefined) ?? defaults.transport
      if (!transport) throw new Error('echo provider requires a host-supplied transport')
      const configuration = (options.selection.configuration ?? {}) as EchoConfiguration
      return {
        async run(request: RunRequest): Promise<ResultEnvelope> {
          if (request.signal?.aborted) return { status: 'cancelled', data: null, summary: 'cancelled', errors: [{ message: 'aborted before send' }] }
          try {
            const reply = await transport({ model: options.selection.model, prompt: request.prompt }, request.signal)
            const text = configuration.uppercase ? reply.text.toUpperCase() : reply.text
            return { status: 'ok', data: { text }, summary: text }
          } catch (error) {
            if (request.signal?.aborted) return { status: 'cancelled', data: null, summary: 'cancelled', errors: [{ message: 'aborted' }] }
            const normalized = normalizeProviderError({ providerId: 'echo', category: 'unavailable', message: error instanceof Error ? error.message : String(error) })
            return { status: 'failed', data: { providerError: normalized }, summary: 'echo request failed', errors: [{ message: normalized.message }] }
          }
        },
      }
    },
  }
}
```

## Registrarlo y ejecutarlo

```ts
import type { ExecutorSelection } from '@brambodev/contracts'
import { createExecutorRegistry } from '@brambodev/adapter-api'
import { createEchoProvider } from '@acme/brambo-echo'

const registry = createExecutorRegistry()
registry.register(createEchoProvider({ transport: async ({ prompt }) => ({ text: `echo: ${prompt}` }) }))

const selection: ExecutorSelection = { providerId: 'echo', model: 'echo-1', configuration: { uppercase: true } }
const adapter = registry.create(selection, { credential: undefined })
console.log(await adapter.run({ prompt: 'hello', workspace: { id: 'w', rootPath: process.cwd(), capabilities: ['read'] } }))
// { status: 'ok', data: { text: 'ECHO: HELLO' }, summary: 'ECHO: HELLO' }
```

El registro valida la selección contra su esquema antes de ejecutar `create`. `configuration: { colour: 'red' }` se rechaza con `BRAMBO_EXECUTOR_PROVIDER_SELECTION_INVALID`; un segundo proveedor con el mismo identificador es `BRAMBO_EXECUTOR_PROVIDER_DUPLICATE_REGISTRATION`; un identificador desconocido es `BRAMBO_EXECUTOR_PROVIDER_UNKNOWN`; y un identificador con barra como `@acme/brambo-echo` se rechaza como identificador de proveedor inválido en lugar de importarse.

Ambos fragmentos se comprobaron con el compilador y se ejecutaron contra el código fuente de 0.5.x al redactar esta página. El argumento de opciones de `registry.create` es `Omit<ExecutorProviderCreateOptions, 'selection'>`: la selección viaja solo como primer argumento y el registro entrega su copia validada al proveedor.

## El manifiesto

| Campo | Regla |
|---|---|
| `id` | Identificador estable del proveedor en minúsculas; es lo que resuelve el `providerId` de un perfil. |
| `displayName` | Nombre legible. |
| `contractVersion` | Debe ser `'1'`. Cualquier otro valor se rechaza. |
| `packageName` | El nombre de su paquete npm; el descubrimiento lo compara con `package.json`. |
| `capabilities` | Subconjunto de `streaming`, `local-tools`, `conversation-state`, `prompt-caching`, `extended-thinking`, `provider-files`, `remote-mcp`, `hosted-web-search`. Anuncie solo lo que implementa. |
| `configurationSchema` | Un validador Standard Schema v1 que debe validar de forma **síncrona**. Rechace las claves desconocidas. |
| `configurationControls` | Controles de modelo tipados opcionales para la configuración de ejecución durable. |

## Invariantes del adaptador

| Regla | Motivo |
|---|---|
| No lance excepciones desde `run` por un fallo del proveedor; devuelva `failed` con un arreglo `errors` no vacío. | Los hosts tratan una excepción como un fallo del entorno. |
| Al abortarse `signal`, detenga el trabajo y devuelva `cancelled` con un arreglo `errors` no vacío. | Es el contrato de cancelación de la sesión. |
| Normalice los errores con `normalizeProviderError` y pase cada secreto en su lista `secrets`. | Los sobres y las observaciones nunca deben contener credenciales. |
| Tome las credenciales solo de `options.credential` y el transporte de `options.transport`. | Las credenciales siguen siendo del host y son por ejecución. |
| Rechace capacidades y configuración desconocidas antes de cualquier llamada de red. | Fallar de forma cerrada, sin gastar nada. |
| Dirija las llamadas a herramientas locales por la frontera `executeTool` del host (`runLocalToolLoop`). | La salida del modelo nunca es autoridad. |
| Acote los reintentos (`executeWithRetry`) y registre los recursos remotos que cree (`createRemoteResourceLedger`), limpiándolos en `dispose()`. | El host debe poder razonar sobre los efectos secundarios y la limpieza. |

## Demostrarlo con la suite de conformidad

`defineExecutorProviderConformance` de `@brambodev/adapter-api/testing` registra un bloque `describe` de Vitest que crea **un adaptador nuevo a partir de su proveedor para cada escenario** y comprueba los resultados. Usted suministra fixtures deterministas, cada uno con `createOptions`, un `runRequest` y una función `observations()` que informa de lo que vieron su transporte simulado y la frontera del host:

| Fixture | La suite comprueba |
|---|---|
| `success` | Manifiesto válido; sobre `ok` válido; exactamente un envío. |
| `failure` | Sobre `failed` con errores; errores del proveedor normalizados; el `secret` nunca aparece. |
| `cancellation` | Abortar la señal de la solicitud produce `cancelled` y ningún envío más. |
| `deniedTool` | Una herramienta denegada pasa una vez por la frontera del host, con identificadores de correlación y un resultado de error. |
| `malformedTool` | Los argumentos mal formados se rechazan antes de ejecutarse en el host. |
| `duplicateTool` | Un identificador de llamada del proveedor repetido se rechaza antes de una segunda ejecución. |
| `boundedTool` | El bucle de herramientas se detiene en su límite de pasos sin otra ejecución. |
| `orderedTools` | Varias llamadas se ejecutan en orden. |
| `cleanup` | Se eliminan los recursos remotos propiedad del adaptador; los del host no. |

```ts
import { defineExecutorProviderConformance } from '@brambodev/adapter-api/testing'
import type { ExecutorProviderConformanceFixtures } from '@brambodev/adapter-api/testing'
import { createAcmeProvider } from '../src/index.ts'

declare const fixtures: ExecutorProviderConformanceFixtures // built from your fake transport

defineExecutorProviderConformance({ name: 'acme provider', provider: createAcmeProvider(), fixtures })
```

La suite incluye escenarios del bucle de herramientas, por lo que un proveedor debe implementar herramientas locales mediante `runLocalToolLoop` para superarla; el proveedor echo mínimo de arriba fallaría a propósito los fixtures de herramientas. Un conjunto de fixtures completo y funcional que usa solo las raíces de paquete publicadas está en el repositorio, en `packages/adapter-api/test/consumer-conformance.fixture.ts`; los proveedores oficiales de OpenAI y Anthropic ejecutan la misma suite en `packages/adapter-openai/test/openai-conformance.test.ts` y `packages/adapter-anthropic/test/anthropic-conformance.test.ts`. La compatibilidad de tipos por sí sola no es evidencia de comportamiento.

## Metadatos del paquete

Declare el proveedor en su `package.json` para que el descubrimiento opcional pueda verificarlo antes de cargarlo:

```json
{
  "name": "@acme/brambo-echo",
  "brambo": {
    "executor": { "id": "echo", "contractVersion": "1", "packageName": "@acme/brambo-echo", "capabilities": [] }
  }
}
```

## Descubrimiento opcional de paquetes instalados

`discoverExecutorProviders()` es opcional. El **host** suministra tanto los nombres de los paquetes candidatos instalados como una lista exacta de permitidos, además de un cargador que devuelve `{packageJson, provider}`. brambo comprueba la lista de permitidos **antes** de llamar al cargador, valida que coincidan los metadatos del paquete y el manifiesto y después registra los proveedores aceptados. Un candidato rechazado devuelve un motivo (`not-allowlisted`, `load-failed`, `invalid-module`, `invalid-manifest`, `package-mismatch`, `duplicate-provider-id`, `registration-failed`); no pasa a estar disponible en silencio.

Mantenga el cargador en código de confianza del host; nunca derive candidatos, rutas de importación, URL, credenciales ni concesiones de permisos del texto de perfiles del proyecto o del usuario. El descubrimiento no instala paquetes y no forma parte del ciclo de vida del kernel. Consulte [Seguridad de los adaptadores de API](../explanation/api-adapter-security) antes de cargar código de terceros: una lista de permitidos controla qué paquete se ejecuta, no si ese paquete es de confianza.
