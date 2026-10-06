import { randomUUID } from 'node:crypto'
import { leaseResources, validateCommandReceipt, validateLease, validateRunSnapshot } from '@brambodev/contracts'
import type { ArtifactProvider, CommandReceipt, DriverServices, ExecutionRuntime, Lease, Principal, RunKey, RunSnapshot, RunStore, PendingFilter, WorkspaceRef } from '@brambodev/contracts'
import type { DriverRegistry, TaskExecutionContext, WorkflowDefinition, runDurableWorkflow } from '@brambodev/orchestration'
import { isPrincipal } from './authorization.ts'

export interface WorkflowWorkerOptions {
  readonly workerId: string
  readonly principal: Principal
  readonly store: RunStore
  readonly artifacts: ArtifactProvider
  readonly runtime: ExecutionRuntime
  /** Renewing runtimes must use this fresh task-scoped store for child renewals. */
  readonly runtimeForTask?: (context: WorkerTaskContext) => ExecutionRuntime
  readonly definitions: { resolve(id: string, version: string): WorkflowDefinition }
  readonly drivers: DriverRegistry
  /** Host-owned services reauthorize new effects and cached disclosure, and redact results. */
  readonly services: WorkerServices
  readonly execute: typeof runDurableWorkflow
  readonly leaseTtlMs?: number
  readonly renewalMs?: number
  readonly concurrency?: number
}

export interface WorkerAuthorizationContext {
  readonly actor: Principal
  readonly worker: Principal
  readonly receiptId: string
  readonly key: RunKey
  readonly taskId: string
  readonly workspace: WorkspaceRef
}

/** Trusted provenance is separate from untrusted tool arguments and secret references. */
export interface WorkerServices {
  /** Current host policy for cached disclosure only; must not execute the effect. Missing/false denies replay. */
  readonly authorizeReplay?: (call: Parameters<DriverServices['dispatchTool']>[0], signal: AbortSignal, context: WorkerAuthorizationContext) => Promise<boolean>
  readonly dispatchTool: (call: Parameters<DriverServices['dispatchTool']>[0], signal: AbortSignal, context: WorkerAuthorizationContext) => ReturnType<DriverServices['dispatchTool']>
  readonly resolveSecret: (reference: string, signal: AbortSignal, context: WorkerAuthorizationContext) => Promise<string>
}

export interface WorkerTaskContext extends TaskExecutionContext {
  /** Borrowed port; child renewal is serialized with this task's effect journal. */
  readonly store: RunStore
}

export interface WorkflowWorker {
  runOnce(signal: AbortSignal): Promise<boolean>
  /** Requests cancellation and waits for trusted runtime handback, not OS termination proof. */
  stop(): Promise<void>
}

function renewedAuthority(previous: Lease, next: Lease, principal: Principal): Lease {
  validateLease(next)
  const resources = Object.keys(previous.epochs)
  if (next.namespace !== principal.namespace || next.ownerId !== principal.subject ||
      next.token !== previous.token || Object.keys(next.epochs).length !== resources.length ||
      resources.some(resource => next.epochs[resource] !== previous.epochs[resource])) {
    throw new Error('Worker lease authority mismatch')
  }
  return structuredClone(next)
}

