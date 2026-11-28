import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { worktreeStateDir } from '@brambodev/session'
import { runBrambo } from '../src/run.ts'
import type { RunCommandOptions } from '../src/run.ts'

// The audit verb at the BINARY. The store is written through its documented
// on-disk layout rather than through the ledger class, so this test proves the
// shipped command reads what a real run leaves behind, not what a helper of the
// same package happens to produce.

const projects: string[] = []
afterAll(async () => {
  for (const project of projects) await rm(project, { recursive: true, force: true })
})

function capture(): RunCommandOptions & { out: string[]; err: string[] } {
  const out: string[] = []
  const err: string[] = []
  return { stdout: (line) => out.push(line), stderr: (line) => err.push(line), out, err }
}

async function project(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'brambo-cli-ws-audit-'))
  projects.push(dir)
  await mkdir(join(dir, '.brambo'), { recursive: true })
  return dir
}

async function record(
  dir: string,
  id: string,
  ordinal: number,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  const stateDir = worktreeStateDir(dir)
  await mkdir(join(stateDir, 'records'), { recursive: true })
  await writeFile(
    join(stateDir, 'records', `${id}.json`),
    `${JSON.stringify({
      version: 1,
      id,
      ordinal,
      path: join(stateDir, 'trees', id),
      repoPath: join(dir, 'repo'),
      createdAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    })}\n`,
    'utf8',
  )
}

describe('brambo workspace audit', () => {
  it('reports every owned worktree as JSON and exits 0', async () => {
    const dir = await project()
    await record(dir, 'w-1', 1, { lastSeenAt: '2026-01-01T00:00:00.000Z' })

    const io = capture()
    const code = await runBrambo(['workspace', 'audit'], { cwd: dir, ...io })

    expect(code).toBe(0)
    const report = JSON.parse(io.out.join('\n')) as {
      stateDir: string
      ttlHours: number
      entries: Array<{ id: string; identity: string; expiry: string; classification: string; measurement: { kind: string } }>
      plan: { reclaimable: unknown[]; needsReview: unknown[] }
    }
    expect(report.ttlHours).toBe(24)
    expect(report.entries).toHaveLength(1)
    expect(report.entries[0]?.id).toBe('w-1')
    expect(report.entries[0]?.identity.endsWith('::w-1')).toBe(true)
    expect(report.entries[0]?.expiry).toBe('expired')
    // The directory was never created, so nothing could be observed about its
    // commit: absent, and therefore never reclaimable.
    expect(report.entries[0]?.measurement.kind).toBe('absent')
    expect(report.entries[0]?.classification).toBe('needs-review')
    expect(report.plan.reclaimable).toHaveLength(0)
    expect(report.plan.needsReview).toHaveLength(1)
  })

  it('accepts an explicit lease window', async () => {
    const dir = await project()
    await record(dir, 'w-1', 1, { lastSeenAt: new Date().toISOString() })

    const io = capture()
    const code = await runBrambo(['workspace', 'audit', '--ttl-hours', '1'], { cwd: dir, ...io })

    expect(code).toBe(0)
    const report = JSON.parse(io.out.join('\n')) as { ttlHours: number; entries: Array<{ expiry: string }> }
    expect(report.ttlHours).toBe(1)
    expect(report.entries[0]?.expiry).toBe('held')
  })

  it('rejects an invalid window with exit 2', async () => {
    const dir = await project()
    const io = capture()
    const code = await runBrambo(['workspace', 'audit', '--ttl-hours', '0'], { cwd: dir, ...io })
    expect(code).toBe(2)
    expect(io.err.join('\n')).toContain('--ttl-hours')
  })

  it('rejects an unknown flag with exit 2', async () => {
    const dir = await project()
    const io = capture()
    const code = await runBrambo(['workspace', 'audit', '--nope'], { cwd: dir, ...io })
    expect(code).toBe(2)
  })
})
