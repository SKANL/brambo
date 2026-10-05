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
  /** Mark ownership lost after an independent authority check fails. */
  markLost(): void
  /** Cancel future ticks, drain the current tick, and return the latest lease. */
  stop(): Promise<Lease>
}

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
  let ownershipLost = false
  let stopped = false
  let inFlight: Promise<void> | undefined
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

  const renew = async (): Promise<void> => {
    if (stopped || ownershipLost) return
    if (inFlight !== undefined) {
      await inFlight
      return
    }

    const attempt = (async (): Promise<void> => {
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
        currentLease = renewed
      } catch {
        markLost()
      }
    })()
    inFlight = attempt
    try {
      await attempt
    } finally {
      if (inFlight === attempt) inFlight = undefined
    }
  }

  cancelTimer = options.schedule.every(options.renewalMs, renew)
  if (cancelRequested) cancelSchedule()

  return Object.freeze({
    get lease() { return currentLease },
    get lost() { return ownershipLost },
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
