import { describe, expect, it, vi } from 'vitest'
import { BRAMBO_ERROR_CODES, defineStandardSchema } from '@brambodev/contracts'
import type { ExecutorAdapter, ExecutorProvider, ExecutorProviderCreateOptions, StandardSchemaV1 } from '@brambodev/contracts'
import { createExecutorRegistry } from '../src/index.ts'

const CONFIGURATION_SCHEMA = defineStandardSchema((value) =>
  value === undefined || (typeof value === 'object' && value !== null && !Array.isArray(value))
    ? { value }
    : { issues: [{ message: 'configuration must be an object' }] },
)

function fakeProvider(
  id: string,
  capabilities: readonly ('streaming' | 'local-tools')[] = ['streaming'],
  configurationSchema: StandardSchemaV1<unknown> = CONFIGURATION_SCHEMA,
): ExecutorProvider {
  return {
    manifest: {
      id,
      displayName: `${id} API`,
      contractVersion: '1',
      packageName: `@test/${id}`,
      capabilities,
      configurationSchema,
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
    expect(registry.list()).toEqual([expect.objectContaining({
      id: provider.manifest.id,
      displayName: provider.manifest.displayName,
      contractVersion: provider.manifest.contractVersion,
      packageName: provider.manifest.packageName,
      capabilities: provider.manifest.capabilities,
    })])
  })

  it('uses a transformed Standard Schema value, including the explicit issues-undefined success form', () => {
    const configurationSchema = defineStandardSchema(() => ({ value: { endpoint: 'https://normalized.example.test' }, issues: undefined }))
    const provider = fakeProvider('openai', ['streaming'], configurationSchema)
    const registry = createExecutorRegistry()
    registry.register(provider)

    registry.create({ providerId: 'openai', model: 'gpt-test', configuration: { endpoint: 'https://raw.example.test' } }, createOptions)

    expect(provider.create).toHaveBeenCalledWith({
      ...createOptions,
      selection: { providerId: 'openai', model: 'gpt-test', configuration: { endpoint: 'https://normalized.example.test' } },
    })
  })

  it('rejects malformed and asynchronous schema results before provider creation', () => {
    const malformedSchema = { '~standard': { version: 1 as const, validate: () => ({}) } } as unknown as StandardSchemaV1<unknown>
    const asynchronousSchema = { '~standard': { version: 1 as const, validate: async () => ({ value: {} }) } } as StandardSchemaV1<unknown>

    for (const configurationSchema of [malformedSchema, asynchronousSchema]) {
      const provider = fakeProvider('openai', ['streaming'], configurationSchema)
      const registry = createExecutorRegistry()
      registry.register(provider)

      expect(caught(() => registry.create({ providerId: 'openai', model: 'gpt-test' }, createOptions))).toMatchObject({
        code: BRAMBO_ERROR_CODES.executorProviderSelectionInvalid,
      })
      expect(provider.create).not.toHaveBeenCalled()
    }
  })

  it('never exposes untrusted configuration-schema text in public errors', () => {
    const configurationSchema = defineStandardSchema(() => {
      throw new Error('sk-secret-123')
    })
    const provider = fakeProvider('openai', ['streaming'], configurationSchema)
    const registry = createExecutorRegistry()
    registry.register(provider)

    const error = caught(() => registry.create({ providerId: 'openai', model: 'gpt-test' }, createOptions)) as Error

    expect(error).toMatchObject({ code: BRAMBO_ERROR_CODES.executorProviderSelectionInvalid })
    expect(error.message).not.toContain('sk-secret-123')
  })

  it('keeps registration semantics on an immutable manifest snapshot', () => {
    const provider = fakeProvider('openai')
    const registry = createExecutorRegistry()
    registry.register(provider)

    ;(provider.manifest as { id: string }).id = 'beta'
    ;(provider.manifest.capabilities as ('streaming' | 'local-tools')[]).push('local-tools')

    expect(registry.resolve('openai').manifest.id).toBe('openai')
    expect(registry.list()).toEqual([expect.objectContaining({ id: 'openai', capabilities: ['streaming'] })])
    expect(() => registry.register(fakeProvider('openai'))).toThrow(/already registered/)
    expect(() => registry.register(fakeProvider('beta'))).not.toThrow()
    expect(Object.isFrozen(registry.list()[0])).toBe(true)
    expect(Object.isFrozen(registry.list()[0]?.capabilities)).toBe(true)
  })
})
