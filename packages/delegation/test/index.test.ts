import { describe, expect, it } from 'vitest'
import { createDelegationRegistry } from '../src/index.ts'
import { createJsonlDelegationStateStore } from '../src/index.ts'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('delegation registry', () => {
  it('records a provider-agnostic handoff result', async () => {
    const registry = createDelegationRegistry<{ prompt: string }, string>()
    const result = await registry.delegate({ id: 'child-1', input: { prompt: 'work' }, parentId: 'root' }, { execute: async (request) => request.input.prompt.toUpperCase() })
    expect(result).toMatchObject({ id: 'child-1', status: 'succeeded', result: 'WORK', parentId: 'root' })
    expect(registry.get('child-1')).toEqual(result)
  })

  it('records failure and cancellation without throwing provider errors', async () => {
    const registry = createDelegationRegistry<void, void>()
    const failed = await registry.delegate({ id: 'failed', input: undefined }, { execute: async () => { throw new Error('no') } })
    expect(failed.status).toBe('failed')
    const controller = new AbortController()
    controller.abort()
    const cancelled = await registry.delegate({ id: 'cancelled', input: undefined }, { execute: async () => { throw new Error('stop') } }, controller.signal)
    expect(cancelled.status).toBe('cancelled')
  })

  it('persists delegation snapshots and restores them on reopen', async () => {
    const root = await mkdtemp(join(tmpdir(), 'brambo-delegation-'))
    try {
      const store = createJsonlDelegationStateStore(join(root, 'state.jsonl'))
      const first = createDelegationRegistry<{ value: number }, number>({ stateStore: store })
      await first.delegate({ id: 'saved', input: { value: 2 } }, { execute: async ({ input }) => input.value * 2 })
      const reopened = createDelegationRegistry<{ value: number }, number>({ stateStore: createJsonlDelegationStateStore(join(root, 'state.jsonl')) })
      expect(reopened.get('saved')).toMatchObject({ status: 'succeeded', result: 4 })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
