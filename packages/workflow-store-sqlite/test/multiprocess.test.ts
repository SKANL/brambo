import { fork, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { closeWorker } from './worker-lifecycle.ts'
import { openSqliteRunStore } from '../src/index.ts'

interface WorkerMessage {
  readonly type: string
  readonly status?: string
  readonly message?: string
  readonly phase?: string
  readonly code?: string
  readonly stack?: string
}

async function waitFor(child: ChildProcess, type: string): Promise<WorkerMessage> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      child.off('message', onMessage)
      child.off('exit', onExit)
      child.off('error', onError)
    }
    const onMessage = (value: unknown): void => {
      const message = value as WorkerMessage
      if (message.type === 'error') {
        cleanup()
        const context = `${message.phase ?? 'unknown'} before ${type} [${message.code ?? 'unclassified'}]`
        reject(Object.assign(new Error(`${message.message ?? 'Claim worker failed'} (${context})`), {
          phase: message.phase, code: message.code,
          expectedMessage: type, workerStack: message.stack,
        }))
      } else if (message.type === type) {
        cleanup()
        resolve(message)
      }
    }
    const onExit = (code: number | null): void => {
      cleanup()
      reject(new Error(`Claim worker exited with code ${code} before ${type}`))
    }
    const onError = (error: Error): void => { cleanup(); reject(error) }
    child.on('message', onMessage)
    child.once('exit', onExit)
    child.once('error', onError)
  })
}

it('admits exactly one process claiming a shared run/workspace pair behind barriers', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'brambo-multiprocess-lease-'))
  const path = join(directory, 'store.sqlite')
  const setup = await openSqliteRunStore({ path })
  await setup.close()
  const workerPath = fileURLToPath(new URL('./claim-worker.ts', import.meta.url))
  // Explicit host policy retries only unchanged typed BUSY operations, never entire tests.
  const children = ['owner-a', 'owner-b'].map((owner) => fork(workerPath, [path, owner, '--retry-busy'], {
    execArgv: ['--conditions=brambo-source'],
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  }))
  try {
    const ready = children.map((child) => waitFor(child, 'ready'))
    await Promise.all(ready)
    const results = children.map((child) => waitFor(child, 'result'))
    for (const child of children) child.send({ type: 'release' })
    const outcomes = await Promise.all(results)
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['acquired', 'contended'])
  } finally {
    await Promise.all(children.map(closeWorker))
    rmSync(directory, { recursive: true, force: true })
  }
}, 15000)

it.each(['open', 'claim'] as const)('preserves %s BUSY diagnostics across the worker boundary', async (phase) => {
  const directory = mkdtempSync(join(tmpdir(), 'brambo-worker-busy-'))
  const path = join(directory, 'store.sqlite')
  const setup = await openSqliteRunStore({ path })
  await setup.close()
  const blocker = new DatabaseSync(path)
  let locked = false
  const lock = (): void => { blocker.exec('BEGIN IMMEDIATE'); locked = true }
  if (phase === 'open') lock()
  const child = fork(fileURLToPath(new URL('./claim-worker.ts', import.meta.url)), [path, 'diagnostic-owner'], {
    execArgv: ['--conditions=brambo-source'],
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  try {
    const expectedMessage = phase === 'open' ? 'ready' : 'result'
    if (phase === 'claim') { await waitFor(child, 'ready'); lock() }
    const failure = waitFor(child, expectedMessage).catch((error: unknown) => error)
    if (phase === 'claim') child.send({ type: 'release' })
    // Keep the real write lock until the operation fails: no sleeps or timeout changes.
    const error = await failure
    expect(error).toMatchObject({ phase, expectedMessage, code: 'BRAMBO_WORKFLOW_STORE_BUSY' })
    expect((error as Error).message).toContain(phase)
    expect((error as Error).message).toContain(expectedMessage)
    expect((error as Error).message).toContain('BRAMBO_WORKFLOW_STORE_BUSY')
    expect((error as Error).message).toContain('SQLite workflow storage is busy; operation did not complete')
    const stack = (error as { workerStack?: string }).workerStack
    expect(stack).toContain(phase === 'open' ? 'initializeSchema' : 'claimSqliteLease')
    expect(stack!.length).toBeLessThanOrEqual(2048)
  } finally {
    if (locked) blocker.exec('ROLLBACK')
    blocker.close()
    await closeWorker(child)
    rmSync(directory, { recursive: true, force: true })
  }
}, 15000)

it.each(['open', 'claim'] as const)('recovers %s with the explicit host policy after observing BUSY', async (phase) => {
  const directory = mkdtempSync(join(tmpdir(), 'brambo-worker-recovery-'))
  const path = join(directory, 'store.sqlite')
  const setup = await openSqliteRunStore({ path })
  await setup.close()
  const blocker = new DatabaseSync(path)
  let locked = false
  const lock = (): void => { blocker.exec('BEGIN IMMEDIATE'); locked = true }
  if (phase === 'open') lock()
  const child = fork(fileURLToPath(new URL('./claim-worker.ts', import.meta.url)), [path, 'owner-a', '--retry-busy'], {
    execArgv: ['--conditions=brambo-source'], stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  const retries: string[] = []
  const onMessage = (value: unknown): void => {
    const message = value as WorkerMessage
    if (message.type === 'retry') {
      retries.push(message.phase!)
      if (locked) { blocker.exec('ROLLBACK'); locked = false }
    }
  }
  child.on('message', onMessage)
  try {
    await waitFor(child, 'ready')
    if (phase === 'claim') lock()
    const result = waitFor(child, 'result')
    child.send({ type: 'release' })
    expect(await result).toMatchObject({ status: 'acquired' })
    expect(retries).toEqual([phase])
  } finally {
    child.off('message', onMessage)
    if (locked) blocker.exec('ROLLBACK')
    blocker.close()
    await closeWorker(child)
    rmSync(directory, { recursive: true, force: true })
  }
}, 15000)
