import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createExecutorRegistry } from '../packages/adapter-api/src/index.ts'
import { createOpenAIProvider } from '../packages/adapter-openai/src/index.ts'
import { createAnthropicProvider } from '../packages/adapter-anthropic/src/index.ts'

const workspace = { id: 'docs-example', rootPath: process.cwd(), capabilities: ['read'] }

for (const [id, provider, model] of [
  ['openai', createOpenAIProvider({ credential: () => 'docs-fixture', transport: async () => new Response(JSON.stringify({ id: 'resp-docs', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'ready' }] }] })) }), 'docs-openai-model'],
  ['anthropic', createAnthropicProvider({ credential: () => 'docs-fixture', transport: async () => new Response(JSON.stringify({ id: 'msg-docs', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'ready' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } })) }), 'docs-anthropic-model'],
]) {
  const registry = createExecutorRegistry()
  registry.register(provider)
  const manifest = JSON.parse(readFileSync(new URL(`../packages/adapter-${id}/package.json`, import.meta.url), 'utf8'))
  assert.deepEqual(manifest.brambo?.executor, {
    id: provider.manifest.id,
    contractVersion: provider.manifest.contractVersion,
    packageName: provider.manifest.packageName,
    capabilities: [...provider.manifest.capabilities],
  })
  const adapter = registry.create({ providerId: id, model }, { credential: undefined })
  const result = await adapter.run({ prompt: 'health check', workspace })
  assert.equal(result.status, 'ok')
  assert.equal(result.summary, 'ready')
  assert.doesNotMatch(JSON.stringify(result), /docs-fixture/)
  await adapter.dispose()
  assert.throws(() => registry.create({ providerId: `@example/${id}`, model }, { credential: undefined }), /stable lowercase provider ID/)
}
console.log('API documentation examples: registered OpenAI/Anthropic hosts and negative module-specifier selection valid')
