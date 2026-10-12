import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, describe, expect, it } from 'vitest'

const run = promisify(execFile)
const CHILD = join(import.meta.dirname, 'reserve-child.ts')
const root = await mkdtemp(join(tmpdir(), 'brambo-ledger-lock-'))
afterAll(() => rm(root, { recursive: true, force: true, maxRetries: 3 }))

describe('WorktreeLedger.reserveOrdinal across processes', () => {
  it('never issues the same ordinal to two processes', async () => {
    const startAt = Date.now() + 1500
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        run(process.execPath, ['--conditions=brambo-source', CHILD, root, String(startAt), '5'], { timeout: 60_000 }),
      ),
    )
    const ordinals = results.flatMap((result) => JSON.parse(result.stdout) as number[])
    expect(ordinals).toHaveLength(30)
    expect(new Set(ordinals).size).toBe(30)
    expect([...ordinals].sort((a, b) => a - b)).toEqual(Array.from({ length: 30 }, (_, index) => index))
  }, 90_000)
})
