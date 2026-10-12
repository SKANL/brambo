import type { ChildProcess } from 'node:child_process'

export async function closeWorker(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      child.off('exit', onExit)
      child.off('error', onError)
    }
    const onExit = (): void => { cleanup(); resolve() }
    const onError = (error: Error): void => { cleanup(); reject(error) }
    // Subscribe before sending: the peer may already be disconnecting/exiting.
    child.once('exit', onExit)
    child.once('error', onError)
    if (child.connected) {
      child.send({ type: 'close' }, (error) => {
        // A peer that closes first cannot receive close. Still await its exit;
        // the operation's existing failure must not be replaced by this race.
        const code = (error as NodeJS.ErrnoException | null)?.code
        if (error && code !== 'EPIPE' && code !== 'ERR_IPC_CHANNEL_CLOSED') onError(error)
      })
    }
  })
}

