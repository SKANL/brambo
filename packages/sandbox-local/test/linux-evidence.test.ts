import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLinuxSandboxProvider } from '../src/linux.ts'

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn }))
afterEach(() => vi.resetAllMocks())

describe('Linux control evidence', () => {
  it.each(['missing', 'failed', 'no-op'] as const)('does not promote a %s helper to isolation evidence', async (behavior) => {
    spawn.mockImplementation(() => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(), kill: () => true,
      })
      queueMicrotask(() => {
        if (behavior === 'missing') child.emit('error', new Error('ENOENT'))
        else child.emit('close', behavior === 'failed' ? 1 : 0)
      })
      return child
    })

    const provider = await createLinuxSandboxProvider({ platform: 'linux', inspect: async () => true })
    expect(provider.discovery.bubblewrap).toBe(behavior === 'no-op')
    expect(provider.capabilities).toMatchObject({
      enforcement: 'partial',
      controls: { filesystem: 'none', network: 'none', process: 'none', resources: 'none' },
    })
    await expect(provider.createSession({
      policy: { version: 1, mode: 'read-only', workspaceRoot: '/workspace', requiredCapabilities: { filesystem: 'full' } },
      snapshots: [],
    })).rejects.toThrow()
  })
})
