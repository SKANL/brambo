import type { Command, RunSnapshot, RunStore } from '../workflow-run.ts'
import { failWith, pass, runClauses } from './clause.ts'
import type { Clause, RunOptions, SuiteReport } from './clause.ts'

/** Each open creates fresh storage; reopen preserves the current committed store. */
export interface WorkflowStoreHarness {
  open(): Promise<RunStore>
  reopen(): Promise<RunStore>
  advance(milliseconds: number): void
}

const snapshot: RunSnapshot = {
  schemaVersion: 1, key: { namespace: 'contract', runId: 'run' }, revision: 0,
  workflowId: 'workflow', workflowVersion: '1', sessionId: 'session', status: 'pending',
  workspace: { namespace: 'contract', workspaceId: 'workspace', revision: '1' },
  tasks: [], context: null, cancelRequested: false,
}
const command: Command = {
  key: snapshot.key, clientId: 'client', idempotencyKey: 'start', kind: 'start', payload: { a: 1, b: 2 },
}
const actor = { namespace: 'contract', subject: 'trusted-host-user' }
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

export const WORKFLOW_STORE_SUITE = 'workflow-store'
export const WORKFLOW_STORE_CLAUSES: readonly Clause<WorkflowStoreHarness>[] = [
  {
    name: 'workflow-admission',
    async check(harness) {
      const store = await harness.open()
      try {
        const first = await store.create(snapshot, command, actor)
        if (first.status !== 'accepted' || !same(await store.get(snapshot.key), snapshot)) return failWith('Create must atomically admit and persist')
        const duplicate = await store.admit({ ...command, payload: { b: 2, a: 1 } }, actor)
        if (duplicate.status !== 'duplicate' || !same(duplicate.receipt, first.receipt)) return failWith('Duplicate must return the original receipt')
        for (const changed of [
          { ...command, kind: 'cancel' as const }, { ...command, payload: 'changed' },
          { ...command, key: { ...command.key, runId: 'other' } },
        ]) if ((await store.admit(changed, actor)).status !== 'conflict') return failWith('Changed command must conflict')
        if ((await store.admit(command, { ...actor, subject: 'other' })).status !== 'conflict') return failWith('Actor identity must not be reassigned')
        const other = { ...snapshot, key: { ...snapshot.key, runId: 'other' } }
        if ((await store.create(other, { ...command, key: other.key }, actor)).status !== 'conflict' || await store.get(other.key)) {
          return failWith('Conflicting admission must not create state')
        }
        return pass()
      } finally { await store.close() }
    },
  },
  {
    name: 'workflow-reopen',
    async check(harness) {
      const store = await harness.open()
      let first
      try { first = await store.create(snapshot, command, actor) } finally { await store.close() }
      const reopened = await harness.reopen()
      try {
        const duplicate = await reopened.admit(command, actor)
        return first.status === 'accepted' && duplicate.status === 'duplicate' && same(first.receipt, duplicate.receipt) &&
          same(await reopened.get(snapshot.key), snapshot) ? pass() : failWith('Reopen must retain committed state and admission')
      } finally { await reopened.close() }
    },
  },
  {
    name: 'workflow-scoped-reads',
    async check(harness) {
      const store = await harness.open()
      try {
        const first = await store.create(snapshot, command, actor)
        if (first.status !== 'accepted') return failWith('Create failed')
        if (await store.get({ ...snapshot.key, namespace: 'other' }) || await store.receipt('other', first.receipt.id) ||
            (await store.pending('other', 10)).length || (await store.events({ ...snapshot.key, namespace: 'other' }, 0, 10)).events.length) {
          return failWith('Reads must remain namespace-scoped')
        }
        const pending = await store.pending('contract', 1)
        if (pending.length !== 1 || !same(pending[0], first.receipt)) return failWith('Pending receipt query must be ordered and bounded')
        return pass()
      } finally { await store.close() }
    },
  },
  {
    // This clause intentionally fails on Task 2 implementations. A report never
    // advertises whole-suite conformance until public acquisition/fencing exists.
    name: 'workflow-atomic-commit-and-fencing',
    async check(harness) {
      const store = await harness.open()
      try {
        const first = await store.create(snapshot, command, actor)
        if (first.status !== 'accepted') return failWith('Create failed')
        const claimed = await store.claim('contract', ['run:run', 'workspace:workspace'], 'owner', 1000)
        if (claimed.status !== 'acquired') return failWith('Fresh resource claim failed')
        const next = { ...snapshot, revision: 1, status: 'running' as const }
        const receipt = { ...first.receipt, phase: 'completed' as const, outcome: 'done' }
        const committed = await store.commit({ snapshot: next, expectedRevision: 0, lease: claimed.lease,
          events: [{ type: 'started', payload: null }, { type: 'progress', payload: 1 }], receipt })
        if (committed.status !== 'committed' || !same(await store.get(snapshot.key), next) ||
            !same(await store.receipt('contract', receipt.id), receipt)) return failWith('State, events and receipt must commit together')
        const page = await store.events(snapshot.key, 0, 1)
        const following = await store.events(snapshot.key, page.nextCursor, 1)
        if (!same(page.events.map((event) => event.cursor), [1]) || !same(following.events.map((event) => event.cursor), [2]) ||
            page.latestCursor !== 2 || following.nextCursor !== 2) return failWith('Ordered replay must not skip events')
        if ((await store.commit({ snapshot: next, expectedRevision: 0, lease: claimed.lease, events: [] })).status !== 'conflict') {
          return failWith('Stale revision must not overwrite state')
        }
        harness.advance(1000)
        if ((await store.commit({ snapshot: { ...next, revision: 2 }, expectedRevision: 1, lease: claimed.lease, events: [] })).status !== 'stale-lease') {
          return failWith('Expired ownership must not commit')
        }
        return pass()
      } finally { await store.close() }
    },
  },
]

export function runWorkflowStoreContractSuite(harness: WorkflowStoreHarness, options?: RunOptions): Promise<SuiteReport> {
  return runClauses(WORKFLOW_STORE_SUITE, WORKFLOW_STORE_CLAUSES, harness, options)
}
