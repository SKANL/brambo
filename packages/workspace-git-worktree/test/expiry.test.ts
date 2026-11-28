import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WorktreeLedger } from '../src/ledger.ts'
import { expiryOf } from '../src/expiry.ts'
import { expiredWorktrees } from '../src/index.ts'
import type { WorktreeRecord } from '../src/ledger.ts'

const HOUR = 60 * 60 * 1000

function record(overrides: Partial<WorktreeRecord> = {}): WorktreeRecord {
  return {
    version: 1,
    id: 'w-1',
    ordinal: 1,
    path: '/trees/w-1',
    repoPath: '/repo',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('expiryOf', () => {
  it('holds a lease that was renewed inside its window', () => {
    const verdict = expiryOf(record({ lastSeenAt: '2026-01-01T10:00:00.000Z' }), {
      ttlMs: 24 * HOUR,
      now: Date.parse('2026-01-01T12:00:00.000Z'),
    })
    expect(verdict).toBe('held')
  })

  it('expires a lease exactly at its window boundary', () => {
    const verdict = expiryOf(record({ lastSeenAt: '2026-01-01T00:00:00.000Z' }), {
      ttlMs: 24 * HOUR,
      now: Date.parse('2026-01-02T00:00:00.000Z'),
    })
    expect(verdict).toBe('expired')
  })

  it('expires a lease older than its window', () => {
    const verdict = expiryOf(record({ lastSeenAt: '2026-01-01T00:00:00.000Z' }), {
      ttlMs: HOUR,
      now: Date.parse('2026-01-03T00:00:00.000Z'),
    })
    expect(verdict).toBe('expired')
  })

  it('falls back to createdAt for a record written before leases existed', () => {
    const verdict = expiryOf(record({ createdAt: '2026-01-01T00:00:00.000Z' }), {
      ttlMs: HOUR,
      now: Date.parse('2026-01-05T00:00:00.000Z'),
    })
    expect(verdict).toBe('expired')
  })

  it('prefers lastSeenAt over createdAt when both are present', () => {
    const verdict = expiryOf(
      record({ createdAt: '2026-01-01T00:00:00.000Z', lastSeenAt: '2026-01-09T00:00:00.000Z' }),
      { ttlMs: HOUR, now: Date.parse('2026-01-09T00:30:00.000Z') },
    )
    expect(verdict).toBe('held')
  })

  it('never expires a record it cannot date', () => {
    // Fail closed: an unparseable timestamp is corrupt metadata, and expiring on
    // it would let a reclaim delete work on the strength of a broken field.
    const verdict = expiryOf(record({ createdAt: 'not-a-date', lastSeenAt: 'also-not' }), {
      ttlMs: HOUR,
      now: Date.parse('2026-06-01T00:00:00.000Z'),
    })
    expect(verdict).toBe('held')
  })

  it('rejects a window that is not a positive finite number', () => {
    expect(() => expiryOf(record(), { ttlMs: 0, now: Date.now() })).toThrow(RangeError)
    expect(() => expiryOf(record(), { ttlMs: Number.NaN, now: Date.now() })).toThrow(RangeError)
  })
})

describe('WorktreeLedger leases', () => {
  let stateDir: string

  beforeEach(async () => {
    stateDir = await mkdtemp(join(tmpdir(), 'brambo-lease-'))
  })

  afterEach(async () => {
    await rm(stateDir, { recursive: true, force: true })
  })

  it('records lastSeenAt on touch and keeps the rest of the record intact', async () => {
    const ledger = new WorktreeLedger(stateDir)
    await ledger.writeRecord(record())
    const touched = await ledger.touch('w-1', new Date('2026-01-02T03:04:05.000Z'))
    expect(touched?.lastSeenAt).toBe('2026-01-02T03:04:05.000Z')
    const readBack = await ledger.readRecord('w-1')
    expect(readBack).toMatchObject({
      id: 'w-1',
      ordinal: 1,
      path: '/trees/w-1',
      repoPath: '/repo',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastSeenAt: '2026-01-02T03:04:05.000Z',
    })
  })

  it('answers an unknown id with absence instead of creating a record', async () => {
    const ledger = new WorktreeLedger(stateDir)
    expect(await ledger.touch('w-404')).toBeUndefined()
    expect(await ledger.readRecord('w-404')).toBeUndefined()
  })

  it('lists every owned record and skips ids that only have a removal intent', async () => {
    const ledger = new WorktreeLedger(stateDir)
    await ledger.writeRecord(record({ id: 'w-1', ordinal: 1 }))
    await ledger.writeRecord(record({ id: 'w-2', ordinal: 2, path: '/trees/w-2' }))
    // Reproduce `retire`'s crash window: the intent is written, the record is
    // already gone. The id must not be reported as owned.
    await ledger.claimRemoval('w-2')
    await rm(join(stateDir, 'records', 'w-2.json'))

    const records = await ledger.listRecords()
    expect(records.map((entry) => entry.id)).toEqual(['w-1'])
  })

  it('reports only the records whose lease expired', async () => {
    const ledger = new WorktreeLedger(stateDir)
    await ledger.writeRecord(record({ id: 'w-1', ordinal: 1, lastSeenAt: '2026-01-01T00:00:00.000Z' }))
    await ledger.writeRecord(
      record({ id: 'w-2', ordinal: 2, path: '/trees/w-2', lastSeenAt: '2026-01-20T00:00:00.000Z' }),
    )

    const expired = await expiredWorktrees(stateDir, {
      ttlMs: 24 * HOUR,
      now: Date.parse('2026-01-02T00:00:00.000Z'),
    })
    expect(expired.map((entry) => entry.id)).toEqual(['w-1'])
  })
})
