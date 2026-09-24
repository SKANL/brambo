import { describe, expect, it, vi } from 'vitest'
import { BRAMBO_ERROR_CODES, defineStandardSchema } from '@brambodev/contracts'
import type { ExecutorAdapter, ExecutorProvider, ExecutorProviderCreateOptions } from '@brambodev/contracts'
import { createExecutorRegistry } from '../src/index.ts'

const CONFIGURATION_SCHEMA = defineStandardSchema((value) =>
  value === undefined || (typeof value === 'object' && value !== null && !Array.isArray(value))
    ? { value }
    : { issues: [{ message: 'configuration must be an object' }] },
)

function fakeProvider(id: string, capabilities: readonly ('streaming' | 'local-tools')[] = ['streaming']): ExecutorProvider {
  return {
    manifest: {
      id,
      displayName: `${id} API`,
      contractVersion: '1',
      packageName: `@test/${id}`,
      capabilities,
      configurationSchema: CONFIGURATION_SCHEMA,
    },
    create: vi.fn(() => ({ run: vi.fn() }) as unknown as ExecutorAdapter),
  }
}

const createOptions: ExecutorProviderCreateOptions = {
  selection: { providerId: 'ignored', model: 'ignored' },
  credential: { kind: 'test' },
}

function caught(action: () => unknown): unknown {
  try {
    action()
  } catch (error) {
    return error
  }
  throw new Error('expected action to throw')
}

describe('ExecutorRegistry', () => {
  it('creates only a host-registered provider', () => {
    const registry = createExecutorRegistry()
    registry.register(fakeProvider('openai'))

    expect(registry.create({ providerId: 'openai', model: 'gpt-test' }, createOptions)).toBeDefined()
    expect(() => registry.resolve('unknown')).toThrow(/unknown/)
  })

  it('rejects duplicate provider IDs after validating the manifest', () => {
    const registry = createExecutorRegistry()
    registry.register(fakeProvider('openai'))

    expect(caught(() => registry.register(fakeProvider('openai')))).toMatchObject({
      code: BRAMBO_ERROR_CODES.executorProviderDuplicateRegistration,
    })
  })

  it('rejects selected capabilities that the registered provider did not advertise before create', () => {
    const provider = fakeProvider('openai', ['streaming'])
    const registry = createExecutorRegistry()
    registry.register(provider)

    expect(caught(() => registry.create({ providerId: 'openai', model: 'gpt-test', capabilities: ['local-tools'] }, createOptions))).toMatchObject({
      code: BRAMBO_ERROR_CODES.executorProviderSelectionInvalid,
    })
    expect(provider.create).not.toHaveBeenCalled()
  })

  it('validates provider configuration before create', () => {
    const provider = fakeProvider('openai')
    const registry = createExecutorRegistry()
    registry.register(provider)

    expect(caught(() => registry.create({ providerId: 'openai', model: 'gpt-test', configuration: 'invalid' }, createOptions))).toMatchObject({
      code: BRAMBO_ERROR_CODES.executorProviderSelectionInvalid,
    })
    expect(provider.create).not.toHaveBeenCalled()
  })

  it('passes the validated selection to the provider and lists immutable manifests', () => {
    const provider = fakeProvider('openai')
    const registry = createExecutorRegistry()
    registry.register(provider)
    const selection = { providerId: 'openai', model: 'gpt-test', configuration: { endpoint: 'https://example.test' } }

    registry.create(selection, createOptions)

    expect(provider.create).toHaveBeenCalledWith({ ...createOptions, selection })
    expect(registry.list()).toEqual([provider.manifest])
  })
})