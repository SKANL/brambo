import { openSqliteRunStore } from '../src/index.ts'

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
    const result = await store.claim('tenant', ['workspace:shared', 'run:shared'], ownerId, 30_000)
    await send({ type: 'result', status: result.status })
    await waitForCommand()
  } catch (error) {
    await send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    process.exitCode = 1
  } finally {
    await store.close()
    await send({ type: 'closed' })
    process.disconnect?.()
  }
}

void main().catch(async (error: unknown) => {
  await send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  process.disconnect?.()
})
