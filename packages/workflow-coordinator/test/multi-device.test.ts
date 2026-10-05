import { fork } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { createRemoteRunStore, createRemoteArtifactProvider } from '@brambodev/workflow-remote'
import type { RunSnapshot } from '@brambodev/contracts'

// SQLite's declared runtime floor is a capability boundary, not a test fallback.
const [major, minor] = process.versions.node.split('.').map(Number)
const sqliteAvailable = major! > 24 || major === 24 && minor! >= 15

function launch(name: string, args: string[]) {
  const process = fork(fileURLToPath(new URL('./fixtures/' + name + '.ts', import.meta.url)), args,
    { execArgv: ['--conditions=brambo-source', '--experimental-strip-types'], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  let errors = ''
  process.stderr?.on('data', chunk => { errors += String(chunk) })
  return { process, errors: () => errors }
}
function message(child: ChildProcess, type: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => cleanup(new Error('process did not report ' + type)), 15_000)
    const listener = (value: Record<string, unknown>) => { if (value['type'] === type) cleanup(undefined, value) }
    const exit = () => cleanup(new Error('process exited before ' + type))
    function cleanup(error?: Error, value?: Record<string, unknown>) {
      clearTimeout(timer); child.off('message', listener); child.off('exit', exit)
      if (error) reject(error); else resolve(value!)
    }
    child.on('message', listener); child.once('exit', exit)
  })
}
async function kill(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = once(child, 'exit')
  child.kill('SIGKILL'); await exited
}

test.skipIf(!sqliteAvailable)('cross-user-continuation: actual killed worker, independent clients and immutable revision; zero control-plane tools', async () => {
  const root = await mkdtemp(join(tmpdir(), 'brambo-devices-')), children: ChildProcess[] = []
  const coordinator = launch('coordinator-process', [root]); children.push(coordinator.process)
  try {
    const ready = await message(coordinator.process, 'ready')
    const endpoint = ready['endpoint'] as string
    const client = (subject: string) => createRemoteRunStore({ endpoint, fetch, authorizeRequest: async () => ({ authorization: 'synthetic-' + subject }) })
    const a = client('alice'), b = client('bob')
    const snapshot: RunSnapshot = { schemaVersion: 1, key: { namespace: 'tenant', runId: 'run' }, revision: 0,
      workflowId: 'flow', workflowVersion: '1', sessionId: 'session', status: 'pending',
      workspace: { namespace: 'tenant', workspaceId: 'parent', revision: ready['revision'] as string }, tasks: [], context: null, cancelRequested: false }
    const started = await a.create(snapshot, { key: snapshot.key, clientId: 'a', idempotencyKey: 'start', kind: 'start', payload: null }, { namespace: 'tenant', subject: 'alice' })
    expect(started.status).toBe('accepted')
    const first = launch('worker-process', [endpoint, 'worker-a', join(root, 'worker-a'), 'pause']); children.push(first.process)
    try { await message(first.process, 'paused') } catch (error) { throw new Error(String(error) + first.errors(), { cause: error }) }
    const before = await b.get(snapshot.key)
    expect(before?.tasks[0]?.phase).toBe('succeeded')
    const revision = before!.tasks[0]!.workspace!.revision
    await kill(first.process)
    await new Promise(resolve => setTimeout(resolve, 3500))
    await b.admit({ key: snapshot.key, clientId: 'b', idempotencyKey: 'continue', kind: 'continue', payload: null }, { namespace: 'tenant', subject: 'bob' })
    const second = launch('worker-process', [endpoint, 'worker-b', join(root, 'worker-b'), 'run']); children.push(second.process)
    try { expect((await message(second.process, 'done'))['worked']).toBe(true) } catch (error) { throw new Error(String(error) + second.errors(), { cause: error }) }
    const resumed = await b.get(snapshot.key)
    expect(resumed?.key).toEqual(snapshot.key)
    expect(resumed?.sessionId).toBe(snapshot.sessionId)
    expect(resumed?.workspace).toEqual(snapshot.workspace)
    expect(resumed?.tasks[0]?.workspace?.revision).toBe(revision)
    expect(resumed?.status).toBe('succeeded')
    expect((await readFile(join(root, 'tool-calls.log'), 'utf8')).trim().split('\n')).toEqual(['a', 'b'])
    expect(ready['controlPlaneTools']).toEqual([])
    const artifactClient = createRemoteArtifactProvider({ endpoint, fetch, authorizeRequest: async () => ({ authorization: 'synthetic-bob' }) })
    expect((await artifactClient.manifest(resumed!.tasks[0]!.workspace!)).revision).toBe(revision)
    expect((await a.pending('tenant', 256))).toEqual([])
    await a.close(); await b.close()
  } finally { for (const child of children.reverse()) await kill(child); await rm(root, { recursive: true, force: true }) }
}, 30_000)

test.skipIf(!sqliteAvailable)('two-worker-partition: remote contention, expiry/takeover and stale state/artifact refusal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'brambo-partition-'))
  const coordinator = launch('coordinator-process', [root])
  const children = [coordinator.process]
  try {
    const ready = await message(coordinator.process, 'ready'), endpoint = ready['endpoint'] as string
    const remote = (subject: string) => ({ endpoint, fetch, authorizeRequest: async () => ({ authorization: 'synthetic-' + subject }) })
    const old = createRemoteRunStore(remote('worker-a')), next = createRemoteRunStore(remote('worker-b'))
    const snapshot: RunSnapshot = { schemaVersion: 1, key: { namespace: 'tenant', runId: 'run' }, revision: 0,
      workflowId: 'flow', workflowVersion: '1', sessionId: 'session', status: 'pending',
      workspace: { namespace: 'tenant', workspaceId: 'parent', revision: ready['revision'] as string }, tasks: [], context: null, cancelRequested: false }
    await old.create(snapshot, { key: snapshot.key, clientId: 'a', idempotencyKey: 'start', kind: 'start', payload: null }, { namespace: 'tenant', subject: 'worker-a' })
    const first = launch('worker-process', [endpoint, 'worker-a', join(root, 'worker-a'), 'authority'])
    const second = launch('worker-process', [endpoint, 'worker-b', join(root, 'worker-b'), 'authority'])
    children.push(first.process, second.process)
    await Promise.all([message(first.process, 'authority-ready'), message(second.process, 'authority-ready')])
    async function request(child: ChildProcess, type: string, ttlMs?: number) {
      const result = message(child, type)
      child.send({ type, ttlMs })
      return result
    }
    expect((await request(first.process, 'claim', 3000))['status']).toBe('acquired')
    expect((await request(second.process, 'claim', 5000))['status']).toBe('contended')
    await new Promise(resolve => setTimeout(resolve, 3200))
    expect((await request(second.process, 'claim', 5000))['status']).toBe('acquired')
    expect((await request(first.process, 'commit'))['status']).toBe('stale-lease')
    expect((await request(first.process, 'publish'))['status']).toBe('denied')
    expect((await request(second.process, 'commit'))['status']).toBe('committed')
    await old.close(); await next.close()
  } finally { for (const child of children.reverse()) await kill(child); await rm(root, { recursive: true, force: true }) }
}, 30_000)
