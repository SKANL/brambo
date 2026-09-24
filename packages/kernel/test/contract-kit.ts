import type {
  PermissionAuditEvent,
  PermissionDecisionPolicy,
  PermissionEvaluation,
  PermissionRequestContext,
} from '../src/permissions.ts'
import type { PermissionClock } from '../src/permissions.ts'
import type { PermissionTimer } from '../src/acp.ts'
import type { ReplayableUpdateLog } from '../src/acp.ts'
import { createReplayableUpdateLog } from '../src/acp.ts'

/** Deterministic clock for contract tests; never reads wall-clock time. */
export interface TestClock extends PermissionClock {
  advance(milliseconds: number): void
  set(milliseconds: number): void
}

export function createTestClock(initial = 0): TestClock {
  let current = initial
  return { now: () => current, advance: (ms) => { current += ms }, set: (ms) => { current = ms } }
}

/** Manual timer paired with TestClock. Call runDue after advancing the clock. */
export interface TestTimer extends PermissionTimer {
  runDue(): void
  readonly pending: number
}

export function createTestTimer(clock: PermissionClock): TestTimer {
  let nextId = 0
  const timers = new Map<number, { callback: () => void; due: number }>()
  return {
    setTimeout(callback, timeoutMs) { const id = ++nextId; timers.set(id, { callback, due: clock.now() + timeoutMs }); return id },
    clearTimeout(handle) { timers.delete(handle as number) },
    get pending() { return timers.size },
    runDue() {
      for (const [id, timer] of [...timers]) if (timer.due <= clock.now()) { timers.delete(id); timer.callback() }
    },
  }
}

export function createTestAuditSink(): { readonly events: readonly PermissionAuditEvent[]; readonly sink: { append(event: PermissionAuditEvent): void } } {
  const events: PermissionAuditEvent[] = []
  return { events, sink: { append: (event) => { events.push(event) } } }
}

export function createTestPolicy(evaluate: (request: PermissionRequestContext) => PermissionEvaluation): PermissionDecisionPolicy {
  return { evaluate }
}

export function createTestReplayStore<T>(capacity = 32): ReplayableUpdateLog<T> {
  return createReplayableUpdateLog<T>(capacity)
}

/** Minimal executor fake used by lifecycle contract tests. */
export interface TestExecutor<T = unknown> {
  readonly calls: readonly T[]
  run(value: T): Promise<void>
}

export function createTestExecutor<T>(): TestExecutor<T> {
  const calls: T[] = []
  return { calls, async run(value) { calls.push(value) } }
}


