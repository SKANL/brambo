---
title: Adaptadores de executors de API
audience: SDK hosts
prerequisites: Node.js >=20 and provider API access
outcome: Ejecutar un executor de API registrado sin persistir ningún secreto
scope: Registro neutral respecto al transporte y composición de sesiones
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# Adaptadores de executors de API

Instale `@brambodev/adapter-api` y un paquete de proveedor. Un identificador de proveedor selecciona un proveedor **ya registrado**; nunca nombra un paquete que importar. El host es dueño de las credenciales, la selección de modelo, el espacio de trabajo, los presupuestos y la cancelación.

## Ruta rápida

```ts
import type {ExecutorSelection} from '@brambodev/contracts'
import {createExecutorRegistry} from '@brambodev/adapter-api'
import {createOpenAIProvider} from '@brambodev/adapter-openai'
import {runSession} from '@brambodev/session'

const registry = createExecutorRegistry()
registry.register(createOpenAIProvider({credential: () => process.env.OPENAI_API_KEY ?? ''}))
const selection: ExecutorSelection = {providerId: 'openai', model: process.env.OPENAI_MODEL ?? '', capabilities: ['streaming'], configuration: {stream: true}}
const result = await runSession({
  prompt: 'Explain the failing test',
  createAdapter: () => registry.create(selection, {selection, credential: undefined}),
})
console.log(result.status)
```

Suministre un modelo válido de forma explícita y haga fallar el arranque del host si falta la credencial o el modelo. Inyecte la credencial desde un gestor de secretos o desde el entorno del proceso en tiempo de ejecución, no desde `~/.brambo/config.json`, la configuración del proyecto, los registros ni un perfil guardado. El proveedor también acepta un `transport` suministrado por el host para controlar la salida HTTP y para pruebas. Consulte [OpenAI](./openai-api-adapter) y [Anthropic](./anthropic-api-adapter) para sus opciones propias.

## Streaming, resultados y cancelación

Seleccione `streaming` **y** fije `configuration.stream: true`; proporcione `onEvent` en el proveedor para recibir deltas normalizados y ordenados con metadatos de correlación. `run()` sigue devolviendo el `ResultEnvelope` final. El `onObservation` opcional recibe observaciones de uso, límites de tasa y errores normalizados. No registre cargas arbitrarias de eventos como si no fueran sensibles. Pase un `AbortSignal` en una llamada directa a `run()` del adaptador o encárguese de la cancelación y del plazo de la sesión que lo rodea. Ambos proveedores oficiales hacen un único intento por solicitud (`maxAttempts: 1`) y no fijan tiempo de espera; consulte [Cancelación, tiempos de espera y reintentos](./cancellation-timeouts-retries). Los identificadores de solicitud son valores de correlación para diagnóstico, no tokens de autorización.

## Llamadas a herramientas locales

Seleccionar `local-tools` no basta por sí solo: suministre un `toolLoop` con las definiciones del host, `maxSteps`, `maxConcurrentCalls`, los identificadores de sesión y turno, y `createExecution`. Cada llamada del modelo pasa por la frontera `executeTool()` de `@brambodev/session`, con validación de argumentos, política de sandbox, autorizador y `approveTool`. El host decide qué herramientas y capacidades expone; nunca trate los nombres o argumentos suministrados por el proveedor como autoridad. El bucle no tiene continuación ilimitada implícita. Consulte [Herramientas y sandbox](./tools-and-sandbox) y [Seguridad de los adaptadores de API](../explanation/api-adapter-security).

## Capacidades alojadas opcionales

Las capacidades que anuncia un proveedor no se habilitan automáticamente. Seleccione cada una y suministre la `capabilities.policy` del proveedor junto con su configuración explícita. La búsqueda web alojada, el MCP remoto y la subida de archivos cruzan una frontera de salida y retención propiedad del proveedor; **no** usan el sandbox local de `executeTool()`. Distinga los recursos remotos propiedad del host de los propiedad del adaptador y llame a `dispose()` para limpiar los del adaptador. Los límites y casos no soportados de cada proveedor están en sus dos guías.

## Migración desde la CLI

El antiguo `brambo run --executor codex` (y `claude-code`/`opencode`) sigue siendo una ruta de proceso de CLI. Un host que inicializa un registro puede usar `brambo run --executor-profile api:openai --model MODEL "prompt"`; no hay instalación ni importación de módulos guiada por la configuración. La CLI independiente no crea proveedores arbitrarios de terceros a partir del texto de un perfil. Consulte [proveedores de terceros](./third-party-executor-providers) para el registro explícito desde el host.
