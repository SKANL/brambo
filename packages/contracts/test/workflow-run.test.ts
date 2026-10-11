import { describe, expect, expectTypeOf, it } from 'vitest'
import { validateRunSnapshot, validateCommand, validateCommandReceipt, validateLease, RUN_SNAPSHOT_SCHEMA } from '../src/workflow-run.ts'
import { BramboError, BRAMBO_ERROR_CODES } from '../src/errors.ts'
import type { OrchestrationStateStore, OrchestrationTaskRecord } from '../src/orchestration.ts'
import type { SessionEventLog } from '../src/session-events.ts'
import type { ExecutorAdapter, RunRequest, ResultEnvelope, RunSnapshot, RunStore, Principal } from '../src/index.ts'

const key = { namespace: 'team', runId: 'run-1' }
const workspace = { namespace: 'team', workspaceId: 'work-1', revision: 'rev-1' }
const snapshot = {
  schemaVersion: 1, key, revision: 0, workflowId: 'build', workflowVersion: '1.0.0',
  sessionId: 'session-1', status: 'pending', workspace, tasks: [], context: null, cancelRequested: false,
}
const command = { key, clientId: 'client-1', idempotencyKey: 'request-1', kind: 'start', payload: { prompt: 'Build' } }
const receipt = { id: 'receipt-1', command, actor: { namespace: 'team', subject: 'user-1' }, phase: 'accepted' }
const lease = { namespace: 'team', ownerId: 'owner-1', token: 'opaque', expiresAt: 1000, epochs: { 'run:run-1': 1, 'workspace:work-1': 1 } }

