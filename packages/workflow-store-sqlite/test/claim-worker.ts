import { openSqliteRunStore } from '../src/index.ts'

let phase = 'open'

async function reportFailure(error: unknown): Promise<void> {
  await send({
    type: 'error', phase,
    message: error instanceof Error ? error.message : String(error),
    code: (error as { code?: unknown } | null)?.code,
    stack: error instanceof Error ? error.stack?.slice(0, 2048) : undefined,
  })
  process.exitCode = 1
}

function send(message: unknown): Promise<void> {
  return new Promise((resolve) => {
    if (!process.send) { resolve(); return }
    process.send(message, () => resolve())
  })
}

function waitForCommand(): Promise<string> {
  return new Promise((resolve) => {
    process.once('message', (message) => {
      const command = message as { type?: unknown } | null
      resolve(command?.type === 'release' ? 'release' : 'close')
    })
  })
}

async function main(): Promise<void> {
  const path = process.argv[2]
  const ownerId = process.argv[3]
  if (!path || !ownerId) throw new Error('Database path and owner ID are required')
  const store = await openSqliteRunStore({ path })
  try {
    await send({ type: 'ready' })
    if (await waitForCommand() === 'close') return
    phase = 'claim'
    const result = await store.claim('tenant', ['workspace:shared', 'run:shared'], ownerId, 30_000)
    await send({ type: 'result', status: result.status })
    await waitForCommand()
  } catch (error) {
    await reportFailure(error)
  } finally {
    phase = 'close'
    await store.close()
    await send({ type: 'closed' })
    process.disconnect?.()
  }
}

void main().catch(async (error: unknown) => {
  await reportFailure(error)
  process.disconnect?.()
})
