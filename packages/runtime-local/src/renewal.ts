import { validateLease } from '@brambodev/contracts'
import type { Lease, RunStore } from '@brambodev/contracts'

export interface LeaseScheduler {
  every(milliseconds: number, callback: () => Promise<void>): () => void
}

export interface LeaseRenewalController {
  /** The latest immutable lease returned by the authority. */
  readonly lease: Lease
  /** Ownership loss is terminal for this execution; later ticks cannot recover it. */
  readonly lost: boolean
  /** Validate the latest lease after serializing behind any active renewal. */
  validate(): Promise<boolean>
  /** Mark ownership lost after an independent authority check fails. */
  markLost(): void
  /** Cancel future ticks, drain the current tick, and return the latest lease. */
  stop(): Promise<Lease>
}

const LEASE_SAFETY_MARGIN_MS = 1_000

export interface LeaseRenewalOptions {
  readonly store: RunStore
  readonly lease: Lease
  readonly ttlMs: number
  readonly renewalMs: number
  readonly schedule: LeaseScheduler
  readonly onOwnershipLost?: () => void
}

export const intervalLeaseScheduler: LeaseScheduler = Object.freeze({
  every(milliseconds: number, callback: () => Promise<void>) {
    const timer = setInterval(() => { void callback().catch(() => undefined) }, milliseconds)
    return () => clearInterval(timer)
  },
})

function immutableLease(value: Lease): Lease {
  const validated = validateLease(value)
  return Object.freeze({
    namespace: validated.namespace,
    ownerId: validated.ownerId,
    token: validated.token,
    expiresAt: validated.expiresAt,
    epochs: Object.freeze({ ...validated.epochs }),
  })
}

function sameScope(previous: Lease, next: Lease): boolean {
  if (previous.namespace !== next.namespace || previous.ownerId !== next.ownerId) return false
  const previousResources = Object.keys(previous.epochs)
  const nextResources = Object.keys(next.epochs)
  return previousResources.length === nextResources.length && previousResources.every((resource) =>
    Object.hasOwn(next.epochs, resource) && previous.epochs[resource] === next.epochs[resource])
}

function safeRenewalInterval(lease: Lease, ttlMs: number, renewalMs: number): number | undefined {
  const remaining = lease.expiresAt - Date.now() - LEASE_SAFETY_MARGIN_MS
  const ttlHeadroom = Math.floor((ttlMs - LEASE_SAFETY_MARGIN_MS) / 2)
  if (!Number.isFinite(remaining) || remaining < 2 || ttlHeadroom < 1) return undefined
  const interval = Math.min(renewalMs, ttlHeadroom, Math.floor(remaining / 2))
  return interval > 0 ? interval : undefined
}

/**
 * Renews only the lease supplied by the caller. It never claims or releases
 * authority, and it refuses to adopt a renewal with a changed owner or scope.
 */
export function createLeaseRenewalController(options: LeaseRenewalOptions): LeaseRenewalController {
  if (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0 ||
      !Number.isFinite(options.renewalMs) || options.renewalMs <= 0 || options.renewalMs >= options.ttlMs) {
    throw new RangeError('lease renewal interval must be positive and shorter than its TTL')
  }

  let currentLease = immutableLease(options.lease)
  const intervalMs = safeRenewalInterval(currentLease, options.ttlMs, options.renewalMs)
  if (intervalMs === undefined) throw new RangeError('lease expires too soon for safe renewal')
  let ownershipLost = false
  let stopped = false
  let inFlight: Promise<unknown> | undefined
  let inFlightKind: 'renewal' | 'validation' | undefined
  let cancelTimer: (() => void) | undefined
  let cancelRequested = false

  const cancelSchedule = (): void => {
    if (cancelTimer !== undefined) {
      const cancel = cancelTimer
      cancelTimer = undefined
      cancel()
    } else {
      cancelRequested = true
    }
  }

  const markLost = (): void => {
    if (ownershipLost) return
    ownershipLost = true
    cancelSchedule()
    try { options.onOwnershipLost?.() } catch { /* Loss remains irreversible even if notification fails. */ }
  }

  const runExclusive = <T>(kind: 'renewal' | 'validation', operation: () => Promise<T>): Promise<T> => {
    const pending = Promise.resolve().then(operation).finally(() => {
      if (inFlight === pending) {
        inFlight = undefined
        inFlightKind = undefined
      }
    })
    inFlight = pending
    inFlightKind = kind
    return pending
  }

  const renew = async (): Promise<void> => {
    if (stopped || ownershipLost) return
    if (inFlight !== undefined) {
      const activeKind = inFlightKind
      await inFlight
      if (activeKind === 'validation' && !stopped && !ownershipLost) return renew()
      return
    }

    await runExclusive('renewal', async (): Promise<void> => {
      if (stopped || ownershipLost) return
      if (currentLease.expiresAt - Date.now() <= LEASE_SAFETY_MARGIN_MS) {
        markLost()
        return
      }
      try {
        const result = await options.store.renew(currentLease, options.ttlMs)
        if (result.status !== 'acquired') {
          markLost()
          return
        }
        const renewed = immutableLease(result.lease)
        if (!sameScope(currentLease, renewed)) {
          markLost()
          return
        }
        if (renewed.expiresAt - Date.now() <= intervalMs + LEASE_SAFETY_MARGIN_MS) {
          markLost()
          return
        }
        currentLease = renewed
      } catch {
        markLost()
      }
    })
  }

  const validate = async (): Promise<boolean> => {
    while (inFlight !== undefined) {
      try { await inFlight } catch { markLost() }
      if (ownershipLost) return false
    }
    if (ownershipLost) return false
    return runExclusive('validation', async () => {
      if (ownershipLost) return false
      try {
        const valid = await options.store.valid(currentLease)
        const enoughLifetime = currentLease.expiresAt - Date.now() > LEASE_SAFETY_MARGIN_MS
        if (!valid || !enoughLifetime) markLost()
        return valid && enoughLifetime
      } catch {
        markLost()
        return false
      }
    })
  }

  cancelTimer = options.schedule.every(intervalMs, renew)
  if (cancelRequested) cancelSchedule()

  return Object.freeze({
    get lease() { return currentLease },
    get lost() { return ownershipLost },
    validate,
    markLost,
    async stop() {
      if (!stopped) {
        stopped = true
        cancelSchedule()
      }
      const pending = inFlight
      if (pending !== undefined) await pending
      return currentLease
    },
  })
}