describe('durable workflow records', () => {
  it('keeps legacy snapshots free of optional execution controls', () => {
    expect(validateRunSnapshot(snapshot)).toBe(snapshot)
    expect(Object.hasOwn(validateRunSnapshot(snapshot), 'executionConfigurations')).toBe(false)
  })
  it('accepts explicit version-1 fixtures without changing their JSON representation', () => {
    expect(validateRunSnapshot(snapshot)).toEqual(snapshot)
    expect(validateCommand(command)).toEqual(command)
    expect(validateCommandReceipt(receipt)).toEqual(receipt)
    expect(validateLease(lease)).toEqual(lease)
    expect(RUN_SNAPSHOT_SCHEMA['~standard'].validate(snapshot)).toEqual({ value: snapshot })
  })
  it('schema-version-refusal uses a coded error and Standard Schema issues', () => {
    expect(() => validateRunSnapshot({ ...snapshot, schemaVersion: 2 })).toThrow(/schema version/)
    try { validateRunSnapshot({ ...snapshot, schemaVersion: 2 }) } catch (error) {
      expect(error).toBeInstanceOf(BramboError)
      expect((error as BramboError).code).toBe(BRAMBO_ERROR_CODES.contractEnvelopeInvalid)
    }
    expect(RUN_SNAPSHOT_SCHEMA['~standard'].validate({ ...snapshot, schemaVersion: 2 })).toHaveProperty('issues')
  })
  it('rejects duplicate task IDs', () => {
    const task = { taskId: 'task-1', phase: 'pending', attempt: 0 }
    expect(() => validateRunSnapshot({ ...snapshot, tasks: [task, task] })).toThrow()
  })
  it.each([-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])('rejects invalid revision/attempt %s', (number) => {
    expect(() => validateRunSnapshot({ ...snapshot, revision: number })).toThrow()
    expect(() => validateRunSnapshot({ ...snapshot, tasks: [{ taskId: 'task-1', phase: 'uncertain', attempt: number }] })).toThrow()
  })
  it.each(['../run', 'run:other', '', 'a/b', '__proto__'])('rejects unsafe run resource ID %s', (runId) => {
    expect(() => validateCommand({ ...command, key: { ...key, runId } })).toThrow()
  })
  it.each([Infinity, NaN, -0, undefined, BigInt(1), Symbol('x'), () => 1, new Date(), Object.create({ inherited: true })])('rejects nonportable payload %s', (value) => {
    expect(() => validateCommand({ ...command, payload: { value } })).toThrow()
  })
  it('rejects cyclic, sparse, decorated and accessor-bearing JSON without invoking getters', () => {
    const cycle: Record<string, unknown> = {}; cycle['self'] = cycle
    const getter = Object.defineProperty({}, 'secret', { enumerable: true, get() { throw new Error('getter invoked') } })
    const decorated = Object.assign([1], { extra: true })
    for (const payload of [cycle, Array(1), decorated, getter, { [Symbol('secret')]: 1 }, Object.defineProperty({}, 'hidden', { value: 1 })]) {
      expect(() => validateCommand({ ...command, payload })).toThrow(/schema violation/)
    }
  })
  it('accepts finite nested JSON and repeated noncyclic values', () => {
    const shared = { answer: 42 }; const payload = { values: [null, true, false, 1.25, 'hello', shared, shared] }
    expect(validateCommand({ ...command, payload })).toEqual({ ...command, payload })
  })
  it('accepts complete checkpoints, provider bindings and isolated child workspaces', () => {
    const complete = {
      ...snapshot, revision: 2, status: 'running', lineage: { namespace: 'team', runId: 'parent-1' },
      binding: { driverId: 'custom', driverVersion: '1.0.0', providerId: 'provider-1', accountRef: 'account', nativeSessionId: 'native', compatibility: { streaming: true } },
      tasks: [{ taskId: 'task-1', phase: 'uncertain', attempt: 1, effectId: 'call-1', result: { value: 1 }, workspace: { ...workspace, workspaceId: 'child-1' }, error: { code: 'UNCERTAIN', message: 'Termination unconfirmed' } }],
    }
    expect(JSON.parse(JSON.stringify(validateRunSnapshot(complete)))).toEqual(complete)
  })
  it('persists only the safe provider failure projection in task errors', () => {
    const providerFailure = { failurePhase: 'provider-response', status: 200, requestAccepted: true }
    const task = { taskId: 'task-1', phase: 'blocked', attempt: 1,
      error: { code: 'task-execution-failed', message: 'Attempt settled without success', providerFailure } }
    const withDiagnostic = { ...snapshot, status: 'blocked', tasks: [task] }

    expect(validateRunSnapshot(withDiagnostic)).toEqual(withDiagnostic)
    expect(() => validateRunSnapshot({ ...withDiagnostic, tasks: [{ ...task,
      error: { ...task.error, providerFailure: { ...providerFailure, message: 'untrusted provider text' } } }] })).toThrow(/unexpected object field/)
  })
  it('rejects invalid receipt actor and mismatched namespace', () => {
    for (const actor of [undefined, { namespace: 'other', subject: 'user-1' }, { namespace: 'team', subject: '' }]) {
      expect(() => validateCommandReceipt({ ...receipt, actor })).toThrow()
    }
    expect(() => validateCommand({ ...command, actor: receipt.actor })).toThrow()
  })
  it('rejects snapshot cross-namespace workspace, lineage and task output', () => {
    expect(() => validateRunSnapshot({ ...snapshot, workspace: { ...workspace, namespace: 'other' } })).toThrow()
    expect(() => validateRunSnapshot({ ...snapshot, lineage: { ...key, namespace: 'other' } })).toThrow()
    expect(() => validateRunSnapshot({ ...snapshot, tasks: [{ taskId: 'task-1', phase: 'succeeded', attempt: 1, workspace: { ...workspace, namespace: 'other' } }] })).toThrow()
  })
  it('rejects wrong resource/epoch scope', () => {
    for (const epochs of [{}, { 'task:run-1': 1 }, { 'workspace:../escape': 1 }, { 'run:run-1:extra': 1 }, { 'team:run:run-1': 1 }, { 'run:run-1': -1 }, { 'run:run-1': 0 }, { 'run:run-1': Infinity }]) {
      expect(() => validateLease({ ...lease, epochs })).toThrow()
    }
    expect(() => validateLease({ ...lease, expiresAt: Infinity })).toThrow()
    expect(validateLease({ ...lease, epochs: { 'task:run-1:task-1': 2 } })).toHaveProperty('epochs')
    expect(validateLease({ ...lease, epochs: { 'import:run-1': 2 } })).toHaveProperty('epochs')
    for (const resource of ['import:run-1:extra', 'import:../run', 'import:']) {
      expect(() => validateLease({ ...lease, epochs: { [resource]: 1 } })).toThrow()
    }
  })
  it('does not persist lease evidence or unknown fields in durable records', () => {
    expect(() => validateRunSnapshot({ ...snapshot, publicationLease: lease })).toThrow()
    expect(() => validateCommandReceipt({ ...receipt, lease })).toThrow()
  })
  it('keeps legacy signatures synchronous and adds explicit host actor admission', () => {
    expectTypeOf<OrchestrationStateStore['load']>().toEqualTypeOf<() => readonly OrchestrationTaskRecord[]>()
    expectTypeOf<ReturnType<OrchestrationStateStore['save']>>().toEqualTypeOf<void>()
    expectTypeOf<ReturnType<SessionEventLog['read']>>().toEqualTypeOf<readonly import('../src/session-events.ts').SessionEvent[]>()
    expectTypeOf<ExecutorAdapter['run']>().toEqualTypeOf<(request: RunRequest) => Promise<ResultEnvelope>>()
    expectTypeOf<Parameters<RunStore['create']>>().toEqualTypeOf<[snapshot: RunSnapshot, command: import('../src/workflow-run.ts').Command, actor: Principal]>()
    expectTypeOf<RunSnapshot>().toEqualTypeOf<Readonly<RunSnapshot>>()
  })
})
