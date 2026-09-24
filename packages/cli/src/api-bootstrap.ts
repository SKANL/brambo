import { createExecutorRegistry } from '@brambodev/adapter-api'
import type { ExecutorRegistry } from '@brambodev/adapter-api'
import { createOpenAIProvider } from '@brambodev/adapter-openai'
import type { OpenAIProviderOptions } from '@brambodev/adapter-openai'
import { createAnthropicProvider } from '@brambodev/adapter-anthropic'
import type { AnthropicProviderOptions } from '@brambodev/adapter-anthropic'

/** Only the explicit host bootstrap imports official provider implementations. */
export function createOfficialApiExecutorRegistry(
  providers: { readonly openai?: OpenAIProviderOptions; readonly anthropic?: AnthropicProviderOptions },
): ExecutorRegistry {
  const registry = createExecutorRegistry()
  if (providers.openai !== undefined) registry.register(createOpenAIProvider(providers.openai))
  if (providers.anthropic !== undefined) registry.register(createAnthropicProvider(providers.anthropic))
  return registry
}
