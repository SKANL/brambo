import { validateCommand, validateCommandReceipt, validateLease, validateRunSnapshot, validatePendingFilter, importFenceResource } from '@brambodev/contracts'
import type { Admission, ClaimResult, Command, Principal, RunKey, RunStore } from '@brambodev/contracts'
import { createClient, integer, invalid, record } from './client.ts'
import type { RemoteClientOptions } from './client.ts'
import { validateReplay } from './replay.ts'
const sameKey = (a: RunKey, b: RunKey) => a.namespace === b.namespace && a.runId === b.runId
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}'
}
function admission(value: unknown, command: Command, actor: Principal): Admission {
  const result = record(value, ['status'], ['receipt'])
  if (result['status'] === 'conflict' && !Object.hasOwn(result, 'receipt')) return { status: 'conflict' }
  if (!['accepted', 'duplicate'].includes(result['status'] as string)) invalid()
  const receipt = validateCommandReceipt(result['receipt'])
  if (!sameKey(receipt.command.key, command.key) || receipt.command.clientId !== command.clientId || receipt.command.idempotencyKey !== command.idempotencyKey) invalid()
  if (canonical(receipt.command) !== canonical(command)) invalid()
  if (receipt.actor.namespace !== actor.namespace || receipt.actor.subject !== actor.subject) return { status: 'conflict' }
  return { status: result['status'] as 'accepted' | 'duplicate', receipt }
}
function claim(value: unknown, namespace: string, ownerId: string, resources?: readonly string[]): ClaimResult {
  const result = record(value, ['status'], ['lease'])
  if (result['status'] === 'contended' && !Object.hasOwn(result, 'lease')) return { status: 'contended' }
  if (result['status'] !== 'acquired') invalid()
  const lease = validateLease(result['lease'])
  if (lease.namespace !== namespace || lease.ownerId !== ownerId || resources &&
    JSON.stringify(Object.keys(lease.epochs).sort()) !== JSON.stringify([...new Set(resources)].sort())) invalid()
  return { status: 'acquired', lease }
}
export function createRemoteRunStore(options: RemoteClientOptions): RunStore {
  const client = createClient(options)
  const store: RunStore = {
    async create(snapshot, command, actor) { validateRunSnapshot(snapshot); validateCommand(command); return admission(await client.request('create', { snapshot, command }), command, actor) },
    async admit(command, actor) { validateCommand(command); return admission(await client.request('admit', { command }), command, actor) },
    async get(key) { const value = await client.request('get', { key }, null); if (value === null) return undefined; const result = validateRunSnapshot(value); if (!sameKey(result.key, key)) invalid(); return result },
    async receipt(namespace, id) { const value = await client.request('receipt', { namespace, id }, null); if (value === null) return undefined; const result = validateCommandReceipt(value); if (result.command.key.namespace !== namespace || result.id !== id) invalid(); return result },
    async pending(namespace, limit, filter) {
      integer(limit, 1); if (limit > 256) invalid()
      if (filter) validatePendingFilter(filter, namespace)
      const value = await client.request('pending', { namespace, limit, ...(filter ? { filter } : {}) }, [])
      // A scoped reply acknowledges the filter; an old unfiltered array fails closed, even empty.
      let receipts = value
      if (filter) {
        const scoped = record(value, ['filter', 'receipts'])
        if (canonical(scoped['filter']) !== canonical(filter)) invalid()
        receipts = scoped['receipts']
      }
      if (!Array.isArray(receipts) || receipts.length > limit) invalid()
      return receipts.map((item) => {
        const receipt = validateCommandReceipt(item)
        if (receipt.command.key.namespace !== namespace || filter &&
          (!sameKey(receipt.command.key, filter.key) || filter.kind && receipt.command.kind !== filter.kind)) invalid()
        return receipt
      })
    },
    async commit(input) { const result = record(await client.request('commit', { input }), ['status'], ['snapshot']); if (result['status'] === 'committed') { const snapshot = validateRunSnapshot(result['snapshot']); if (!sameKey(snapshot.key, input.snapshot.key) || snapshot.revision !== input.expectedRevision + 1 || canonical(snapshot) !== canonical(input.snapshot)) invalid(); return { status: 'committed', snapshot } } if (!['conflict', 'stale-lease'].includes(result['status'] as string) || Object.hasOwn(result, 'snapshot')) invalid(); return { status: result['status'] as 'conflict' | 'stale-lease' } },
    async events(key, after, limit) { integer(after); integer(limit, 1); if (limit > 256) invalid(); return validateReplay(await client.request('events', { key, after, limit }, { status: 'empty', events: [], latestCursor: after, nextCursor: after }), key, after, limit) },
    async claim(namespace, resources, ownerId, ttlMs) { integer(ttlMs, 1); const unique = [...new Set(resources)]; validateLease({ namespace, ownerId, token: 'probe', expiresAt: 0, epochs: Object.fromEntries(unique.map((r) => [r, 1])) }); return claim(await client.request('claim', { resources: unique, ttlMs }), namespace, ownerId, unique) },
    async renew(lease, ttlMs) { validateLease(lease); integer(ttlMs, 1); return claim(await client.request('renew', { lease, ttlMs }), lease.namespace, lease.ownerId, Object.keys(lease.epochs)) },
    async claimImportFence(key, ownerId, ttlMs) { return store.claim(key.namespace, [importFenceResource(key)], ownerId, ttlMs) },
    async release(lease) { validateLease(lease); const value = record(await client.request('release', { lease }), ['released']); if (value['released'] !== true) invalid() },
    async valid(lease) { validateLease(lease); const value = record(await client.request('valid', { lease }), ['valid']); if (typeof value['valid'] !== 'boolean') invalid(); return value['valid'] },
    async close() { client.close() },
  }
  // All port arguments are serializable intent, not signals or host callbacks.
  // Snapshot them before the first await, including post-response scope checks.
  return new Proxy(store, { get(target, property: keyof RunStore) {
    const method = target[property]
    if (typeof method !== 'function') return method
    return (...args: unknown[]) => (method as (...values: unknown[]) => Promise<unknown>)(...structuredClone(args))
  } })
}
