import { validateProtocolResponse, validateRunSnapshot } from '@brambodev/contracts'
import type { ReplayPage, RunEvent, RunKey, RunStore } from '@brambodev/contracts'
import { integer, invalid, record } from './client.ts'
export function validateReplay(value: unknown, key: RunKey, after: number, limit: number): ReplayPage {
  integer(after); integer(limit, 1)
  if (limit > 256) invalid()
  const page = record(value, ['status', 'events', 'latestCursor', 'nextCursor'], ['snapshot'])
  const latest = integer(page['latestCursor'])
  const next = integer(page['nextCursor'])
  if (!Array.isArray(page['events']) || page['events'].length > limit) invalid()
  if (page['status'] === 'overflow') {
    const snapshot = validateRunSnapshot(page['snapshot'])
    if (snapshot.key.namespace !== key.namespace || snapshot.key.runId !== key.runId || page['events'].length || next !== latest || next < after) invalid()
  } else {
    if (!['ok', 'empty'].includes(page['status'] as string) || Object.hasOwn(page, 'snapshot')) invalid()
    let cursor = after
    for (const value of page['events']) {
      const event = record(value, ['schemaVersion', 'key', 'cursor', 'type', 'payload', 'occurredAt'])
      const scoped = record(event['key'], ['namespace', 'runId'])
      if (event['schemaVersion'] !== 1 || scoped['namespace'] !== key.namespace || scoped['runId'] !== key.runId ||
        integer(event['cursor'], 1) !== cursor + 1 || typeof event['type'] !== 'string' || !event['type'] ||
        typeof event['occurredAt'] !== 'string' || !event['occurredAt']) invalid()
      validateProtocolResponse({ version: 1, status: 'ok', payload: event['payload'] })
      cursor++
    }
    if (next !== cursor || latest < cursor || (page['status'] === 'empty') !== (page['events'].length === 0)) invalid()
  }
  return { status: page['status'] as ReplayPage['status'], events: page['events'] as RunEvent[], latestCursor: latest, nextCursor: next,
    ...(page['snapshot'] ? { snapshot: page['snapshot'] as ReplayPage['snapshot'] } : {}) }
}
/** Replay is observation only; never execute tools or advance authoritative state. */
export async function replayRun(store: RunStore, key: RunKey, after: number, limit: number): Promise<ReplayPage> {
  integer(after); integer(limit, 1)
  if (limit > 256) invalid()
  return validateReplay(await store.events(key, after, limit), key, after, limit)
}
