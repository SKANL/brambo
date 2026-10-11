import { describe, expect, it, vi } from 'vitest'
import type { ExecutorAdapter, ResultEnvelope, RunRequest } from '../src'
import { BramboError, defineStandardSchema, validateExecutorManifest, validateRunRequest, RUN_REQUEST_SCHEMA } from '../src'

describe('ExecutorAdapter compatibility', () => {
  it('returns owned run controls without evaluating a proxy control get', () => {
    const executionConfiguration = { version: 1, providerId: 'acme-api', configuration: {}, extensions: [], support: [] }
    const get = vi.fn((target: object, key: PropertyKey) => {
      if (key === 'executionConfiguration') throw new Error('synthetic-secret')
      return Reflect.get(target, key)
    })
    const request = new Proxy({ prompt: 'inspect', workspace: { id: 'w-1', rootPath: '/workspace', capabilities: ['read'] }, executionConfiguration }, { get })
    expect(validateRunRequest(request)).toHaveProperty('executionConfiguration', executionConfiguration)
    expect(RUN_REQUEST_SCHEMA['~standard'].validate(request)).toHaveProperty('value.executionConfiguration', executionConfiguration)
    expect(get.mock.calls.some(([, key]) => key === 'executionConfiguration')).toBe(false)
  })
  it('turns wrapper snapshot reflection failures into safe schema issues', () => {
    const executionConfiguration = { version: 1, providerId: 'acme-api', configuration: {}, extensions: [], support: [] }
    const request = new Proxy({ prompt: 'inspect', workspace: { id: 'w-1', rootPath: '/workspace', capabilities: ['read'] }, executionConfiguration },
      { ownKeys() { throw new Error('synthetic-secret') } })
    expect(() => validateRunRequest(request)).toThrow(BramboError)
    const result = RUN_REQUEST_SCHEMA['~standard'].validate(request)
    expect(result).toHaveProperty('issues')
    expect(JSON.stringify(result)).not.toContain('synthetic-secret')
  })
  it('legacy manifests and run requests remain unchanged', () => {
    const manifest = { id: 'acme-api', displayName: 'Acme', contractVersion: '1', packageName: 'acme-api',
      capabilities: [], configurationSchema: defineStandardSchema((value) => ({ value })) }
    const request = { prompt: 'inspect', workspace: { id: 'workspace-1', rootPath: '/workspace', capabilities: ['read'] } }
    expect(validateExecutorManifest(manifest)).toBe(manifest)
    expect(validateRunRequest(request)).toBe(request)
    expect(Object.hasOwn(manifest, 'configurationControls')).toBe(false)
    expect(Object.hasOwn(request, 'executionConfiguration')).toBe(false)
  })
  it('keeps the executor port transport-neutral', async () => {
    const adapter: ExecutorAdapter = {
      run: async (request: RunRequest): Promise<ResultEnvelope> => {
        expect(request.workspace.id).toBe('workspace-1')
        return { status: 'ok', data: null, summary: 'complete' }
      },
    }

    const result = await adapter.run({
      prompt: 'inspect',
      workspace: { id: 'workspace-1', rootPath: '/workspace', capabilities: ['read'] },
    })

    expect(result).toMatchObject({ status: 'ok', summary: 'complete' })
  })
})
