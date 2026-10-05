import { expect, it } from 'vitest'
import { BramboError, defineStandardSchema } from '@brambodev/contracts'
import type { ExecutionDriver, ExecutionRuntime, Lease, RuntimeRequest, RunSnapshot } from '@brambodev/contracts'
import * as session from '../src/index.ts'

const snapshot: RunSnapshot = { schemaVersion: 1, key: { namespace: 'test', runId: 'run' }, revision: 0, workflowId: 'workflow', workflowVersion: 'v1', sessionId: 'stable-session', status: 'pending', workspace: { namespace: 'test', workspaceId: 'workspace', revision: 'revision' }, tasks: [{ taskId: 'task', phase: 'pending', attempt: 0 }], context: null, cancelRequested: false }
const lease: Lease = { namespace: 'test', ownerId: 'worker', token: 'private', expiresAt: 100, epochs: { 'run:run': 1, 'workspace:workspace': 1 } }
const driver: ExecutionDriver = { manifest: { id: 'driver', version: '1', kind: 'custom', capabilities: [], configurationSchema: defineStandardSchema(value => ({ value })) }, run: async () => ({ result: { status: 'ok', data: null, summary: 'ok' } }) }
const identity = { key: snapshot.key, sessionId: snapshot.sessionId, workflowId: snapshot.workflowId, workflowVersion: snapshot.workflowVersion, revision: snapshot.revision, workspace: snapshot.workspace }
const fresh = { mode: 'fresh' as const, context: null, identity }
it('exports workflow session composition', () => { expect(session).toHaveProperty('runWorkflowSession', expect.any(Function)) })
it('preserves Brambo identity across devices while native IDs differ', async () => {
  const requests: RuntimeRequest[] = []
  const runtime: ExecutionRuntime = { capabilities: [], execute: async (_driver, request, authority) => {
    requests.push(request)
    return { outcome: { result: { status: 'ok', data: null, summary: 'ok' }, binding: { driverId: 'driver', driverVersion: '1', providerId: 'vendor', accountRef: 'account-ref', compatibility: {}, nativeSessionId: `device-${requests.length}` } }, staged: { revision: 'next', entries: [] }, workspace: { ...snapshot.workspace, revision: 'next' }, publicationLease: authority }
  } }
  const options = { snapshot, taskId: 'task', prompt: 'work', driver, runtime, lease, continuation: fresh, signal: new AbortController().signal }
  const first = await session.runWorkflowSession(options)
  const second = await session.runWorkflowSession(options)
  expect(requests[1]?.sessionId).toBe(snapshot.sessionId)
  expect(requests[1]?.key).toEqual(snapshot.key)
  expect(requests[1]?.workspace).toEqual(snapshot.workspace)
  expect(second.outcome.binding?.nativeSessionId).not.toBe(first.outcome.binding?.nativeSessionId)
  expect(requests[1]).not.toHaveProperty('binding')
})
it('fails blocked selection before runtime dispatch with typed actionable error', async () => {
  let dispatched = false
  const runtime: ExecutionRuntime = { capabilities: [], execute: async () => { dispatched = true; throw new Error('dispatched') } }
  try {
    await session.runWorkflowSession({ snapshot, taskId: 'task', prompt: 'work', driver, runtime, lease, continuation: { mode: 'blocked', reason: 'context-missing', message: 'Load authorized durable context before continuing.' }, signal: new AbortController().signal })
    expect.unreachable('blocked selection must reject')
  } catch (error) {
    expect(error).toBeInstanceOf(BramboError)
    expect(error).toMatchObject({ code: 'BRAMBO_ORCHESTRATION_INVALID', message: expect.stringMatching(/context-missing.*Load authorized/) })
  }
  expect(dispatched).toBe(false)
})
it('refuses a selection for another snapshot and unknown task before dispatch', async () => {
  const runtime: ExecutionRuntime = { capabilities: [], execute: async () => { throw new Error('must not dispatch') } }
  const options = { snapshot, taskId: 'task', prompt: 'work', driver, runtime, lease, continuation: fresh, signal: new AbortController().signal }
  await expect(session.runWorkflowSession({ ...options, snapshot: { ...snapshot, revision: 1 } })).rejects.toThrow(/identity/)
  await expect(session.runWorkflowSession({ ...options, taskId: 'unknown' })).rejects.toThrow(/task/)
})
it('never falls back after a native dispatch fails', async () => {
  let dispatches = 0
  const runtime: ExecutionRuntime = { capabilities: ['native-continuation'], execute: async () => { dispatches++; throw new Error('native attempt failed') } }
  await expect(session.runWorkflowSession({ snapshot, taskId: 'task', prompt: 'work', driver: { ...driver, manifest: { ...driver.manifest, capabilities: ['native-continuation'] } }, runtime, lease, continuation: { ...fresh, mode: 'native', binding: { driverId: 'driver', driverVersion: '1', providerId: 'vendor', accountRef: 'account-ref', compatibility: {}, nativeSessionId: 'native' } }, signal: new AbortController().signal })).rejects.toThrow('native attempt failed')
  expect(dispatches).toBe(1)
})

it('rejects native bindings for another driver before dispatch', async () => {
  let dispatched = false
  const runtime: ExecutionRuntime = { capabilities: ['native-continuation'], execute: async () => { dispatched = true; throw new Error('dispatched') } }
  await expect(session.runWorkflowSession({ snapshot, taskId: 'task', prompt: 'work', driver: { ...driver, manifest: { ...driver.manifest, capabilities: ['native-continuation'] } }, runtime, lease, continuation: { ...fresh, mode: 'native', binding: { driverId: 'other', driverVersion: '1', providerId: 'vendor', accountRef: 'account-ref', compatibility: {}, nativeSessionId: 'native' } }, signal: new AbortController().signal })).rejects.toThrow(/binding/)
  expect(dispatched).toBe(false)
})
