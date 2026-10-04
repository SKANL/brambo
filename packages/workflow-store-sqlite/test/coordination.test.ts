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
