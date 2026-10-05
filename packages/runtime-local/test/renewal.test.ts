import type { ClaimResult, Lease, RunStore } from '@brambodev/contracts'
import { describe, expect, it, vi } from 'vitest'
import { createLeaseRenewalController } from '../src/renewal.ts'
import type { LeaseRenewalController, LeaseScheduler } from '../src/renewal.ts'

function deferred<T>() {
  let resolvePromise!: (value: T) => void
  const promise = new Promise<T>((resolveValue) => { resolvePromise = resolveValue })
  return { promise, resolve: resolvePromise }
}

function lease(): Lease {
  return {
    namespace: 'tenant-a',
    ownerId: 'child-worker',
    token: 'lease-token-1',
    expiresAt: Date.now() + 60_000,
    epochs: { 'task:run-a:task-a': 1, 'workspace:workspace-a': 2 },
  }
}

function schedulerFixture() {
  let callback: (() => Promise<void>) | undefined
  let intervalMs: number | undefined
  const cancel = vi.fn()
  const schedule: LeaseScheduler = {
    every: vi.fn((_milliseconds, next) => {
      intervalMs = _milliseconds
      callback = next
      return cancel
    }),
  }
  return {
    schedule,
    cancel,
    intervalMs: () => intervalMs,
    async tick() {
      expect(callback, 'controller should register the renewal callback').toBeDefined()
      await callback?.()
    },
  }
}

function store(renew: RunStore['renew']) {
  return { renew, release: vi.fn(async () => undefined) } as unknown as RunStore & {
    release: ReturnType<typeof vi.fn>
  }
}

