import { EventEmitter, once } from 'node:events'
import { spawn, type ChildProcess } from 'node:child_process'
import { expect, it } from 'vitest'
import { closeWorker } from './worker-lifecycle.ts'

// Freeze otherwise nondeterministic Node IPC/exit ordering at its transport boundary.
type MutableChild = { -readonly [Key in keyof ChildProcess]: ChildProcess[Key] }
function childFixture(send: (callback?: (error: Error | null) => void) => void): MutableChild {
  const child = Object.assign(new EventEmitter(), {
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    connected: true,
    send: (_message: unknown, callback?: (error: Error | null) => void) => { send(callback); return true },
  })
  return child as unknown as MutableChild
}

it('waits for exit when the peer closes its pipe before the close send completes', async () => {
  const pipeError = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })
  const child = childFixture((callback) => {
    queueMicrotask(() => {
      if (callback) callback(pipeError)
      else child.emit('error', pipeError)
      child.exitCode = 0
      child.emit('exit', 0, null)
    })
  })
  await expect(closeWorker(child)).resolves.toBeUndefined()
  expect(child.listenerCount('exit')).toBe(0)
  expect(child.listenerCount('error')).toBe(0)
})

it('closes a real IPC peer and removes lifecycle listeners', async () => {
  const child = spawn(process.execPath, ['-e', `
    process.on('message', () => process.disconnect());
    process.send('ready');
  `], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
  try {
    await once(child, 'message')
    await closeWorker(child)
    expect(child.exitCode).toBe(0)
    expect(child.listenerCount('exit')).toBe(0)
    expect(child.listenerCount('error')).toBe(0)
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit')
      child.kill()
      await exited
    }
  }
})

it('recognizes an already terminated real process without sending IPC', async () => {
  const child = spawn(process.execPath, ['-e', `
    setInterval(() => {}, 1000);
    process.send('ready');
  `], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
  await once(child, 'message')
  const exited = once(child, 'exit')
  child.kill('SIGTERM')
  await exited
  await closeWorker(child)
  expect(child.listenerCount('exit')).toBe(0)
  expect(child.listenerCount('error')).toBe(0)
})

it('does not wait for a second exit event from an already signal-terminated peer', async () => {
  let sends = 0
  const child = childFixture(() => { sends += 1 })
  child.signalCode = 'SIGTERM'
  child.connected = false
  const outcome = await Promise.race([
    closeWorker(child).then(() => 'closed'),
    new Promise<string>((resolve) => setImmediate(() => resolve('still waiting'))),
  ])
  expect(outcome).toBe('closed')
  expect(sends).toBe(0)
})

it('subscribes before sending when exit is delivered synchronously', async () => {
  const child = childFixture((callback) => {
    child.emit('exit', 0, null)
    child.exitCode = 0
    callback?.(null)
  })
  await closeWorker(child)
  expect(child.listenerCount('exit')).toBe(0)
})

it('does not suppress an unrelated child-process error during teardown', async () => {
  const failure = Object.assign(new Error('process failure'), { code: 'EACCES' })
  const child = childFixture(() => queueMicrotask(() => child.emit('error', failure)))
  await expect(closeWorker(child)).rejects.toBe(failure)
  expect(child.listenerCount('exit')).toBe(0)
  expect(child.listenerCount('error')).toBe(0)
})

it('preserves the original operation failure when cleanup races peer disconnection', async () => {
  const operationError = new Error('SQLite workflow storage is busy; operation did not complete')
  const pipeError = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })
  const child = childFixture((callback) => queueMicrotask(() => {
    if (callback) callback(pipeError)
    else child.emit('error', pipeError)
    child.exitCode = 1
    child.emit('exit', 1, null)
  }))
  const operation = async (): Promise<void> => {
    try { throw operationError }
    finally { await closeWorker(child) }
  }
  await expect(operation()).rejects.toBe(operationError)
})
