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
    const listener = (value: Record<string, unknown>) => {
      if (value['type'] === type) cleanup(undefined, value)
      else if (value['type'] === 'done' || value['type'] === 'failed') {
        cleanup(new WorkerObservationError({ expected: type, kind: 'terminal', packet: value['type'],
          worked: typeof value['worked'] === 'boolean' ? value['worked'] : null }))
      }
    }
    const exit = (exitCode: number | null, signal: NodeJS.Signals | null) =>
      cleanup(new WorkerObservationError({ expected: type, kind: 'exit', exitCode, signal }))
    function cleanup(error?: Error, value?: Record<string, unknown>) {
      clearTimeout(timer); child.off('message', listener); child.off('exit', exit)
      if (error) reject(error); else resolve(value!)
    }
    child.on('message', listener); child.once('exit', exit)
  })
}
class WorkerObservationError extends Error {
  constructor(readonly diagnostic: Record<string, unknown>) {
    super('worker observation: ' + JSON.stringify(diagnostic))
  }
}
async function kill(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = once(child, 'exit')
  child.kill('SIGKILL'); await exited
}

test.each([
  { packet: { type: 'done', worked: false }, expected: { kind: 'terminal', packet: 'done', worked: false } },
  { packet: { type: 'failed', message: 'PRIVATE_SYNTHETIC_PACKET' }, expected: { kind: 'terminal', packet: 'failed', worked: null } },
])('worker observation retains $packet.type before the requested pause', async ({ packet, expected }) => {
  const child = fork('', [], { execArgv: ['--eval', `process.send(${JSON.stringify(packet)}, () => process.disconnect())`],
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  try {
    const error = await message(child, 'paused').catch((error: unknown) => error)
    expect(error).toMatchObject({ diagnostic: { expected: 'paused', ...expected } })
    expect(String(error)).not.toContain('PRIVATE_SYNTHETIC_PACKET')
  } finally { await kill(child) }
})

test('worker observation retains an early native exit code', async () => {
  const child = fork('', [], { execArgv: ['--eval', 'process.exit(23)'], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  try {
    await expect(message(child, 'paused')).rejects.toMatchObject({ diagnostic: {
      expected: 'paused', kind: 'exit', exitCode: 23, signal: null,
    } })
  } finally { await kill(child) }
})

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
    try { await message(first.process, 'paused') } catch (error) {
      let snapshotUnavailable = false
      const observed = await b.get(snapshot.key).catch(() => { snapshotUnavailable = true; return null })
      const state = { snapshotUnavailable, status: observed?.status ?? null, tasks: observed?.tasks.map(task => ({
        phase: task.phase, attempt: task.attempt, code: task.error?.code ?? null,
      })) ?? null }
      const nativeCodes = [...new Set(first.errors().match(/\bERR_[A-Z0-9_]+\b/g) ?? [])].slice(0,8)
      throw new Error(String(error) + '; worker state: ' + JSON.stringify({ ...state, nativeCodes }), { cause: error })
    }
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
