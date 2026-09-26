import { describe, expect, it } from 'vitest'
import { createOpenAICapabilityHandlers } from '../src/openai-capabilities.ts'

const policy = { allowedCapabilities: ['hosted-web-search', 'remote-mcp', 'provider-files', 'conversation-state', 'prompt-caching'] as const, allowEgress: true, allowRetention: true, allowDeletion: true }

describe('OpenAI hosted capabilities', () => {
  it('does not enable hosted tools or retained state by default', () => {
    const handlers = createOpenAICapabilityHandlers({ selected: [], policy })
    expect(handlers.requestFields()).toEqual({ store: false, tools: [], input: [] })
  })
  it('requires selection and policy for hosted web search', () => {
    expect(() => createOpenAICapabilityHandlers({ selected: ['hosted-web-search'], policy: { ...policy, allowEgress: false }, webSearch: true })).toThrow()
    const handlers = createOpenAICapabilityHandlers({ selected: ['hosted-web-search'], policy, webSearch: true })
    expect(handlers.requestFields().tools).toEqual([{ type: 'web_search' }])
  })
  it('rejects selected hosted capabilities without their concrete provider configuration', () => {
    expect(() => createOpenAICapabilityHandlers({ selected: ['hosted-web-search'], policy })).toThrow()
    expect(() => createOpenAICapabilityHandlers({ selected: ['remote-mcp'], policy })).toThrow()
  })
  it('deletes only adapter-owned response resources', async () => {
    const removed: string[] = []
    const handlers = createOpenAICapabilityHandlers({ selected: ['conversation-state'], policy, removeOwned: async (resource) => { removed.push(resource.id) } })
    handlers.recordResponse('resp-owned')
    handlers.observeResponse('resp-host')
    await handlers.dispose()
    expect(removed).toEqual(['resp-owned'])
  })
})
