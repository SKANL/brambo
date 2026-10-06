import { createHash, randomUUID } from 'node:crypto'
import { validateCommand, validateCommandReceipt, validateLease, validateRuntimeOutcome, validateToolCall, validateRunSnapshot } from '@brambodev/contracts'
import type {
  ArtifactManifest, ArtifactProvider, CommandReceipt, EffectJournal, JsonValue, Lease,
  JsonObject, Principal, RegisteredTool, RunEvent, RunKey, RunSnapshot, RunStore, RuntimeOutcome, TaskCheckpoint, ToolCall, WorkspaceRef,
} from '@brambodev/contracts'
import { validateWorkflowDefinition } from './workflow-registry.ts'
import type { WorkflowDefinition, WorkflowTaskDefinition } from './workflow-registry.ts'
import { commitPublishedTaskResult, publishTaskArtifacts } from './publication.ts'

export interface TaskPreparationContext {
  readonly key: RunKey
  readonly taskId: string
  readonly attempt: number
  readonly definition: WorkflowTaskDefinition
  readonly snapshot: RunSnapshot
  readonly signal: AbortSignal
}
export interface TaskExecutionContext extends TaskPreparationContext {
  /** Covers only this task and isolated workspace; no run-parent token. */
  readonly lease: Lease
  readonly workspace: WorkspaceRef
  readonly events: readonly RunEvent[]
  readonly artifacts: readonly { readonly workspace: WorkspaceRef; readonly manifest: ArtifactManifest }[]
  readonly journal: EffectJournal
  /** Host renewal owner hands back the same token/resource epochs, never new authority. */
  readonly acceptRenewedLease: (lease: Lease) => Promise<void>
}
export interface DurableWorkflowOptions {
  readonly key: RunKey
  readonly principal: Principal
  readonly lease: Lease
  readonly store: RunStore
  readonly artifacts: ArtifactProvider
  readonly definition: WorkflowDefinition
  /** Host prepares isolated immutable inputs; engine claims their writer scope. */
  readonly prepareTask: (context: TaskPreparationContext) => Promise<WorkspaceRef>
  readonly executeTask: (context: TaskExecutionContext) => Promise<RuntimeOutcome>
  readonly signal: AbortSignal
  readonly concurrency: number
  readonly taskLeaseTtlMs?: number
  /** Private host handoff from the sole parent renewal owner; never sent to children. */
  readonly currentParentLease?: () => Promise<Lease>
}

function sameAuthority(previous: Lease, next: Lease): void {
  validateLease(next)
  if (previous.token !== next.token || previous.ownerId !== next.ownerId || previous.namespace !== next.namespace ||
      canonical(previous.epochs) !== canonical(next.epochs)) throw new Error('Renewal authority mismatch')
}

function canonical(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical((value as JsonObject)[key]!)).join(',') + '}'
}
interface EffectEvidence {
  readonly call: ToolCall
  readonly effect: RegisteredTool['effect']
  readonly attempt: number
  readonly completed: boolean
  readonly result?: JsonValue
}
function effects(events: readonly RunEvent[], taskId: string): Map<string, EffectEvidence> {
  const records = new Map<string, EffectEvidence>()
  for (const event of events) {
    if (event.type !== 'task.effect.started' && event.type !== 'task.effect.completed') continue
    const payload = event.payload as unknown as { taskId: string; attempt: number; call: ToolCall; effect: RegisteredTool['effect']; callId: string; result: JsonValue }
    if (payload.taskId !== taskId) continue
    if (event.type === 'task.effect.started') {
      records.set(payload.call.id, { call: payload.call, effect: payload.effect, attempt: payload.attempt, completed: false })
    } else {
      const record = records.get(payload.callId)
      if (!record) throw new Error('Incomplete durable effect journal')
      records.set(payload.callId, { ...record, completed: true, result: payload.result })
    }
  }
  return records
}