describe('lease renewal controller', () => {
  it('serializes overlapping callbacks and retains an immutable snapshot of the latest lease', async () => {
    const initial = lease()
    const next = { ...initial, token: 'lease-token-2', expiresAt: Date.now() + 120_000, epochs: { ...initial.epochs } }
    const result = deferred<ClaimResult>()
    const started = deferred<void>()
    const renew = vi.fn(async () => { started.resolve(); return result.promise })
    const scheduler = schedulerFixture()
    const controller = createLeaseRenewalController({
      store: store(renew), lease: initial, ttlMs: 30_000, renewalMs: 10_000, schedule: scheduler.schedule,
    })

    const first = scheduler.tick()
    const renewalStarted = await Promise.race([started.promise.then(() => true), first.then(() => false)])
    expect(renewalStarted).toBe(true)
    const overlapping = scheduler.tick()
    expect(renew).toHaveBeenCalledTimes(1)
    result.resolve({ status: 'acquired', lease: next })
    await Promise.all([first, overlapping])

    const snapshot = controller.lease
    expect(snapshot).toMatchObject({ token: 'lease-token-2', expiresAt: next.expiresAt })
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.epochs)).toBe(true)
    next.expiresAt = 1
    next.epochs['workspace:workspace-a'] = 99
    expect(controller.lease.expiresAt).not.toBe(1)
    expect(controller.lease.epochs['workspace:workspace-a']).toBe(2)
    await controller.stop()
  })

  it('treats loss as irreversible and never claims or releases replacement ownership', async () => {
    const original = lease()
    const renewed = { ...original, token: 'unexpected-recovery-token', epochs: { ...original.epochs } }
    const renew = vi.fn<RunStore['renew']>()
      .mockResolvedValueOnce({ status: 'contended' })
      .mockResolvedValueOnce({ status: 'acquired', lease: renewed })
    const onLoss = vi.fn()
    const scheduler = schedulerFixture()
    const backingStore = store(renew)
    const controller = createLeaseRenewalController({
      store: backingStore, lease: original, ttlMs: 30_000, renewalMs: 10_000,
      schedule: scheduler.schedule, onOwnershipLost: onLoss,
    })

    await scheduler.tick()
    await scheduler.tick()

    expect(controller.lost).toBe(true)
    expect(controller.lease).toMatchObject({ token: original.token })
    expect(renew).toHaveBeenCalledTimes(1)
    expect(onLoss).toHaveBeenCalledTimes(1)
    await controller.stop()
    expect(backingStore.release).not.toHaveBeenCalled()
  })

  it('drains an in-flight renewal before stop returns its latest lease', async () => {
    const original = lease()
    const next = { ...original, token: 'lease-token-2', expiresAt: Date.now() + 120_000, epochs: { ...original.epochs } }
    const result = deferred<ClaimResult>()
    const started = deferred<void>()
    const renew = vi.fn(async () => { started.resolve(); return result.promise })
    const scheduler = schedulerFixture()
    const controller = createLeaseRenewalController({
      store: store(renew), lease: original, ttlMs: 30_000, renewalMs: 10_000, schedule: scheduler.schedule,
    })

    const tick = scheduler.tick()
    const renewalStarted = await Promise.race([started.promise.then(() => true), tick.then(() => false)])
    expect(renewalStarted).toBe(true)
    let stopped = false
    const stopping = controller.stop().then((value) => { stopped = true; return value })
    expect(scheduler.cancel).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    expect(stopped).toBe(false)
    result.resolve({ status: 'acquired', lease: next })
    await tick

    await expect(stopping).resolves.toMatchObject({ token: 'lease-token-2' })
    expect(stopped).toBe(true)
  })

  it('rejects a renewal that changes the claimed resource set and keeps loss permanent', async () => {
    const original = lease()
    const expanded = {
      ...original,
      epochs: { ...original.epochs, 'run:run-a': 3 },
    }
    const onLoss = vi.fn()
    const scheduler = schedulerFixture()
    const controller = createLeaseRenewalController({
      store: store(async () => ({ status: 'acquired', lease: expanded })),
      lease: original,
      ttlMs: 30_000,
      renewalMs: 10_000,
      schedule: scheduler.schedule,
      onOwnershipLost: onLoss,
    })

    await scheduler.tick()
    expect(controller.lost).toBe(true)
    expect(controller.lease).toMatchObject({ token: original.token })
    expect(onLoss).toHaveBeenCalledTimes(1)
    await controller.stop()
  })

  it('schedules its first renewal safely before the supplied lease expires', async () => {
    const scheduler = schedulerFixture()
    const controller = createLeaseRenewalController({
      store: store(async (current, ttlMs) => ({
        status: 'acquired',
        lease: { ...current, expiresAt: Date.now() + ttlMs, epochs: { ...current.epochs } },
      })),
      lease: { ...lease(), expiresAt: Date.now() + 3_000 },
      ttlMs: 30_000,
      renewalMs: 10_000,
      schedule: scheduler.schedule,
    })

    expect(scheduler.intervalMs()).toBeGreaterThan(0)
    expect(scheduler.intervalMs()).toBeLessThan(1_500)
    await controller.stop()
  })

  it('fails closed when the supplied lease has no safe renewal headroom', () => {
    const scheduler = schedulerFixture()
    expect(() => createLeaseRenewalController({
      store: store(async () => ({ status: 'contended' })),
      lease: { ...lease(), expiresAt: Date.now() + 500 },
      ttlMs: 30_000,
      renewalMs: 10_000,
      schedule: scheduler.schedule,
    })).toThrow(/lease.*expire|safe.*renew/i)
    expect(scheduler.schedule.every).not.toHaveBeenCalled()
  })

  it('loses ownership when a renewed lease cannot safely cover the next interval', async () => {
    const original = lease()
    const tooShort = { ...original, token: 'short-lease', expiresAt: Date.now() + 5_000, epochs: { ...original.epochs } }
    const scheduler = schedulerFixture()
    const controller = createLeaseRenewalController({
      store: store(async () => ({ status: 'acquired', lease: tooShort })),
      lease: original,
      ttlMs: 30_000,
      renewalMs: 10_000,
      schedule: scheduler.schedule,
    })

    await scheduler.tick()
    expect(controller.lost).toBe(true)
    expect(controller.lease.token).toBe(original.token)
    expect(scheduler.cancel).toHaveBeenCalledTimes(1)
    await controller.stop()
  })

  it('validates the latest renewed lease after draining an in-flight renewal', async () => {
    const original = lease()
    const renewed = { ...original, token: 'lease-token-latest', expiresAt: Date.now() + 120_000, epochs: { ...original.epochs } }
    const result = deferred<ClaimResult>()
    const started = deferred<void>()
    const renew = vi.fn(async () => { started.resolve(); return result.promise })
    const valid = vi.fn(async () => true)
    const scheduler = schedulerFixture()
    const controller = createLeaseRenewalController({
      store: { renew, valid } as unknown as RunStore,
      lease: original,
      ttlMs: 30_000,
      renewalMs: 10_000,
      schedule: scheduler.schedule,
    })

    const tick = scheduler.tick()
    const renewalStarted = await Promise.race([started.promise.then(() => true), tick.then(() => false)])
    expect(renewalStarted).toBe(true)
    const checking = (controller as LeaseRenewalController & { validate(): Promise<boolean> }).validate()
    await Promise.resolve()
    expect(valid).not.toHaveBeenCalled()
    result.resolve({ status: 'acquired', lease: renewed })

    await expect(Promise.all([tick, checking])).resolves.toEqual([undefined, true])
    expect(valid).toHaveBeenCalledTimes(1)
    expect(valid).toHaveBeenCalledWith(expect.objectContaining({ token: 'lease-token-latest' }))
    expect(controller.lost).toBe(false)
    await controller.stop()
  })
})
