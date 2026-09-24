import { describe, expect, it } from 'vitest'
import { createExecutorRegistry } from '@brambodev/adapter-api'
import { createOpenAIProvider } from '@brambodev/adapter-openai'
import { selectRegisteredApiExecutor, validateApiExecutorProfile } from '@brambodev/environment/api-executors'

describe('API executor profiles', () => {
  it('selects an explicitly registered OpenAI provider by ID and model', () => {
    const registry = createExecutorRegistry()
    registry.register(createOpenAIProvider())
    const adapter = selectRegisteredApiExecutor({ providerId: 'openai', model: 'gpt-test' }, registry, { credential: 'test-only', selection: { providerId: 'openai', model: 'gpt-test' } })
    expect(adapter.run).toBeTypeOf('function')
  })

  it('accepts only providerId, model, and capabilities in a persisted profile', () => {
    expect(validateApiExecutorProfile({ providerId: 'openai', model: 'gpt-test', capabilities: ['streaming'] })).toEqual({ providerId: 'openai', model: 'gpt-test', capabilities: ['streaming'] })
    for (const field of ['apiKey', 'credential', 'module', 'packageName', 'endpoint', 'configuration']) {
      expect(() => validateApiExecutorProfile({ providerId: 'openai', model: 'gpt-test', [field]: 'sk-SECRET' })).toThrow()
      try {
        validateApiExecutorProfile({ providerId: 'openai', model: 'gpt-test', [field]: 'sk-SECRET' })
      } catch (error) {
        expect(String(error)).not.toContain('sk-SECRET')
      }
    }
    expect(() => validateApiExecutorProfile({ providerId: '@evil/module', model: 'x' })).toThrow()
    expect(() => validateApiExecutorProfile({ providerId: 'openai', model: 'x', capabilities: ['streaming', 'streaming'] })).toThrow()
  })

  it('returns an actionable, secret-free diagnostic for a missing provider', () => {
    const registry = createExecutorRegistry()
    expect(() => selectRegisteredApiExecutor({ providerId: 'openai', model: 'gpt-test' }, registry, { credential: 'sk-SECRET', selection: { providerId: 'openai', model: 'gpt-test' } }))
      .toThrow(/register/i)
    try {
      selectRegisteredApiExecutor({ providerId: 'openai', model: 'gpt-test' }, registry, { credential: 'sk-SECRET', selection: { providerId: 'openai', model: 'gpt-test' } })
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain('sk-SECRET')
      expect(error).toMatchObject({ diagnostic: { code: 'BRAMBO_EXECUTOR_PROVIDER_UNKNOWN', providerId: 'openai' } })
    }
  })

  it('does not create an adapter when a structural registry resolves to absence', () => {
    let created = false
    const registry = {
      resolve: () => undefined,
      create: () => { created = true; throw new Error('must not create') },
    }
    const selection = { providerId: 'openai', model: 'gpt-test' }
    expect(() => selectRegisteredApiExecutor(selection, registry, { credential: 'sk-SECRET', selection }))
      .toThrow(/not registered/i)
    expect(created).toBe(false)
  })

})
