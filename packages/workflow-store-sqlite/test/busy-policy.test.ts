import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { openSqliteRunStore } from '../src/index.ts'
import { withBusyPolicy } from './busy-policy.ts'

it.each([true, false])('bounds unchanged claims under a real write lock (released: %s)', async (release) => {
  const directory = mkdtempSync(join(tmpdir(), 'brambo-busy-policy-'))
  const path = join(directory, 'store.sqlite')
  const store = await openSqliteRunStore({ path })
  const blocker = new DatabaseSync(path)
  blocker.exec('BEGIN IMMEDIATE')
  let locked = true
  const commands: unknown[] = []
  const failures: unknown[] = []
  let retries = 0
  try {
    const result = await withBusyPolicy(async () => {
      const command = ['tenant', ['workspace:shared', 'run:shared'], 'owner-a', 30_000] as const
      commands.push(command)
      try { return await store.claim(...command) }
      catch (error) { failures.push(error); throw error }
    }, () => {
      retries += 1
      if (release && locked) { blocker.exec('ROLLBACK'); locked = false }
    }).catch((error: unknown) => error)
    expect(commands).toEqual(Array.from({ length: release ? 2 : 3 }, () =>
      ['tenant', ['workspace:shared', 'run:shared'], 'owner-a', 30_000]))
    expect(retries).toBe(release ? 1 : 2)
    if (release) {
      expect(result).toMatchObject({ status: 'acquired' })
      const other = await store.claim('tenant', ['workspace:shared', 'run:shared'], 'owner-b', 30_000)
      expect(other.status).toBe('contended')
    } else {
      expect(result).toBe(failures[2])
      expect(result).toMatchObject({ code: 'BRAMBO_WORKFLOW_STORE_BUSY' })
    }
  } finally {
    if (locked) blocker.exec('ROLLBACK')
    blocker.close()
    await store.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

it('does not retry an unrelated real store-opening error', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'brambo-busy-unavailable-'))
  let attempts = 0
  let retries = 0
  let original: unknown
  try {
    const error = await withBusyPolicy(async () => {
      attempts += 1
      try { return await openSqliteRunStore({ path: join(directory, 'missing', 'store.sqlite') }) }
      catch (failure) { original = failure; throw failure }
    }, () => { retries += 1 }).catch((failure: unknown) => failure)
    expect(error).toBe(original)
    expect(error).toMatchObject({ code: 'BRAMBO_WORKFLOW_STORE_UNAVAILABLE' })
    expect(attempts).toBe(1)
    expect(retries).toBe(0)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
