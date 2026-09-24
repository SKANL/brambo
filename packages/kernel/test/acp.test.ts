import { describe, expect, it, vi } from 'vitest'
import {
  createBoundedQueue,
  createCancellationController,
  createAgentError,
  createPermissionBroker,
  createSessionSupervisor,
  createPromptAdmissionStore,
  createReplayableUpdateLog,
  type PermissionRequest,
} from '../src/acp.ts'

describe('ACP-neutral kernel primitives', () => {
  it('enforces a terminal session state and rejects later transitions', () => {
    const session = createSessionSupervisor('session-1', { affinity: { sessionId: 'session-1', executorId: 'executor-1' } })
    expect(session.affinity?.executorId).toBe('executor-1')
    expect(session.state).toBe('created')
    expect(session.start()).toEqual({ ok: true, state: 'active' })
    expect(session.queueTurn('turn-1')).toEqual({ ok: true, state: 'active' })
    expect(session.beginTurn('turn-1')).toEqual({ ok: true, state: 'running' })
    expect(session.completeTurn()).toEqual({ ok: true, state: 'active' })
    expect(session.close()).toEqual({ ok: true, state: 'closed' })
    expect(session.start()).toEqual({ ok: false, reason: 'terminal', state: 'closed' })
  })

  it('requires queued turns and supports sequential terminal turns', () => {
    const session = createSessionSupervisor('multi-turn')
    expect(session.start()).toEqual({ ok: true, state: 'active' })
    expect(session.beginTurn('turn-1')).toEqual({ ok: false, reason: 'invalid-state', state: 'active' })
    expect(session.queueTurn('turn-1')).toEqual({ ok: true, state: 'active' })
    expect(session.beginTurn('turn-1')).toEqual({ ok: true, state: 'running' })
    expect(session.completeTurn()).toEqual({ ok: true, state: 'active' })
    expect(session.turnId).toBe('turn-1')
    expect(session.turnState).toBe('completed')
    expect(session.queueTurn('turn-1')).toEqual({ ok: false, reason: 'invalid-state', state: 'active' })
    expect(session.queueTurn('turn-2')).toEqual({ ok: true, state: 'active' })
    expect(session.turnId).toBe('turn-2')
    expect(session.turnState).toBe('queued')
    expect(session.completeTurn()).toEqual({ ok: false, reason: 'invalid-state', state: 'active' })
    expect(session.beginTurn('turn-2')).toEqual({ ok: true, state: 'running' })
    expect(session.completeTurn()).toEqual({ ok: true, state: 'active' })
    expect(session.turnId).toBe('turn-2')
    expect(session.turnState).toBe('completed')
  })

  it('cancels the current turn without cancelling the session', () => {
    const session = createSessionSupervisor('turn-cancel')
    session.start()
    session.queueTurn('turn-1')
    session.beginTurn('turn-1')
    expect(session.cancelTurn()).toEqual({ ok: true, state: 'active' })
    expect(session.state).toBe('active')
    expect(session.turnState).toBe('cancelled')
    expect(session.completeTurn()).toEqual({ ok: false, reason: 'invalid-state', state: 'active' })
    expect(session.queueTurn('turn-2')).toEqual({ ok: true, state: 'active' })
  })

  it('does not mutate terminal turn outcomes when cancelling or closing the session', () => {
    const session = createSessionSupervisor('terminal-turn')
    session.start()
    session.queueTurn('turn-1')
    session.beginTurn('turn-1')
    session.cancelTurn()
    expect(session.turnId).toBe('turn-1')
    expect(session.turnState).toBe('cancelled')
    expect(session.cancel()).toEqual({ ok: true, state: 'cancelling' })
    expect(session.turnState).toBe('cancelled')
    expect(session.close()).toEqual({ ok: true, state: 'closed' })
    expect(session.turnId).toBe('turn-1')
    expect(session.turnState).toBe('cancelled')
  })

  it('keeps executor affinity stable across turns', () => {
    const session = createSessionSupervisor('affinity-stable', { affinity: { sessionId: 'affinity-stable', executorId: 'executor-1' } })
    session.start()
    session.queueTurn('turn-1')
    session.beginTurn('turn-1')
    session.completeTurn()
    session.queueTurn('turn-2')
    session.beginTurn('turn-2')
    expect(session.affinity).toEqual({ sessionId: 'affinity-stable', executorId: 'executor-1' })
  })

  it('supports queued turns and explicit session completion', () => {
    const session = createSessionSupervisor('session-complete')
    expect(session.start()).toEqual({ ok: true, state: 'active' })
    expect(session.queueTurn('turn-queued')).toEqual({ ok: true, state: 'active' })
    expect(session.turnState).toBe('queued')
    expect(session.beginTurn('turn-queued')).toEqual({ ok: true, state: 'running' })
    expect(session.completeTurn()).toEqual({ ok: true, state: 'active' })
    expect(session.turnState).toBe('completed')
    expect(session.complete()).toEqual({ ok: true, state: 'completed' })
    expect(session.complete()).toEqual({ ok: false, reason: 'terminal', state: 'completed' })
  })

  it('rejects affinity bound to a different session', () => {
    expect(() => createSessionSupervisor('session-1', { affinity: { sessionId: 'other', executorId: 'executor-1' } })).toThrow(
      'executor affinity must reference the supervised session',
    )
  })

  it('propagates cancellation once and preserves the reason', () => {
    const controller = createCancellationController()
    const listener = vi.fn()
    controller.signal.onCancel(listener)
    expect(controller.cancel({ kind: 'timeout', message: 'deadline exceeded' })).toBe(true)
    expect(controller.cancel({ kind: 'user', message: 'stop' })).toBe(false)
    expect(controller.signal.state).toBe('cancelled')
    expect(controller.signal.reason).toEqual({ kind: 'timeout', message: 'deadline exceeded' })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('returns typed overload outcomes instead of dropping updates', () => {
    const queue = createBoundedQueue<string>(1)
    expect(queue.enqueue('first')).toEqual({ status: 'accepted', size: 1 })
    expect(queue.enqueue('second')).toEqual({ status: 'overloaded', size: 1, capacity: 1 })
    expect(queue.dequeue()).toEqual({ status: 'item', value: 'first', size: 0 })
    queue.close()
    expect(queue.enqueue('third')).toEqual({ status: 'closed', size: 0 })
  })

  it('keeps permission outcomes explicit and resolves requests by id', async () => {
    const broker = createPermissionBroker()
    const request: PermissionRequest = { id: 'p-1', action: 'filesystem.write', reason: 'save output' }
    const pending = broker.request(request)
    expect(broker.pending).toBe(1)
    expect(broker.decide('p-1', { kind: 'denied', reason: 'user-denied' })).toBe(true)
    await expect(pending).resolves.toEqual({ kind: 'denied', reason: 'user-denied' })
    expect(broker.pending).toBe(0)
    expect(broker.decide('unknown', { kind: 'approved' })).toBe(false)
  })

  it('expires timed permission requests and clears the injected timer', async () => {
    let callback: (() => void) | undefined
    let cleared = false
    const pending = createPermissionBroker().request(
      { id: 'p-timeout', action: 'filesystem.write' },
      { timeoutMs: 10, timer: { setTimeout: (next) => { callback = next; return 1 }, clearTimeout: () => { cleared = true } } },
    )
    callback?.()
    await expect(pending).resolves.toEqual({ kind: 'expired', reason: 'permission request expired' })
    expect(cleared).toBe(true)
  })

  it('rejects duplicate permission requests without replacing the original', async () => {
    const broker = createPermissionBroker()
    const first = broker.request({ id: 'duplicate', action: 'filesystem.write' })
    await expect(broker.request({ id: 'duplicate', action: 'filesystem.write' })).rejects.toThrow('already pending')
    expect(broker.decide('duplicate', { kind: 'approved' })).toBe(true)
    await expect(first).resolves.toEqual({ kind: 'approved' })
  })

  it('creates immutable typed agent error descriptors', () => {
    const error = createAgentError({
      category: 'overloaded', message: 'update queue is full', retryable: true, sessionValid: true,
      recoveryHint: 'retry after draining updates',
    })
    expect(Object.isFrozen(error)).toBe(true)
    expect(error).toMatchObject({ category: 'overloaded', retryable: true, sessionValid: true })
  })

  it('replays ordered updates and reports ring overflow explicitly', () => {
    const log = createReplayableUpdateLog<string>(2)
    expect(log.append('one')).toMatchObject({ status: 'accepted', entry: { cursor: 1 } })
    expect(log.append('two')).toMatchObject({ status: 'accepted', entry: { cursor: 2 } })
    expect(log.append('three')).toMatchObject({ status: 'overloaded', entry: { cursor: 3 }, droppedCursor: 1 })
    expect(log.oldestCursor).toBe(2)
    expect(log.latestCursor).toBe(3)
    expect(log.readAfter(0)).toMatchObject({ status: 'overflow', requestedCursor: 0, oldestCursor: 2 })
    expect(log.readAfter(1)).toMatchObject({ status: 'ok', entries: [{ cursor: 2 }, { cursor: 3 }] })
    expect(Object.isFrozen(log.readAfter(1).entries[0])).toBe(true)
  })

  it('closes replay log and rejects later appends while retaining reads', () => {
    const log = createReplayableUpdateLog<string>(1)
    log.append('kept')
    log.close()
    expect(log.append('rejected')).toEqual({ status: 'closed', latestCursor: 1 })
    expect(log.readAfter(0)).toMatchObject({ status: 'ok', closed: true, entries: [{ update: 'kept' }] })
  })

  it('returns the original prompt receipt for duplicate admission and rejects conflicts', () => {
    const store = createPromptAdmissionStore()
    const first = store.admit({ clientId: 'client-1', idempotencyKey: 'key-1', payload: { prompt: 'hello' } })
    expect(first.status).toBe('accepted')
    if (first.status !== 'accepted') return
    const duplicate = store.admit({ clientId: 'client-1', idempotencyKey: 'key-1', payload: { prompt: 'hello' } })
    expect(duplicate).toEqual({ status: 'duplicate', receipt: first.receipt })
    const conflict = store.admit({ clientId: 'client-1', idempotencyKey: 'key-1', payload: { prompt: 'different' } })
    expect(conflict).toMatchObject({ status: 'conflict', error: { category: 'invalid-request', retryable: false } })
  })

  it('rejects prompt admission after close and validates identity fields', () => {
    const store = createPromptAdmissionStore()
    store.close()
    expect(store.admit({ clientId: 'client-1', idempotencyKey: 'key-1', payload: null })).toMatchObject({ status: 'closed' })
    expect(() => createPromptAdmissionStore().admit({ clientId: '', idempotencyKey: 'key-1', payload: null })).toThrow()
  })
})
