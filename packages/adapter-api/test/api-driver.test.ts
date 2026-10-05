import { describe, expect, it, vi } from 'vitest'
import { defineStandardSchema } from '@brambodev/contracts'
import type { DriverManifest, DriverRequest, DriverServices, ExecutorAdapter, ToolCall } from '@brambodev/contracts'
import * as adapterApi from '../src/index.ts'
import { createApiDriverFactory } from '../src/index.ts'

const manifest: DriverManifest = {
  id: 'custom-api',
  version: '1.0.0',
  kind: 'api',
  capabilities: ['context-reconstruction'],
  configurationSchema: defineStandardSchema((value) => ({ value })),
}

const request: DriverRequest = {
  key: { namespace: 'tenant', runId: 'run-1' },
  sessionId: 'session-1',
  taskId: 'task-1',
  prompt: 'Continue the task',
  workspace: { id: 'workspace-1', rootPath: '/workspace', capabilities: ['read', 'write'] },
  context: { prior: 'durable event' },
  continuation: 'reconstructed',
  signal: new AbortController().signal,
}

describe('generic API driver composition', () => {
  it('exports the generic composition without vendor-specific branching', () => {
    expect(adapterApi).toHaveProperty('createApiDriverFactory', expect.any(Function))
  })

  it('injects durable driver services into a custom API adapter and preserves tool identity and signal', async () => {
    const call: ToolCall = { id: 'provider-call-1', toolId: 'file.read', arguments: { path: 'package.json' } }
    const dispatchTool = vi.fn(async (received: ToolCall, signal: AbortSignal) => {
      expect(signal).toBe(request.signal)
      const path = received.arguments['path']
      return { path: typeof path === 'string' ? path : null }
    })
    const services: DriverServices = { dispatchTool, resolveSecret: async () => 'secret' }
    let receivedPrompt: string | undefined
    let receivedWorkspace: DriverRequest['workspace'] | undefined
    let receivedSignal: AbortSignal | undefined
    const createAdapter = vi.fn((_configuration: unknown, injected: DriverServices): ExecutorAdapter => ({
      run: async (input) => {
        receivedPrompt = input.prompt
        receivedWorkspace = input.workspace
        receivedSignal = input.signal
        await injected.dispatchTool(call, input.signal ?? request.signal)
        return { status: 'ok', data: { callId: call.id }, summary: 'completed' }
      },
    }))
    const factory = createApiDriverFactory({ manifest, createAdapter })
    const driver = await factory.create({ profile: 'custom' }, services)

    await expect(driver.run(request)).resolves.toMatchObject({ result: { status: 'ok' } })
    expect(createAdapter).toHaveBeenCalledWith({ profile: 'custom' }, services)
    expect(receivedPrompt).toContain('Continue the task')
    expect(receivedPrompt).toContain('durable event')
    expect(receivedWorkspace).toBe(request.workspace)
    expect(receivedSignal).toBe(request.signal)
    expect(dispatchTool).toHaveBeenCalledTimes(1)
    expect(dispatchTool).toHaveBeenCalledWith(call, request.signal)
  })

  it('rejects a non-API manifest before adapter construction', () => {
    const createAdapter = vi.fn((): ExecutorAdapter => ({
      run: async () => ({ status: 'ok' as const, data: null, summary: 'ok' }),
    }))
    expect(() => createApiDriverFactory({ manifest: { ...manifest, kind: 'cli' }, createAdapter })).toThrow(/api/i)
    expect(createAdapter).not.toHaveBeenCalled()
  })

  it('does not claim native continuation without a binding-aware adapter contract', () => {
    const createAdapter = vi.fn((): ExecutorAdapter => ({ run: async () => ({ status: 'ok' as const, data: null, summary: 'ok' }) }))
    expect(() => createApiDriverFactory({ manifest: { ...manifest, capabilities: ['native-continuation'] }, createAdapter })).toThrow(/binding-aware/i)
    expect(createAdapter).not.toHaveBeenCalled()
  })

  it('snapshots advertised capabilities before exposing the registered factory', () => {
    const capabilities = ['context-reconstruction']
    const createAdapter = vi.fn((): ExecutorAdapter => ({ run: async () => ({ status: 'ok' as const, data: null, summary: 'ok' }) }))
    const factory = createApiDriverFactory({ manifest: { ...manifest, capabilities }, createAdapter })
    capabilities.push('native-continuation')

    expect(factory.manifest.capabilities).toEqual(['context-reconstruction'])
  })

  it('requires reconstruction capability before composing durable context', async () => {
    const createAdapter = vi.fn((): ExecutorAdapter => ({ run: async () => ({ status: 'ok' as const, data: null, summary: 'ok' }) }))
    const factory = createApiDriverFactory({ manifest: { ...manifest, capabilities: [] }, createAdapter })
    const driver = await factory.create({}, { dispatchTool: async () => null, resolveSecret: async () => 'secret' })

    await expect(driver.run(request)).rejects.toThrow(/context reconstruction.*unavailable/i)
    expect(createAdapter).toHaveBeenCalledTimes(1)
  })
})
