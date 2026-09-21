import { describe, expect, it } from 'vitest'
import { runDelegatedTaskGraph, runTaskGraph } from '../src/index.ts'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJsonlOrchestrationStateStore } from '../src/state-store.ts'

describe('runTaskGraph', () => {
  it('runs dependencies before dependants and exposes results', async () => {
    const order: string[] = []
    const result = await runTaskGraph([
      { id: 'prepare', run: async () => { order.push('prepare'); return 7 } },
      { id: 'use', dependsOn: ['prepare'], run: async ({ getResult }) => { order.push('use'); return (getResult('prepare') as number) + 1 } },
    ])
    expect(order).toEqual(['prepare', 'use'])
    expect(result.status).toBe('succeeded')
    expect(result.tasks[1]?.result).toBe(8)
  })

  it('blocks dependants after a failure without invoking them', async () => {
    let invoked = false
    const result = await runTaskGraph([
      { id: 'fail', run: async () => { throw new Error('boom') } },
      { id: 'blocked', dependsOn: ['fail'], run: async () => { invoked = true } },
    ])
    expect(invoked).toBe(false)
    expect(result.status).toBe('failed')
    expect(result.tasks.map((task) => task.status)).toEqual(['failed', 'blocked'])
  })

  it('rejects cycles before executing tasks', async () => {
    await expect(runTaskGraph([
      { id: 'a', dependsOn: ['b'], run: async () => undefined },
      { id: 'b', dependsOn: ['a'], run: async () => undefined },
    ])).rejects.toThrow('cycle')
  })

  it('retries a failed task up to its declared attempt bound', async () => {
    let attempts = 0
    const result = await runTaskGraph([{ id: 'retry', maxAttempts: 2, run: async () => {
      attempts += 1
      if (attempts === 1) throw new Error('transient')
      return 'ok'
    } }])
    expect(result.status).toBe('succeeded')
    expect(attempts).toBe(2)
    expect(result.tasks[0]?.attempts).toBe(2)
  })

  it('resumes succeeded tasks from initial records without invoking them again', async () => {
    let prepared = 0
    let consumed = 0
    const result = await runTaskGraph([
      { id: 'prepare', run: async () => { prepared += 1; return 'ready' } },
      { id: 'consume', dependsOn: ['prepare'], run: async ({ getResult }) => { consumed += 1; return getResult('prepare') } },
    ], { initialRecords: [{ id: 'prepare', status: 'succeeded', result: 'ready', attempts: 1 }] })
    expect(result.status).toBe('succeeded')
    expect(prepared).toBe(0)
    expect(consumed).toBe(1)
  })

  it('persists and reloads the last orchestration snapshot', async () => {
    const root = await mkdtemp(join(tmpdir(), 'brambo-orchestration-'))
    try {
      const store = createJsonlOrchestrationStateStore(join(root, 'state.jsonl'))
      const records = [{ id: 'a', status: 'succeeded' as const, result: 1, attempts: 1 }]
      store.save(records)
      store.save([{ id: 'a', status: 'succeeded' as const, result: 2, attempts: 2 }])
      expect(store.load()).toEqual([{ id: 'a', status: 'succeeded', result: 2, attempts: 2 }])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('uses the state store as the default resume source', async () => {
    const root = await mkdtemp(join(tmpdir(), 'brambo-orchestration-resume-'))
    try {
      const store = createJsonlOrchestrationStateStore(join(root, 'state.jsonl'))
      let calls = 0
      await runTaskGraph([{ id: 'once', run: async () => { calls += 1; return 42 } }], { stateStore: store })
      const resumed = await runTaskGraph([{ id: 'once', run: async () => { calls += 1; return 99 } }], { stateStore: store })
      expect(resumed.status).toBe('succeeded')
      expect(calls).toBe(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('runs delegated work through the orchestration graph', async () => {
    const result = await runDelegatedTaskGraph([
      { id: 'child', request: { id: 'child', input: 'hello' }, handler: { execute: async ({ input }) => input.toUpperCase() } },
    ])
    expect(result.status).toBe('succeeded')
    expect(result.tasks[0]?.result).toBe('HELLO')
  })
})
