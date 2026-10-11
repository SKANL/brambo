import { once } from 'node:events'
import { fork, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { openSqliteRunStore } from '../src/index.ts'

interface WorkerMessage {
  readonly type: string
  readonly status?: string
  readonly message?: string
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
        reject(new Error(message.message ?? 'Claim worker failed'))
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

async function closeWorker(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return
  if (child.connected) child.send({ type: 'close' })
  if (child.exitCode === null) await once(child, 'exit')
}

it('admits exactly one process claiming a shared run/workspace pair behind barriers', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'brambo-multiprocess-lease-'))
  const path = join(directory, 'store.sqlite')
  const setup = await openSqliteRunStore({ path })
  await setup.close()
  const workerPath = fileURLToPath(new URL('./claim-worker.ts', import.meta.url))
  const children = ['owner-a', 'owner-b'].map((owner) => fork(workerPath, [path, owner], {
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
