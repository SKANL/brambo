---
title: Adaptador de la API de Anthropic
audience: SDK hosts
prerequisites: API executor guide and an Anthropic API credential
outcome: Configurar el adaptador oficial de la Messages API
scope: Selección y capacidades específicas de Anthropic
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# Adaptador de la API de Anthropic

Instale `@brambodev/adapter-api` y `@brambodev/adapter-anthropic`. Registre el proveedor de forma explícita y suministre un modelo habilitado para su cuenta.

```ts
import {createExecutorRegistry} from '@brambodev/adapter-api'
import {createAnthropicProvider} from '@brambodev/adapter-anthropic'

const registry = createExecutorRegistry()
registry.register(createAnthropicProvider({credential: () => process.env.ANTHROPIC_API_KEY ?? ''}))
const adapter = registry.create(
  {providerId: 'anthropic', model: process.env.ANTHROPIC_MODEL ?? '', capabilities: ['streaming'], configuration: {stream: true, maxTokens: 256}},
  {credential: undefined},
)
```

`configuration` acepta `system`, `stream`, `maxTokens` (4096 por defecto), `temperature` y `effort` (`low`, `medium`, `high`, `xhigh`, `max`). El proveedor envía una solicitud por turno, sin reintentos ni tiempo de espera; aborte mediante la señal de la ejecución. El streaming publica eventos estructurados de Messages mediante `onEvent`; `run()` devuelve el sobre completo. Los bloques locales `tool_use` requieren un `toolLoop` del host; brambo valida los argumentos y dirige la ejecución por la política local, el autorizador y la aprobación antes de enviar bloques `tool_result`.

| Funcionalidad opcional | Obligación del host |
| --- | --- |
| Búsqueda web alojada | Seleccione `hosted-web-search`, fije `webSearch: true`, conceda salida de red y suministre una política de búsqueda de pago con `maxUses` y una lista explícita de dominios permitidos. |
| MCP remoto | Seleccione `remote-mcp`, conceda salida de red y configure URL de servidores HTTPS y nombres únicos de herramientas permitidas. Es ejecución en el proveedor, no en el sandbox local. |
| Archivos del proveedor | Seleccione `provider-files`, conceda retención y borrado, proporcione tipos de archivo y medios admitidos y llame a `dispose()` para las subidas propiedad del adaptador. |
| Caché de prompts | Seleccione y conceda `prompt-caching` y fije `promptCaching: true`. |
| Razonamiento extendido | Seleccione y conceda `extended-thinking`; configure el razonamiento adaptativo o un presupuesto de tokens válido. |

Las funcionalidades del proveedor varían según el modelo y la cuenta; una capacidad anunciada por el adaptador no es una garantía del modelo. Consulte la [guía de uso de herramientas de Anthropic](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use) y la [guía de streaming de Messages](https://platform.claude.com/docs/en/api/messages-streaming) antes de desplegar. Las credenciales siguen inyectándose desde el host; no las persista en perfiles ni registros.
