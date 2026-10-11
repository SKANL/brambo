import { expect, test } from 'vitest'
import * as exports from '../src/index.ts'
import type { publishTaskResult } from '../src/publication.ts'
import { workflowFixture } from './helpers/workflow-fixture.ts'
const publish = (exports as unknown as { publishTaskResult: typeof publishTaskResult }).publishTaskResult

test('publishes immutable child artifact before fenced parent commit without replacing parent workspace', async () => {
  expect(publish).toBeTypeOf('function')
  const f = await workflowFixture()
  try {
    const child = await f.store.claim('tenant', ['task:run:a', 'workspace:child'], 'worker', 60_000)
    if (child.status !== 'acquired') throw new Error('claim')
    const snapshot = { ...f.snapshot, tasks: [{ taskId: 'a', phase: 'running' as const, attempt: 1 }] }
    const result = f.outcome({ namespace: 'tenant', workspaceId: 'child', revision: 'base' }, child.lease)
    const committed = await publish({ snapshot, taskId: 'a', result, lease: f.lease, store: f.store, artifacts: f.artifacts })
    expect(committed.status).toBe('committed')
    if (committed.status !== 'committed') throw new Error('commit')
    expect(committed.snapshot.workspace).toEqual(f.snapshot.workspace)
    expect(committed.snapshot.tasks[0]?.workspace).toEqual(result.workspace)
    expect(await f.artifacts.manifest(result.workspace)).toEqual({ revision: 'output', entries: [] })
  } finally { await f.close() }
})

test('stale parent refuses authoritative progress even when child authority is current', async () => {
  const f = await workflowFixture()
  try {
    const child = await f.store.claim('tenant', ['task:run:a', 'workspace:child'], 'worker', 60_000)
    if (child.status !== 'acquired') throw new Error('claim')
    await f.store.release(f.lease)
    const snapshot = { ...f.snapshot, tasks: [{ taskId: 'a', phase: 'running' as const, attempt: 1 }] }
    const result = await publish({ snapshot, taskId: 'a', result: f.outcome({ namespace: 'tenant', workspaceId: 'child', revision: 'base' }, child.lease),
      lease: f.lease, store: f.store, artifacts: f.artifacts })
    expect(result.status).toBe('stale-lease')
    expect(f.published.size).toBe(0)
    expect((await f.store.get(f.key))?.revision).toBe(0)
  } finally { await f.close() }
})

test('stale child publication fails before parent CAS', async () => {
  const f = await workflowFixture()
  try {
    const child = await f.store.claim('tenant', ['task:run:a', 'workspace:child'], 'worker', 60_000)
    if (child.status !== 'acquired') throw new Error('claim')
    await f.store.release(child.lease)
    const snapshot = { ...f.snapshot, tasks: [{ taskId: 'a', phase: 'running' as const, attempt: 1 }] }
    await expect(publish({ snapshot, taskId: 'a', result: f.outcome({ namespace: 'tenant', workspaceId: 'child', revision: 'base' }, child.lease),
      lease: f.lease, store: f.store, artifacts: f.artifacts })).rejects.toThrow('stale publication')
    expect((await f.store.get(f.key))?.revision).toBe(0)
  } finally { await f.close() }
})

test('crash after publication but before commit leaves orphan data, not authoritative task progress', async () => {
  expect(publish).toBeTypeOf('function')
  const f = await workflowFixture()
  try {
    const child = await f.store.claim('tenant', ['task:run:a', 'workspace:child'], 'worker', 60_000)
    if (child.status !== 'acquired') throw new Error('claim')
    const snapshot = { ...f.snapshot, tasks: [{ taskId: 'a', phase: 'running' as const, attempt: 1 }] }
    const result = f.outcome({ namespace: 'tenant', workspaceId: 'child', revision: 'base' }, child.lease)
    const crashStore = { ...f.store, commit: async () => { throw new Error('crash-before-commit') } }
    await expect(publish({ snapshot, taskId: 'a', result, lease: f.lease, store: crashStore, artifacts: f.artifacts })).rejects.toThrow('crash-before-commit')
    const reopened = await f.reopen()
    try { expect((await reopened.get(f.key))?.revision).toBe(0) } finally { await reopened.close() }
    expect(await f.artifacts.manifest(result.workspace)).toMatchObject({ revision: 'output' })
  } finally { await f.close() }
})