/** Explicitly host-launched worker; the injected durable engine remains the only scheduler. */
export function createWorkflowWorker(options: WorkflowWorkerOptions): WorkflowWorker {
  const principal = Object.freeze({ ...options.principal })
  const ttlMs = options.leaseTtlMs ?? 30_000, renewalMs = options.renewalMs ?? Math.floor(ttlMs / 3)
  const concurrency = options.concurrency ?? 1
  if (!isPrincipal(principal) || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(options.workerId) ||
      !Number.isSafeInteger(ttlMs) || ttlMs < 1 || !Number.isSafeInteger(renewalMs) || renewalMs < 1 || renewalMs >= ttlMs ||
      !Number.isSafeInteger(concurrency) || concurrency < 1 || typeof options.execute !== 'function') {
    throw new Error('Invalid workflow worker configuration')
  }
  const { store, artifacts } = options
  async function scopedPending(key: RunKey, kind?: PendingFilter['kind']): Promise<readonly CommandReceipt[]> {
    const results = (await store.pending(principal.namespace, 256, { key, ...(kind ? { kind } : {}) })).map(validateCommandReceipt)
    if (results.length > 256 || results.some(item => item.command.key.namespace !== principal.namespace ||
      item.command.key.runId !== key.runId || kind && item.command.kind !== kind)) throw new Error('Worker pending scope mismatch')
    return results
  }
  let stopped = false, active: Promise<boolean> | undefined, controller: AbortController | undefined
  async function run(signal: AbortSignal): Promise<boolean> {
    const pending = (await store.pending(principal.namespace, 256)).map(validateCommandReceipt)
    if (stopped || signal.aborted) return false
    // Cancellation takes precedence over a queued start/continue of the same run.
    const ordered = [...pending.filter(receipt => receipt.command.kind === 'cancel'), ...pending.filter(receipt => receipt.command.kind !== 'cancel')]
    for (const candidate of ordered) {
      if (candidate.command.key.namespace !== principal.namespace) throw new Error('Worker receipt namespace mismatch')
      let current = await store.get(candidate.command.key)
      if (!current) continue
      if (Object.hasOwn(current, 'importState')) {
        validateRunSnapshot(current)
        if (current.importState!.phase !== 'completed') continue
      }
      const claim = await store.claim(principal.namespace, leaseResources(current.key, current.workspace.workspaceId), principal.subject, ttlMs)
      if (claim.status !== 'acquired') continue
      let lease = renewedAuthority(claim.lease, claim.lease, principal)
      const requiredResources = leaseResources(current.key, current.workspace.workspaceId)
      if (Object.keys(lease.epochs).length !== requiredResources.length || requiredResources.some(resource => !Object.hasOwn(lease.epochs, resource))) {
        throw new Error('Worker parent lease scope mismatch')
      }
      controller = new AbortController()
      const abort = () => controller?.abort()
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted || stopped) controller.abort()
      let renewal: Promise<void> = Promise.resolve(), lost = false, finishing = false, timer: ReturnType<typeof setTimeout> | undefined
      let ownershipQueue: Promise<unknown> = Promise.resolve()
      function owned<T>(operation: () => Promise<T>): Promise<T> {
        const result = ownershipQueue.then(operation)
        ownershipQueue = result.catch(() => undefined)
        return result
      }
      const lose = () => { lost = true; controller?.abort() }
      const schedule = () => {
        timer = setTimeout(() => {
          renewal = owned(async () => {
            try {
              const result = await store.renew(lease, ttlMs)
              if (result.status !== 'acquired') { lose(); return }
              lease = renewedAuthority(lease, result.lease, principal)
              if ((await scopedPending(current!.key, 'cancel')).length > 0) {
                controller?.abort()
              }
            } catch { lose() }
          }).finally(() => { if (!lost && !stopped && !finishing) schedule() })
        }, renewalMs)
      }
      async function authority(): Promise<Lease> {
        await renewal
        return owned(async () => {
          if (lost || !await store.valid(lease)) { lose(); throw new Error('stale-lease') }
          return structuredClone(lease)
        })
      }
      function parentLease(input: Lease): Lease {
        validateLease(input)
        if (input.namespace !== lease.namespace || input.ownerId !== lease.ownerId) throw new Error('Worker parent authority mismatch')
        return renewedAuthority(input, lease, principal)
      }
      async function transition(snapshot: RunSnapshot, receipt: CommandReceipt, type: string): Promise<void> {
        const result = await owned(() => store.commit({ snapshot: { ...snapshot, revision: current!.revision + 1 }, expectedRevision: current!.revision,
          lease: structuredClone(lease), events: [{ type, payload: { receiptId: receipt.id, workerId: options.workerId } }], receipt }))
        if (result.status !== 'committed') throw new Error(result.status)
        current = result.snapshot
      }
      try {
        // Never execute a receipt sampled before another owner finished it.
        const receipt = await store.receipt(principal.namespace, candidate.id)
        current = await store.get(candidate.command.key)
        if (!receipt || !current || !['accepted', 'running'].includes(receipt.phase)) continue
        if (Object.hasOwn(current, 'importState')) {
          validateRunSnapshot(current)
          if (current.importState!.phase !== 'completed') continue
        }
        const definition = options.definitions.resolve(current.workflowId, current.workflowVersion)
        const consumed = await scopedPending(current.key)
        const cancellation = (await scopedPending(current.key, 'cancel')).length > 0
        await transition({ ...current, cancelRequested: current.cancelRequested || cancellation }, { ...receipt, phase: 'running' }, 'worker.receipt.running')
        schedule()
        // The authenticated remote authority binds all claims to this host principal.
        // Children still receive only their own task/workspace tokens, never the parent token.
        const engineStore: RunStore = borrowedStore(store, {
          claim: (namespace, resources, _ownerId, duration) => store.claim(namespace, resources, principal.subject, duration),
          // Only the engine's identical parent capability may follow its own renewal.
          valid: input => owned(async () => {
            try {
              // Only full immutable identity matches follow renewal. Child leases
              // remain their own exact authority, even if a resource overlaps.
              let canonical: Lease
              try { canonical = parentLease(input) } catch { canonical = input }
              return !lost && await store.valid(canonical)
            } catch { return false }
          }),
          commit: input => owned(async () => {
            try { parentLease(input.lease) } catch { return { status: 'stale-lease' as const } }
            if (lost) return { status: 'stale-lease' as const }
            return store.commit({ ...input, lease: structuredClone(lease) })
          }),
        })
        const result = await options.execute({ key: current.key, principal, lease: await authority(), store: engineStore, artifacts, definition,
          signal: controller.signal, concurrency, taskLeaseTtlMs: ttlMs, currentParentLease: authority,
          prepareTask: async context => ({ ...context.snapshot.workspace, workspaceId: 'task-' + randomUUID() }),
          executeTask: async context => {
            const handoff = new AbortController()
            const signal = AbortSignal.any([context.signal, handoff.signal])
            let childQueue: Promise<unknown> = Promise.resolve()
            function childOwned<T>(operation: () => Promise<T>): Promise<T> {
              const result = childQueue.then(operation)
              childQueue = result.catch(() => undefined)
              return result
            }
            let childLease = context.lease
            const childStore = borrowedStore(store, {
              renew: (input, duration) => childOwned(async () => {
                try {
                  renewedAuthority(childLease, input, principal)
                  if (signal.aborted) throw new Error('Worker task stopped')
                  const result = await store.renew(input, duration)
                  if (result.status !== 'acquired') { handoff.abort(); return result }
                  const next = renewedAuthority(childLease, result.lease, principal)
                  await context.acceptRenewedLease(next)
                  childLease = next
                  return { status: 'acquired', lease: structuredClone(next) }
                } catch (error) { handoff.abort(); throw error }
              }),
            })
            const runtime = options.runtimeForTask?.({ ...context, signal, store: childStore }) ?? options.runtime
            const driverFactory = options.drivers.resolve(context.definition.driverId)
            if (context.definition.required.some(id => !driverFactory.manifest.capabilities.includes(id) || !runtime.capabilities.includes(id))) {
              throw new Error('Required worker capability unavailable')
            }
            if (!driverFactory.manifest.capabilities.includes('context-reconstruction') || !runtime.capabilities.includes('context-reconstruction')) {
              throw new Error('Worker context reconstruction unavailable')
            }
            // No guessed effect classification: unknown custom tools are conservatively non-idempotent.
            const authorization = Object.freeze({ actor: Object.freeze({ ...receipt.actor }), worker: principal,
              receiptId: receipt.id, key: Object.freeze({ ...receipt.command.key }), taskId: context.taskId,
              workspace: Object.freeze({ ...context.workspace }) })
            const services: DriverServices = { resolveSecret: (reference, secretSignal) =>
              options.services.resolveSecret(reference, AbortSignal.any([signal, secretSignal]), authorization),
              dispatchTool: async (call, toolSignal) => {
                const effectiveSignal = AbortSignal.any([signal, toolSignal])
                if (effectiveSignal.aborted) throw new Error('Worker execution stopped')
                const admitted = await childOwned(() => context.journal.begin(call, 'non-idempotent'))
                if (admitted === 'completed') {
                  // Durable completion prevents repetition, not current disclosure authorization.
                  if (!options.services.authorizeReplay ||
                      await options.services.authorizeReplay(call, effectiveSignal, authorization) !== true) {
                    throw new Error('Worker effect replay authorization denied')
                  }
                  if (effectiveSignal.aborted) throw new Error('Worker execution stopped')
                  return childOwned(() => context.journal.result(call.id))
                }
                if (admitted !== 'new') throw new Error('Uncertain worker effect')
                // The effect itself is outside the lock so its renewal can progress.
                const result = await options.services.dispatchTool(call, effectiveSignal, authorization)
                await childOwned(() => context.journal.finish(call.id, result))
                return result
              },
            }
            const driver = await driverFactory.create(context.definition.configuration, services)
            const base = await artifacts.manifest(context.snapshot.workspace)
            await artifacts.publish(context.workspace, base, context.lease)
            try { return await runtime.execute(driver, { key: context.key, sessionId: context.snapshot.sessionId, taskId: context.taskId,
              prompt: context.definition.prompt, workspace: context.workspace, continuation: 'reconstructed',
              context: { snapshot: context.snapshot as unknown as import('@brambodev/contracts').JsonValue,
                events: context.events as unknown as import('@brambodev/contracts').JsonValue,
                artifacts: context.artifacts.map(item => item.workspace) as unknown as import('@brambodev/contracts').JsonValue },
              signal }, context.lease) } finally { await childQueue }
          },
        })
        current = await store.get(result.key)
        if (!current) throw new Error('Worker run disappeared')
        if (!['succeeded', 'failed', 'cancelled', 'blocked'].includes(current.status)) throw new Error('Worker execution outcome pending')
        const related = [...await scopedPending(current.key), ...await scopedPending(current.key, 'cancel')]
          .filter((item, index, all) => all.findIndex(other => other.id === item.id) === index)
        for (const item of related.filter(item => item.command.key.runId === current!.key.runId)) {
          // Do not settle a command accepted after execution: only the consumed command
          // and cancellation intents reflected by this authoritative result are covered.
          if (!consumed.some(before => before.id === item.id) && !(item.command.kind === 'cancel' && current.cancelRequested)) continue
          await transition(current, { ...item, phase: current.status === 'blocked' ? 'blocked' : 'completed', outcome: { status: current.status } }, 'worker.receipt.settled')
        }
        return true
      } finally {
        finishing = true
        if (timer) clearTimeout(timer)
        await renewal
        signal.removeEventListener('abort', abort)
        controller = undefined
        await store.release(lease)
      }
    }
    return false
  }
  return {
    runOnce(signal) {
      if (stopped || signal.aborted) return Promise.resolve(false)
      if (active) return Promise.reject(new Error('Workflow worker already running'))
      active = run(signal).finally(() => { active = undefined })
      return active
    },
    async stop() { stopped = true; controller?.abort(); await active?.catch(() => undefined) },
  }
}

/** Preserve prototype-backed methods; borrowed resources are never closed by adapters. */
function borrowedStore(store: RunStore, overrides: Partial<RunStore>): RunStore {
  return new Proxy(store, { get(target, property: keyof RunStore) {
    if (property === 'close') return async () => {}
    const method = overrides[property] ?? target[property]
    return typeof method === 'function' ? method.bind(target) : method
  } })
}
