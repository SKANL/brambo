import { describe, expect, it } from 'vitest'
import {
  BRAMBO_ERROR_CODES,
  BramboError,
  type ApiProviderError,
  type ApiUsageObservation,
  type ExecutorManifest,
  defineStandardSchema,
  validateApiUsageObservation,
  validateExecutorManifest,
  validateExecutorSelection,
} from '../src'

const schema = defineStandardSchema<unknown>((value) => ({ value }))

const manifest = (): ExecutorManifest => ({
  id: 'openai',
  displayName: 'OpenAI API',
  contractVersion: '1',
  packageName: '@brambodev/adapter-openai',
  capabilities: ['streaming', 'local-tools'],
  configurationSchema: schema,
})

describe('API executor provider contracts', () => {
  it('accepts a valid manifest without changing its public data', () => {
    expect(validateExecutorManifest(manifest())).toEqual(manifest())
  })

  it('rejects an invalid manifest and duplicate capability with a coded error', () => {
    expect(() =>
      validateExecutorManifest({
        ...manifest(),
        id: 'Open AI',
        capabilities: ['streaming', 'streaming'],
      }),
    ).toThrow(/id/)

    try {
      validateExecutorManifest({ ...manifest(), capabilities: ['streaming', 'streaming'] })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(BramboError)
      expect((error as BramboError).code).toBe(BRAMBO_ERROR_CODES.executorProviderManifestInvalid)
    }
  })

  it('rejects unknown manifest fields and an invalid configuration schema', () => {
    expect(() => validateExecutorManifest({ ...manifest(), executable: 'node' })).toThrow(/executable/)
    expect(() => validateExecutorManifest({ ...manifest(), configurationSchema: {} })).toThrow(/configurationSchema/)
  })

  it('validates a provider selection without accepting credentials or module specifiers', () => {
    expect(
      validateExecutorSelection({
        providerId: 'openai',
        model: 'gpt-test',
        capabilities: ['streaming'],
        configuration: { reasoning: 'low' },
      }),
    ).toEqual({
      providerId: 'openai',
      model: 'gpt-test',
      capabilities: ['streaming'],
      configuration: { reasoning: 'low' },
    })
    expect(() => validateExecutorSelection({ providerId: '@evil/module', model: 'gpt-test' })).toThrow(/providerId/)
    expect(() => validateExecutorSelection({ providerId: 'openai', model: 'gpt-test', credential: 'secret' })).toThrow(
      /credential/,
    )
  })

  it('keeps observed usage raw rather than inventing cost', () => {
    const usage: ApiUsageObservation = validateApiUsageObservation({
      providerId: 'openai',
      model: 'gpt-test',
      observedAt: '2026-09-24T00:00:00.000Z',
      inputTokens: 4,
      outputTokens: 7,
      requestId: 'req_1',
    })

    expect(usage).not.toHaveProperty('cost')
    expect(usage).toMatchObject({ inputTokens: 4, outputTokens: 7, requestId: 'req_1' })
  })

  it('keeps provider errors limited to safe normalized metadata', () => {
    const error: ApiProviderError = {
      category: 'rate-limit',
      providerId: 'openai',
      message: 'rate limited',
      status: 429,
      requestId: 'req_1',
      retryAfter: 5,
    }

    expect(error).toMatchObject({ category: 'rate-limit', status: 429 })
  })
})