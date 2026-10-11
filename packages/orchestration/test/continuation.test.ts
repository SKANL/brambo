import { describe, expect, it } from 'vitest'
import { defineStandardSchema } from '@brambodev/contracts'
import type { DriverManifest, JsonValue, ProviderBinding, RunSnapshot } from '@brambodev/contracts'
import * as continuationEntry from '@brambodev/orchestration/continuation'
import * as publicApi from '../src/index.ts'

const binding: ProviderBinding = { driverId: 'custom', driverVersion: '1', providerId: 'vendor', accountRef: 'account-ref', nativeSessionId: 'native-a', compatibility: { format: 'v1' } }
const snapshot: RunSnapshot = { schemaVersion: 1, key: { namespace: 'test', runId: 'run' }, revision: 2, workflowId: 'workflow', workflowVersion: 'v1', sessionId: 'brambo-session', status: 'running', workspace: { namespace: 'test', workspaceId: 'workspace', revision: 'sha256:old' }, tasks: [{ taskId: 'task', phase: 'pending', attempt: 1 }], context: { instruction: 'durable' }, binding, cancelRequested: false }
const driver: DriverManifest = { id: 'custom', version: '1', kind: 'custom', capabilities: ['native-continuation', 'context-reconstruction'], configurationSchema: defineStandardSchema((value) => ({ value })) }
function context(): JsonValue {
  return JSON.parse(JSON.stringify({ schemaVersion: 1, identity: { key: snapshot.key, sessionId: snapshot.sessionId, workflowId: snapshot.workflowId, workflowVersion: snapshot.workflowVersion, revision: snapshot.revision, workspace: snapshot.workspace }, snapshot, events: { after: 0, latestCursor: 1, items: [{ schemaVersion: 1, key: snapshot.key, cursor: 1, type: 'task.started', payload: { taskId: 'task' }, occurredAt: '2026-10-04T00:00:00Z' }] }, artifacts: [snapshot.workspace], capabilities: driver.capabilities, native: { available: true, binding } })) as JsonValue
}
const options = () => ({ snapshot, driver, providerId: 'vendor', accountRef: 'account-ref', workflowVersion: 'v1', required: [] as string[], authorizedContext: context(), maxContextBytes: 10000 })
const select = (input = options()) => publicApi.selectContinuation(input)

describe('truthful continuation selection', () => {
  it('exports the selector and centralized IDs', () => {
    expect(publicApi).toHaveProperty('selectContinuation', expect.any(Function))
    expect(publicApi.CONTINUATION_CAPABILITIES).toEqual({ native: 'native-continuation', reconstruction: 'context-reconstruction' })
  })
  it('exposes the same continuation behavior through a focused package subpath', () => {
    expect(continuationEntry.selectContinuation).toBe(publicApi.selectContinuation)
    expect(continuationEntry.CONTINUATION_CAPABILITIES).toBe(publicApi.CONTINUATION_CAPABILITIES)
  })
  it('selects exact native binding with current availability evidence', () => {
    expect(select()).toMatchObject({ mode: 'native', binding })
  })
  it.each(['driverId', 'driverVersion', 'providerId', 'accountRef', 'compatibility'] as const)('reconstructs on native %s binding-mismatch', (field) => {
    const input = options()
    input.snapshot = { ...snapshot, binding: { ...binding, [field]: field === 'compatibility' ? { format: 'v0' } : 'old' } }
    const evidence = context() as Record<string, JsonValue>
    evidence['snapshot'] = JSON.parse(JSON.stringify(input.snapshot)) as JsonValue
    input.authorizedContext = evidence
    expect(select(input)).toMatchObject({ mode: 'reconstructed' })
    expect(select(input)).not.toHaveProperty('binding')
  })
  it('blocks unsupported required native instead of silently reconstructing', () => {
    expect(select({ ...options(), driver: { ...driver, capabilities: ['context-reconstruction'] }, required: ['native-continuation'] })).toMatchObject({ mode: 'blocked', reason: 'required-capability-unavailable' })
  })
  it('does not infer current native availability from persisted binding', () => {
    const input = options(); const evidence = input.authorizedContext as Record<string, JsonValue>; delete evidence['native']
    expect(select(input).mode).toBe('reconstructed')
    input.required = ['native-continuation']
    expect(select(input)).toMatchObject({ mode: 'blocked', reason: 'native-incompatible' })
  })
  it('requires negotiated native, not merely advertised native', () => {
    const input = options(); (input.authorizedContext as Record<string, JsonValue>)['capabilities'] = ['context-reconstruction']
    expect(select(input).mode).toBe('reconstructed')
  })
  it('blocks missing durable context', () => {
    expect(select({ ...options(), authorizedContext: null })).toMatchObject({ mode: 'blocked', reason: 'context-missing' })
  })
  it('blocks workflow version mismatch', () => {
    expect(select({ ...options(), workflowVersion: 'v2' })).toMatchObject({ mode: 'blocked', reason: 'workflow-version-mismatch' })
  })
  it.each(['identity', 'snapshot', 'events', 'artifacts'])('blocks absent %s evidence', (field) => {
    const input = options(); delete (input.authorizedContext as Record<string, JsonValue>)[field]
    expect(select(input).mode).toBe('blocked')
  })
  it('blocks mismatched workspace revision and unordered or incomplete events', () => {
    for (const events of [{ after: 0, latestCursor: 2, items: [] }, { after: 0, latestCursor: 1, items: [{ cursor: 2, key: snapshot.key }] }]) {
      const input = options(); (input.authorizedContext as Record<string, JsonValue>)['events'] = JSON.parse(JSON.stringify(events)) as JsonValue
      expect(select(input).mode).toBe('blocked')
    }
    const input = options(); (input.authorizedContext as Record<string, JsonValue>)['artifacts'] = [{ ...snapshot.workspace, revision: 'other' }]
    expect(select(input).mode).toBe('blocked')
  })
  it('uses UTF-8 byte limits, preserves refs, and never truncates', () => {
    const input = options(); (input.authorizedContext as Record<string, JsonValue>)['note'] = '😀'.repeat(50)
    const bytes = Buffer.byteLength(JSON.stringify(input.authorizedContext), 'utf8')
    expect(select({ ...input, maxContextBytes: bytes - 1 })).toMatchObject({ mode: 'blocked', reason: 'context-over-budget' })
    const selection = select({ ...input, maxContextBytes: bytes })
    expect(selection.mode).not.toBe('blocked')
    if (selection.mode === 'blocked') throw new Error(selection.message)
    expect(selection.context).toEqual(input.authorizedContext)
    expect(selection.context).not.toBe(input.authorizedContext)
  })
  it('starts fresh only for a never-started snapshot', () => {
    const fresh = { ...snapshot, revision: 0, binding: undefined, status: 'pending' as const, tasks: [{ taskId: 'task', phase: 'pending' as const, attempt: 0 }] }
    delete fresh.binding
    expect(select({ ...options(), snapshot: fresh, authorizedContext: null })).toMatchObject({ mode: 'fresh', context: null })
  })
})
