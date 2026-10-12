---
title: Adaptador de la API de OpenAI
audience: SDK hosts
prerequisites: API executor guide and an OpenAI API credential
outcome: Configurar el adaptador oficial de la Responses API
scope: Selección y capacidades específicas de OpenAI
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# Adaptador de la API de OpenAI

Instale `@brambodev/adapter-api` y `@brambodev/adapter-openai`. Registre `createOpenAIProvider({credential})` en el [registro de executors](./api-executors). El host suministra un identificador de modelo vigente; este adaptador no adivina ninguno por defecto.

```ts
import type {ExecutorSelection} from '@brambodev/contracts'
import {createExecutorRegistry} from '@brambodev/adapter-api'
import {createOpenAIProvider} from '@brambodev/adapter-openai'

const registry = createExecutorRegistry()
registry.register(createOpenAIProvider({credential: () => process.env.OPENAI_API_KEY ?? ''}))
const selection: ExecutorSelection = {providerId: 'openai', model: process.env.OPENAI_MODEL ?? '', capabilities: ['streaming'], configuration: {stream: true, maxOutputTokens: 256}}
const adapter = registry.create(selection, {selection, credential: undefined})
```

`configuration` acepta `instructions`, `stream`, `maxOutputTokens`, `temperature`, `previousResponseId` y `reasoningEffort` (`none`, `minimal`, `low`, `medium`, `high`, `xhigh`); las claves desconocidas no superan la validación. El proveedor envía una solicitud por turno, sin reintentos ni tiempo de espera; aborte mediante la señal de la ejecución. El streaming entrega eventos `response.*` mediante `onEvent` y un sobre final mediante `run()`. Las llamadas a funciones usan el bucle local de herramientas controlado por el host y correlacionan la salida de `call_id` entre solicitudes. Fije en el host presupuestos estrictos de solicitudes y de pasos de herramientas.

| Funcionalidad opcional | Obligación del host |
| --- | --- |
| Estado de conversación | Seleccione `conversation-state`, conceda la política de retención y borrado y encárguese de la limpieza; si no, las solicitudes usan `store: false`. |
| Búsqueda web alojada | Seleccione `hosted-web-search`, conceda salida de red y fije `webSearch: true`. La búsqueda del proveedor no es ejecución en el sandbox local. |
| MCP remoto | Seleccione `remote-mcp`, proporcione servidores HTTPS y herramientas permitidas, además de `mcpAuthorizer`; una aprobación sin decidir se deniega. |
| Archivos del proveedor | Seleccione `provider-files`, conceda retención y borrado, suministre archivos de entrada o use los métodos de subida, lectura y borrado, y llame a `dispose()`. |
| Caché de prompts | Seleccione y conceda `prompt-caching` donde el modelo y la API elegidos lo admitan. |

El adaptador rechaza endpoints personalizados que no sean HTTPS o URL con credenciales incrustadas. Mantenga las claves de API fuera de los perfiles persistidos y de los registros de eventos. Para conocer la disponibilidad actual de modelos, API y herramientas, consulte la [guía de herramientas de OpenAI](https://platform.openai.com/docs/guides/tools) y la [guía de llamadas a funciones](https://platform.openai.com/docs/guides/function-calling) antes de desplegar; el manifiesto de brambo no promete que todos los modelos admitan todas las capacidades.
