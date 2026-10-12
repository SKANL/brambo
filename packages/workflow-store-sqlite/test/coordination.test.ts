import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { openSqliteRunStore } from '../src/index.ts'

it('persists only token hashes for SQLite lease authority', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'brambo-lease-'))
  const path = join(directory, 'store.sqlite')
  const store = await openSqliteRunStore({ path, now: () => 1000 })
  try {
    const claim = await store.claim('tenant', ['run:run'], 'owner', 1000)
    expect(claim.status).toBe('acquired')
    if (claim.status !== 'acquired') return
    const db = new DatabaseSync(path)
    try {
      const persisted = JSON.stringify([
        db.prepare('SELECT * FROM lease_claims').all(),
        db.prepare('SELECT * FROM resource_epochs').all(),
      ])
      expect(persisted).not.toContain(claim.lease.token)
    } finally { db.close() }
  } finally {
    await store.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

it('prunes released and superseded lease claims without resetting fencing epochs', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'brambo-lease-prune-'))
  const path = join(directory, 'store.sqlite')
  let now = 1000
  const store = await openSqliteRunStore({ path, now: () => now })
  const claimRows = (): number => {
    const db = new DatabaseSync(path)
    try { return Number(db.prepare('SELECT COUNT(*) AS n FROM lease_claims').get()?.['n']) } finally { db.close() }
  }
  try {
    const first = await store.claim('tenant', ['run:run'], 'owner', 1000)
    if (first.status !== 'acquired') throw new Error('fixture')
    await store.release(first.lease)
    const second = await store.claim('tenant', ['run:run'], 'owner', 1000)
    if (second.status !== 'acquired') throw new Error('fixture')
    expect(second.lease.epochs['run:run']).toBe(2)
    expect(claimRows()).toBe(1)

    now = 5000
    const third = await store.claim('tenant', ['run:run'], 'owner', 1000)
    if (third.status !== 'acquired') throw new Error('fixture')
    expect(third.lease.epochs['run:run']).toBe(3)
    expect(await store.valid(second.lease)).toBe(false)
    expect(await store.valid(third.lease)).toBe(true)
    expect(claimRows()).toBe(1)
  } finally {
    await store.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
