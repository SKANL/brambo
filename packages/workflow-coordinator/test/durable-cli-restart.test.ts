import { createHash } from 'node:crypto'
import { fork } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { createRemoteRunStore, createRemoteArtifactProvider } from '@brambodev/workflow-remote'
import type { Lease, RunSnapshot } from '@brambodev/contracts'

// Deliberately require SQLite: this qualification must not silently become a skipped PASS.
type Packet = Record<string, unknown>
function launch(name: string, args: string[], root: string) {
  const child = fork(fileURLToPath(new URL('./fixtures/' + name + '.ts', import.meta.url)), args, {
    execArgv: ['--conditions=brambo-source', '--experimental-strip-types'],
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows', SystemDrive: 'C:',
      HOME: root, USERPROFILE: root, TEMP: root, TMP: root },
  })
  // Do not emit child logs: only bounded code-owned IPC enums are diagnostic.
  child.stdout?.resume(); child.stderr?.resume()
  const packets: Packet[] = []
  child.on('message', packet => packets.push(packet as Packet))
  return { child, async receive(types: string[]) {
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      const index = packets.findIndex(packet => types.includes(String(packet['type'])))
      if (index >= 0) return packets.splice(index, 1)[0]!
      if (child.exitCode !== null || child.signalCode !== null) throw new Error('fixture exited before expected IPC')
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    throw new Error('fixture IPC deadline')
  } }
}
async function terminate(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = once(child, 'exit')
  child.kill('SIGKILL'); await exited
}
async function cleanup(root: string, children: ChildProcess[]) {
  for (const child of children.reverse()) await terminate(child)
  const actual = await realpath(root), boundary = await realpath(tmpdir())
  const path = relative(boundary, actual)
  if (path === '..' || path.startsWith('..' + sep) || isAbsolute(path)) throw new Error('cleanup scope')
  await rm(actual, { recursive: true, force: true })
}
async function scenario(revoked: boolean) {
  const root = await mkdtemp(join(tmpdir(), 'brambo-cli-restart-')), children: ChildProcess[] = []
  const coordinator = launch('coordinator-process', [root], root); children.push(coordinator.child)
  try {
    const ready = await coordinator.receive(['ready']), endpoint = ready['endpoint'] as string
    const remote = (subject: string) => ({ endpoint, fetch,
      authorizeRequest: async () => ({ authorization: 'synthetic-' + subject }) })
    const client = createRemoteRunStore(remote('alice'))
    const snapshot: RunSnapshot = { schemaVersion: 1, key: { namespace: 'tenant', runId: 'run' }, revision: 0,
      workflowId: 'flow', workflowVersion: '1', sessionId: 'session', status: 'pending',
      workspace: { namespace: 'tenant', workspaceId: 'parent', revision: ready['revision'] as string },
      tasks: [], context: null, cancelRequested: false }
    await client.create(snapshot, { key: snapshot.key, clientId: 'a', idempotencyKey: 'start',
      kind: 'start', payload: null }, { namespace: 'tenant', subject: 'alice' })
    const first = launch('worker-process', [endpoint, 'worker-a', join(root, 'worker-a'), 'cli-checkpoint'], root)
    children.push(first.child)
    const checkpoint = await first.receive(['checkpoint', 'done', 'failed'])
    // Catches the old fixture running past the admission boundary rather than pausing.
    expect(checkpoint['type']).toBe('checkpoint')
    const before = (await client.get(snapshot.key))!
    expect(before.tasks.map(task => [task.taskId, task.phase, task.attempt])).toEqual([
      ['a', 'succeeded', 1], ['b', 'pending', 0], ['c', 'pending', 0],
    ])
    expect((await readFile(join(root, 'cli-calls.log'), 'utf8')).trim().split('\n')).toEqual(['opencode'])
    const completed = structuredClone(before.tasks[0]!), stale = checkpoint['lease'] as Lease
    await terminate(first.child)
    // Wait for recorded authority expiry, not an arbitrary assumption that killing releases leases.
    const oldStore = createRemoteRunStore(remote('worker-a'))
    const deadline = Date.now() + 5_000
    while (await oldStore.valid(stale)) {
      if (Date.now() > deadline) throw new Error('lease expiry deadline')
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    const next = launch('worker-process', [endpoint, 'worker-b', join(root, 'worker-b'),
      revoked ? 'cli-revoked' : 'cli-run'], root); children.push(next.child)
    expect((await next.receive(['done', 'failed']))['type']).toBe('done')
    const after = (await client.get(snapshot.key))!
    expect(after.key).toEqual(snapshot.key)
    expect(after.sessionId).toBe(snapshot.sessionId)
    expect(after.workspace).toEqual(snapshot.workspace)
    expect(after.tasks[0]).toEqual(completed)
    const ledger = (await readFile(join(root, 'cli-calls.log'), 'utf8')).trim().split('\n')
    expect(ledger).toEqual(revoked ? ['opencode'] : ['opencode', 'claude-code', 'codex'])
    if (revoked) {
      expect(after.status).toBe('blocked')
      expect(after.tasks.map(task => [task.phase, task.attempt])).toEqual([
        ['succeeded', 1], ['blocked', 1], ['pending', 0],
      ])
    } else {
      expect(after.status).toBe('succeeded')
      expect(after.tasks.map(task => [task.phase, task.attempt])).toEqual([
        ['succeeded', 1], ['succeeded', 1], ['succeeded', 1],
      ])
    }
    const artifactClient = createRemoteArtifactProvider(remote('alice'))
    const manifest = await artifactClient.manifest(completed.workspace!)
    expect(manifest.revision).toBe(completed.workspace!.revision)
    expect(manifest.entries).toEqual([{ path: 'opencode.txt',
      digest: 'sha256:' + createHash('sha256').update('synthetic-opencode-artifact\n').digest('hex'),
      size: 28, executable: false }])
    const materialized = await artifactClient.materialize(completed.workspace!, join(root, 'verified-artifact'))
    expect(await readFile(join(materialized.rootPath, 'opencode.txt'), 'utf8')).toBe('synthetic-opencode-artifact\n')
    // Same authenticated stale worker cannot commit or publish with its expired capability.
    expect((await oldStore.commit({ snapshot: { ...after, revision: after.revision + 1 },
      expectedRevision: after.revision, lease: stale, events: [] })).status).toBe('stale-lease')
    const oldArtifacts = createRemoteArtifactProvider(remote('worker-a'))
    await expect(oldArtifacts.publish(completed.workspace!, manifest, stale)).rejects.toThrow()
    expect((await client.get(snapshot.key))?.revision).toBe(after.revision)
    await client.close(); await oldStore.close()
  } finally { await cleanup(root, children) }
}

test('completed CLI checkpoint survives actual worker termination and reconstructed restart without duplicates',
  () => scenario(false), 30_000)
test('revoked reconstruction actor receives no CLI dispatch after completed checkpoint restart',
  () => scenario(true), 30_000)

test('spawn ledger records a dispatched CLI even when malformed reconstruction is refused', async () => {
  const root = await mkdtemp(join(tmpdir(), 'brambo-cli-counter-')), children: ChildProcess[] = []
  const coordinator = launch('coordinator-process', [root], root); children.push(coordinator.child)
  try {
    const ready = await coordinator.receive(['ready'])
    const client = createRemoteRunStore({ endpoint: ready['endpoint'] as string, fetch,
      authorizeRequest: async () => ({ authorization: 'synthetic-alice' }) })
    const snapshot: RunSnapshot = { schemaVersion: 1, key: { namespace: 'tenant', runId: 'run' }, revision: 0,
      workflowId: 'flow', workflowVersion: '1', sessionId: 'session', status: 'pending',
      workspace: { namespace: 'tenant', workspaceId: 'parent', revision: ready['revision'] as string },
      tasks: [], context: null, cancelRequested: false }
    await client.create(snapshot, { key: snapshot.key, clientId: 'a', idempotencyKey: 'start',
      kind: 'start', payload: null }, { namespace: 'tenant', subject: 'alice' })
    const worker = launch('worker-process', [ready['endpoint'] as string, 'worker-a',
      join(root, 'worker-a'), 'cli-malformed'], root); children.push(worker.child)
    expect((await worker.receive(['done', 'failed']))['type']).toBe('done')
    const outcome = (await client.get(snapshot.key))!
    expect(outcome.status).toBe('blocked')
    expect(outcome.tasks.map(task => [task.phase, task.attempt])).toEqual([
      ['succeeded', 1], ['blocked', 1], ['pending', 0],
    ])
    // A refusing child was still dispatched: successful parsing must not hide that attempt.
    expect((await readFile(join(root, 'cli-calls.log'), 'utf8')).trim().split('\n'))
      .toEqual(['opencode', 'claude-code'])
    await client.close()
  } finally { await cleanup(root, children) }
}, 30_000)
