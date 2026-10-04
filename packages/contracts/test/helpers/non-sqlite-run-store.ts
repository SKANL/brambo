import { createHash } from 'node:crypto'
import type { WorkflowStoreHarness } from '@brambodev/contracts'
import { validateCommand, validateCommandReceipt, validateLease, validateRunSnapshot } from '@brambodev/contracts'
import type { Admission, Command, CommandReceipt, CommitInput, Lease, Principal, RunEvent, RunKey, RunSnapshot, RunStore } from '@brambodev/contracts'

interface State {
  runs: Record<string, RunSnapshot>
  receipts: CommandReceipt[]
  events: RunEvent[]
  epochs: Record<string, { epoch: number; owner: string; tokenHash: string; expiresAt: number }>
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const keyOf = (key: RunKey): string => JSON.stringify([key.namespace, key.runId])
function canonical(value: unknown): string {
  if (!value || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`
}
function scope(key: RunKey): void {
  validateCommand({ key, clientId: 'probe', idempotencyKey: 'probe', kind: 'start', payload: null })
}
function limitOf(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Invalid limit')
  return Math.min(limit, 256)
}

/** Test-only local-process authority; serialized state survives close/reopen, not process loss. */
export function nonSqliteHarness(): WorkflowStoreHarness & { readonly authorityScope: 'local-process' } {
  let serialized = ''
  let now = 1000
  let id = 0
  const empty = (): State => ({ runs: {}, receipts: [], events: [], epochs: {} })
  let state = empty()
  const connect = (): RunStore => {
    let closed = false
    const open = (): void => { if (closed) throw new Error('Store is closed') }
    const atomic = <T>(operation: (draft: State) => T): T => {
      open()
      const draft = clone(state)
      const result = operation(draft)
      serialized = JSON.stringify(draft)
      state = JSON.parse(serialized) as State
      return clone(result)
    }
    const proposed = (command: Command, actor: Principal): CommandReceipt =>
      validateCommandReceipt({ id: `receipt-${++id}`, command: validateCommand(command), actor, phase: 'accepted' })
    const admit = (draft: State, receipt: CommandReceipt, snapshot?: RunSnapshot): Admission => {
      const command = receipt.command
      const prior = draft.receipts.find((r) => r.command.key.namespace === command.key.namespace &&
        r.command.clientId === command.clientId && r.command.idempotencyKey === command.idempotencyKey)
      if (prior) return canonical(prior.command) === canonical(command) && canonical(prior.actor) === canonical(receipt.actor)
        ? { status: 'duplicate', receipt: prior } : { status: 'conflict' }
      if (snapshot) {
        if (draft.runs[keyOf(snapshot.key)]) return { status: 'conflict' }
        draft.runs[keyOf(snapshot.key)] = snapshot
      } else if (!draft.runs[keyOf(command.key)]) return { status: 'conflict' }
      draft.receipts.push(receipt)
      return { status: 'accepted', receipt }
    }
    const unavailable = (): never => { open(); throw new Error('Public lease operations are not implemented yet') }
    return {
      async create(snapshot, command, actor) {
        open(); validateRunSnapshot(snapshot)
        const receipt = proposed(command, actor)
        if (snapshot.revision !== 0 || command.kind !== 'start' || keyOf(snapshot.key) !== keyOf(command.key)) throw new Error('Invalid creation')
        return atomic((draft) => admit(draft, receipt, snapshot))
      },
      async admit(command, actor) { open(); const receipt = proposed(command, actor); return atomic((draft) => admit(draft, receipt)) },
      async get(key) { open(); scope(key); const value = state.runs[keyOf(key)]; return value ? clone(value) : undefined },
      async receipt(namespace, id) { open(); scope({ namespace, runId: 'probe' }); const value = state.receipts.find((r) => r.command.key.namespace === namespace && r.id === id); return value ? clone(value) : undefined },
      async pending(namespace, limit) {
        open(); scope({ namespace, runId: 'probe' })
        return clone(state.receipts.filter((r) => r.command.key.namespace === namespace && ['accepted', 'running'].includes(r.phase)).slice(0, limitOf(limit)))
      },
      async commit(input: CommitInput) {
        open(); validateRunSnapshot(input.snapshot); validateLease(input.lease)
        if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || input.snapshot.revision !== input.expectedRevision + 1) throw new Error('Invalid revision')
        if (!Array.isArray(input.events) || input.events.length > 256) throw new Error('Invalid event batch')
        for (const event of input.events) {
          if (typeof event.type !== 'string' || !event.type.trim()) throw new Error('Invalid event type')
          validateCommand({ key: input.snapshot.key, clientId: 'event', idempotencyKey: 'event', kind: 'continue', payload: event.payload })
        }
        if (input.receipt) validateCommandReceipt(input.receipt)
        return atomic((draft) => {
          const next = input.snapshot
          const current = draft.runs[keyOf(next.key)]
          if (!current || current.revision !== input.expectedRevision) return { status: 'conflict' as const }
          const lease: Lease = input.lease
          const required = [`run:${current.key.runId}`, `workspace:${current.workspace.workspaceId}`, `workspace:${next.workspace.workspaceId}`]
          if (lease.namespace !== next.key.namespace || required.some((resource) => !Object.hasOwn(lease.epochs, resource)) ||
              !Object.entries(lease.epochs).every(([resource, epoch]) => {
                const row = draft.epochs[JSON.stringify([lease.namespace, resource])]
                return row?.epoch === epoch && row.owner === lease.ownerId && row.tokenHash === createHash('sha256').update(lease.token).digest('hex') && row.expiresAt === lease.expiresAt && row.expiresAt > now
              })) return { status: 'stale-lease' as const }
          if (next.workflowId !== current.workflowId || next.workflowVersion !== current.workflowVersion || next.sessionId !== current.sessionId ||
              canonical(next.lineage ?? null) !== canonical(current.lineage ?? null)) throw new Error('Run identity is immutable')
          if (input.receipt) {
            const index = draft.receipts.findIndex((r) => r.id === input.receipt?.id && r.command.key.namespace === next.key.namespace)
            const prior = draft.receipts[index]
            if (!prior || keyOf(prior.command.key) !== keyOf(next.key) || canonical(prior.command) !== canonical(input.receipt.command) ||
                canonical(prior.actor) !== canonical(input.receipt.actor)) throw new Error('Receipt provenance is immutable')
            draft.receipts[index] = input.receipt
          }
          let cursor = draft.events.filter((e) => keyOf(e.key) === keyOf(next.key)).at(-1)?.cursor ?? 0
          for (const event of input.events) draft.events.push({ ...event, schemaVersion: 1, key: next.key, cursor: ++cursor, occurredAt: new Date(now).toISOString() })
          draft.runs[keyOf(next.key)] = next
          return { status: 'committed' as const, snapshot: next }
        })
      },
      async events(key, after, limit) {
        open(); scope(key)
        if (!Number.isSafeInteger(after) || after < 0) throw new Error('Invalid cursor')
        const all = state.events.filter((event) => keyOf(event.key) === keyOf(key))
        const events = clone(all.filter((event) => event.cursor > after).slice(0, limitOf(limit)))
        return { status: events.length ? 'ok' : 'empty', events, latestCursor: all.at(-1)?.cursor ?? 0, nextCursor: events.at(-1)?.cursor ?? after }
      },
      async claim() { return unavailable() }, async renew() { return unavailable() },
      async release() { return unavailable() }, async valid() { return unavailable() },
      async close() { closed = true },
    }
  }
  return {
    authorityScope: 'local-process',
    async open() { state = empty(); serialized = JSON.stringify(state); now = 1000; return connect() },
    async reopen() { state = JSON.parse(serialized) as State; return connect() },
    advance(milliseconds) {
      if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) throw new Error('Invalid clock advance')
      now += milliseconds
    },
  }
}