/** One parent transition queue is the sole CAS owner; workers receive no store. */
export async function runDurableWorkflow(options: DurableWorkflowOptions): Promise<RunSnapshot> {
  const { store, artifacts, key, principal, lease, signal } = options
  const definition = validateWorkflowDefinition(options.definition)
  if (!Number.isSafeInteger(options.concurrency) || options.concurrency < 1) throw new Error('Invalid concurrency')
  if (principal.namespace !== key.namespace || lease.namespace !== key.namespace) throw new Error('Run namespace mismatch')
  const snapshot = await store.get(key)
  if (!snapshot) throw new Error('Run not found')
  if (Object.hasOwn(snapshot, 'importState')) {
    validateRunSnapshot(snapshot)
    if (snapshot.importState!.phase !== 'completed') throw new Error('Workflow import pending')
  }
  if (snapshot.workflowId !== definition.id || snapshot.workflowVersion !== definition.version ||
      snapshot.tasks.some((task) => !definition.tasks.some((item) => item.id === task.taskId))) throw new Error('Workflow compatibility mismatch')
  let current: RunSnapshot = snapshot
  let queue: Promise<unknown> = Promise.resolve()
  let fatal: unknown
  let stopping = current.cancelRequested || signal.aborted
  let cancelReceipt: CommandReceipt | undefined
  let terminalCommitted = false
  const children = new Map<string, AbortController>()
  const active = new Map<string, Promise<void>>()
  const workspaceIds = new Set([current.workspace.workspaceId])
  async function parentAuthority(): Promise<Lease> {
    const next = options.currentParentLease ? await options.currentParentLease() : lease
    sameAuthority(lease, next)
    return next
  }
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(async () => {
      if (fatal) throw fatal
      try { return await operation() } catch (error) {
        fatal = error; stopping = true
        for (const controller of children.values()) controller.abort()
        throw error
      }
    })
    queue = result.catch(() => undefined)
    return result
  }
  async function transition(next: RunSnapshot, type: string, payload: JsonValue, receipt?: CommandReceipt): Promise<void> {
    const committed = await store.commit({ snapshot: { ...next, revision: current.revision + 1 },
      expectedRevision: current.revision, lease: await parentAuthority(), events: [{ type, payload }], ...(receipt ? { receipt } : {}) })
    if (committed.status !== 'committed') throw new Error(committed.status)
    current = committed.snapshot
  }
  async function checkpoint(task: TaskCheckpoint, type: string): Promise<void> {
    await transition({ ...current, tasks: current.tasks.map((item) => item.taskId === task.taskId ? task : item) }, type,
      { taskId: task.taskId, attempt: task.attempt, phase: task.phase })
  }
  async function history(): Promise<readonly RunEvent[]> {
    const events: RunEvent[] = []
    let cursor = 0
    while (true) {
      const page = await store.events(key, cursor, 256)
      if (page.status === 'overflow') throw new Error('Durable event history unavailable')
      for (const event of page.events) {
        if (event.cursor <= cursor || event.key.namespace !== key.namespace || event.key.runId !== key.runId) throw new Error('Invalid durable event ordering')
        cursor = event.cursor; events.push(event)
      }
      if (cursor >= page.latestCursor) return events
      if (page.events.length === 0) throw new Error('Incomplete durable event history')
    }
  }
  async function requestCancel(): Promise<void> {
    if (terminalCommitted) {
      // The terminal transition won ordering. Record cancellation as a processed
      // no-op, not termination evidence, and do not reopen this invocation.
      const admitted = await store.admit({ key, clientId: 'durable-engine', idempotencyKey: `cancel:${key.namespace}:${key.runId}`, kind: 'cancel', payload: null }, principal)
      if (admitted.status === 'conflict') throw new Error('Cancel command conflict')
      await transition(current, 'run.cancel.too-late', { status: current.status },
        { ...admitted.receipt, phase: 'completed', outcome: { applied: false, status: current.status } })
      return
    }
    if (!cancelReceipt) {
      // Cancellation belongs to its original admission actor, not the new lease
      // owner. Re-admitting its stable key under a takeover principal conflicts.
      const recorded = (await history()).findLast(event => event.type === 'run.cancel.requested')
      const receiptId = recorded?.payload && typeof recorded.payload === 'object' && !Array.isArray(recorded.payload)
        ? (recorded.payload as JsonObject)['receiptId'] : undefined
      let receipts: readonly CommandReceipt[]
      if (receiptId !== undefined) {
        if (typeof receiptId !== 'string') throw new Error('Cancel receipt provenance unavailable')
        const original = await store.receipt(key.namespace, receiptId)
        if (!original || original.id !== receiptId) throw new Error('Cancel receipt provenance unavailable')
        receipts = [original]
      } else {
        // Legacy events and host-admitted cancel intents have no event pointer.
        // Scoped pending lookup recovers their immutable receipt, never its actor.
        receipts = await store.pending(key.namespace, 256, { key, kind: 'cancel' })
      }
      if (receipts.length > 256 || !receipts.length && current.cancelRequested) throw new Error('Cancel receipt provenance unavailable')
      const validated = receipts.map(validateCommandReceipt)
      if (validated.some(item => item.command.kind !== 'cancel' || item.command.key.namespace !== key.namespace || item.command.key.runId !== key.runId)) {
        throw new Error('Cancel receipt scope mismatch')
      }
      cancelReceipt = validated.find(item => item.command.clientId === 'durable-engine' &&
        item.command.idempotencyKey === `cancel:${key.namespace}:${key.runId}` && item.command.payload === null) ?? validated[0]
    }
    if (!current.cancelRequested) {
      if (!cancelReceipt) {
        const admitted = await store.admit({ key, clientId: 'durable-engine', idempotencyKey: `cancel:${key.namespace}:${key.runId}`, kind: 'cancel', payload: null }, principal)
        if (admitted.status === 'conflict') throw new Error('Cancel command conflict')
        cancelReceipt = admitted.receipt
      }
      await transition({ ...current, cancelRequested: true }, 'run.cancel.requested', { receiptId: cancelReceipt.id },
        { ...cancelReceipt, phase: 'running' })
    }
    for (const controller of children.values()) controller.abort()
  }
  const fingerprint = createHash('sha256').update(canonical(definition as unknown as JsonValue)).digest('hex')
  const existingDefinition = (await history()).find((event) => event.type === 'workflow.definition')
  if (existingDefinition && (existingDefinition.payload as JsonObject)['fingerprint'] !== fingerprint) throw new Error('Workflow compatibility mismatch')
  if (snapshot.status === 'succeeded' || snapshot.status === 'cancelled') return snapshot
  if (!await store.valid(await parentAuthority())) throw new Error('stale-lease')
  let cancellation: Promise<void> | undefined
  const onAbort = () => {
    stopping = true
    cancellation ??= serialize(requestCancel)
    void cancellation.catch(() => undefined)
  }
  signal.addEventListener('abort', onAbort)
  // Replay/authority reads above may have yielded before this listener existed.
  if (signal.aborted) stopping = true
  try {
    await serialize(async () => {
      if (!existingDefinition) await transition(current, 'workflow.definition', { fingerprint })
      const tasks = definition.tasks.map((task) => current.tasks.find((checkpoint) => checkpoint.taskId === task.id) ?? { taskId: task.id, phase: 'pending' as const, attempt: 0 })
      await transition({ ...current, status: 'running', tasks }, 'run.running', null)
    })
    if (stopping) { onAbort(); await cancellation }

    async function retrySafe(task: TaskCheckpoint): Promise<boolean> {
      const events = await history()
      const records = [...effects(events, task.taskId).values()]
      const admittedThisAttempt = events.some((event) => {
        if (event.type !== 'task.effect.started' && event.type !== 'task.effect.replayed') return false
        const payload = event.payload as JsonObject
        return payload['taskId'] === task.taskId && payload['attempt'] === task.attempt
      })
      // No evidence is not proof that execution had no external effects.
      return admittedThisAttempt && records.length > 0 && records.every((record) => record.completed || record.effect !== 'non-idempotent')
    }
    for (const task of current.tasks) {
      if (task.phase === 'running' || task.phase === 'uncertain' || task.phase === 'blocked' || task.phase === 'failed') {
        await serialize(async () => {
          if (!current.cancelRequested && task.attempt < definition.tasks.find((item) => item.id === task.taskId)!.maxAttempts && await retrySafe(task)) {
            await checkpoint({ ...task, phase: 'pending' }, 'task.retry.ready')
          } else if (task.phase !== 'failed' && task.phase !== 'cancelled') {
            await checkpoint({ ...task, phase: 'blocked', error: { code: 'uncertain-attempt-recovery', message: 'Durable effects do not prove replay safe' } }, 'task.blocked')
          }
        })
      }
    }

    async function execute(taskDefinition: WorkflowTaskDefinition): Promise<void> {
      const controller = new AbortController()
      children.set(taskDefinition.id, controller)
      let childLease: Lease | undefined
      try {
        let context: TaskExecutionContext | undefined
        const task = current.tasks.find((item) => item.taskId === taskDefinition.id)!
        const attempt = task.attempt + 1
        const preparation: TaskPreparationContext = { key: { ...key }, taskId: task.taskId, attempt,
          definition: taskDefinition, snapshot: structuredClone(current), signal: controller.signal }
        // Host preparation may wait for abort. Never hold the parent queue across it.
        const workspace = await options.prepareTask(preparation)
        await serialize(async () => {
          if (stopping) return
          if (!await store.valid(await parentAuthority())) throw new Error('stale-lease')
          if (workspace.namespace !== key.namespace || workspaceIds.has(workspace.workspaceId)) throw new Error('Workspace isolation required')
          workspaceIds.add(workspace.workspaceId)
          const claimed = await store.claim(key.namespace, [`task:${key.runId}:${task.taskId}`, `workspace:${workspace.workspaceId}`].sort(),
            'task-' + randomUUID(), options.taskLeaseTtlMs ?? 60_000)
          if (claimed.status !== 'acquired') {
            await checkpoint({ ...task, phase: 'blocked', error: { code: 'task-lease-contended', message: 'Child resource is owned' } }, 'task.blocked')
            return
          }
          childLease = claimed.lease
          await checkpoint({ taskId: task.taskId, phase: 'running', attempt, workspace: { ...workspace } }, 'task.attempt.started')
          const evidence = await history()
          const artifactEvidence = []
          for (const ref of [current.workspace, ...current.tasks.filter((item) => item.phase === 'succeeded' && item.workspace).map((item) => item.workspace!)]) {
            artifactEvidence.push({ workspace: { ...ref }, manifest: await artifacts.manifest(ref) })
          }
          let active = true
          const journal: EffectJournal = {
            begin: (call, effect) => serialize(async () => {
              if (!active || controller.signal.aborted || stopping || !await store.valid(childLease!)) throw new Error('Task effect admission stopped')
              validateToolCall(call)
              if (!['read-only', 'idempotent', 'non-idempotent'].includes(effect)) throw new Error('Invalid effect classification')
              const previous = effects(await history(), task.taskId).get(call.id)
              if (previous && (canonical(previous.call as unknown as JsonValue) !== canonical(call as unknown as JsonValue) || previous.effect !== effect)) throw new Error('Effect identity conflict')
              if (previous?.completed) {
                await transition(current, 'task.effect.replayed', { taskId: task.taskId, attempt, callId: call.id })
                return 'completed'
              }
              if (previous && (previous.attempt === attempt || effect === 'non-idempotent')) return 'uncertain'
              await transition(current, 'task.effect.started', { taskId: task.taskId, attempt, call: call as unknown as JsonValue, effect })
              return 'new'
            }),
            result: (callId) => serialize(async () => {
              const record = effects(await history(), task.taskId).get(callId)
              if (!record?.completed) throw new Error('Effect result unavailable')
              return structuredClone(record.result!)
            }),
            finish: (callId, result) => serialize(async () => {
              if (!active || !await store.valid(childLease!)) throw new Error('Task effect completion stopped')
              validateCommand({ key, clientId: 'effect', idempotencyKey: callId, kind: 'continue', payload: result })
              const record = effects(await history(), task.taskId).get(callId)
              if (!record || record.attempt !== attempt || record.completed) throw new Error('Effect completion without admission')
              await transition(current, 'task.effect.completed', { taskId: task.taskId, attempt, callId, result })
            }),
          }
          context = { ...preparation, snapshot: structuredClone(current), workspace: { ...workspace }, lease: childLease, events: structuredClone(evidence), artifacts: artifactEvidence, journal,
            acceptRenewedLease: (renewed) => serialize(async () => {
              if (!active) throw new Error('Task lease handoff after settlement')
              sameAuthority(childLease!, renewed)
              if (!await store.valid(renewed)) throw new Error('stale-lease')
              childLease = structuredClone(renewed)
            }),
          }
          // Disable journal admission when the trusted executor hands back.
          deactivate.set(task.taskId, () => { active = false })
        })
        if (!context) return
        let outcome: RuntimeOutcome | undefined
        try {
          outcome = validateRuntimeOutcome(await options.executeTask(context))
          sameAuthority(childLease!, outcome.publicationLease)
          childLease = structuredClone(outcome.publicationLease)
        } catch { outcome = undefined /* Settlement is not effect safety evidence. */ }
        deactivate.get(taskDefinition.id)?.()
        if (outcome?.outcome.result.status === 'ok' && !stopping) {
          const authority = await parentAuthority()
          if (!stopping) {
            try {
              const published = await publishTaskArtifacts({ snapshot: current, taskId: task.taskId, result: outcome, lease: authority, store, artifacts })
              if (published !== 'published') throw new Error(published)
            } catch (error) {
              // Stop all future transitions on publication/authority failure.
              await serialize(async () => { throw error })
            }
          }
        }
        await serialize(async () => {
          const task = current.tasks.find((item) => item.taskId === taskDefinition.id)!
          if (outcome?.outcome.result.status === 'ok' && !stopping) {
            const result = await commitPublishedTaskResult({ snapshot: current, taskId: task.taskId, result: outcome, lease: await parentAuthority(), store, artifacts })
            if (result.status !== 'committed') throw new Error(result.status)
            current = result.snapshot
          } else if (outcome?.outcome.result.status === 'cancelled') {
            await checkpoint({ ...task, phase: 'cancelled' }, 'task.cancelled')
          } else {
            const safe = await retrySafe(task)
            const phase = safe && !stopping ? (task.attempt < taskDefinition.maxAttempts ? 'pending' : 'failed') : 'blocked'
            await checkpoint({ ...task, phase, error: { code: safe ? 'task-execution-failed' : 'uncertain-attempt-recovery',
              message: safe ? 'Attempt settled without success' : 'Durable effects do not prove replay safe' } }, phase === 'pending' ? 'task.retry.ready' : 'task.' + phase)
          }
        })
      } finally {
        deactivate.delete(taskDefinition.id); children.delete(taskDefinition.id)
        if (childLease) await store.release(childLease)
      }
    }
    const deactivate = new Map<string, () => void>()
    while (true) {
      if (fatal) throw fatal
      if (!stopping) {
        const ready = definition.tasks.filter((task) => !active.has(task.id) &&
          current.tasks.find((item) => item.taskId === task.id)?.phase === 'pending' &&
          task.dependsOn.every((id) => current.tasks.find((item) => item.taskId === id)?.phase === 'succeeded'))
        for (const task of ready.slice(0, options.concurrency - active.size)) {
          const running = execute(task).finally(() => { active.delete(task.id) })
          active.set(task.id, running)
          void running.catch(() => undefined)
        }
      }
      if (active.size === 0) break
      await Promise.race(active.values())
    }
    await cancellation
    await serialize(async () => {
      const status = current.cancelRequested ? (current.tasks.every((task) => ['cancelled', 'pending', 'succeeded'].includes(task.phase)) ? 'cancelled' : 'blocked') :
        current.tasks.every((task) => task.phase === 'succeeded') ? 'succeeded' : current.tasks.some((task) => task.phase === 'failed') ? 'failed' : 'blocked'
      await transition({ ...current, status }, 'run.' + status, null,
        cancelReceipt ? { ...cancelReceipt, phase: status === 'cancelled' ? 'completed' : 'blocked', outcome: { status } } : undefined)
      terminalCommitted = true
    })
    // Admission closes only after terminal CAS. Drain any abort captured during
    // that awaited CAS before sampling the returned authoritative snapshot.
    signal.removeEventListener('abort', onAbort)
    await cancellation
    return current
  } finally {
    signal.removeEventListener('abort', onAbort)
    for (const controller of children.values()) controller.abort()
    // Aborting is intent: never return while an admitted executor still owns access.
    await Promise.allSettled(active.values())
    await queue
  }
}
