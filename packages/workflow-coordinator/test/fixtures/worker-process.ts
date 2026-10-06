// Host launched test worker, with credentials explicitly supplied by the test.
import { mkdir, appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createWorkflowWorker } from '@brambodev/workflow-coordinator'
import { createRemoteRunStore, createRemoteArtifactProvider } from '@brambodev/workflow-remote'
import { createDriverRegistry, createWorkflowRegistry, runDurableWorkflow } from '@brambodev/orchestration'
import { createLocalExecutionRuntime } from '@brambodev/runtime-local'
const [endpoint, subject, root, pause] = process.argv.slice(2) as [string, string, string, string]
if (!/^http:\/\/127\.0\.0\.1:\d+\/v1\/workflow$/.test(endpoint) || !['worker-a', 'worker-b'].includes(subject)) throw new Error('test boundary')
const remote = { endpoint, fetch, authorizeRequest: async () => ({ authorization: 'synthetic-' + subject }) }
const store = createRemoteRunStore(remote), artifacts = createRemoteArtifactProvider(remote)
if (pause === 'authority') {
  let lease: import('@brambodev/contracts').Lease | undefined
  await new Promise<void>(resolve => {
    process.on('message', message => {
      const input = message as { type: string; ttlMs?: number }
      void (async () => {
        if (input.type === 'claim') {
          const result = await store.claim('tenant', ['run:run', 'workspace:parent'], subject, input.ttlMs!)
          if (result.status === 'acquired') lease = result.lease
          process.send?.({ type: 'claim', status: result.status })
        } else if (input.type === 'commit' || input.type === 'publish') {
          const snapshot = await store.get({ namespace: 'tenant', runId: 'run' })
          if (!snapshot || !lease) throw new Error('missing test authority')
          if (input.type === 'commit') {
            const result = await store.commit({ snapshot: { ...snapshot, revision: snapshot.revision + 1 }, expectedRevision: snapshot.revision, lease, events: [] })
            process.send?.({ type: 'commit', status: result.status })
          } else {
            try { await artifacts.publish(snapshot.workspace, await artifacts.manifest(snapshot.workspace), lease); process.send?.({ type: 'publish', status: 'published' }) }
            catch { process.send?.({ type: 'publish', status: 'denied' }) }
          }
        } else if (input.type === 'close') resolve()
      })().catch(error => { console.error(error); process.send?.({ type: input.type, status: 'error' }) })
    })
    process.send?.({ type: 'authority-ready' })
  })
  await store.close(); process.disconnect?.()
} else {
await mkdir(root, { recursive: true })
const runtime = createLocalExecutionRuntime({ rootDir: root, store, artifacts, ttlMs: 3000, renewalMs: 500 })
const definitions = createWorkflowRegistry()
definitions.register({ id: 'flow', version: '1', tasks: ['a', 'b'].map(id => ({ id, dependsOn: id === 'b' ? ['a'] : [],
  driverId: 'custom', configuration: null, prompt: id, required: [], optional: [], maxAttempts: 2 })) })
const drivers = createDriverRegistry()
const manifest = { id: 'custom', version: '1', kind: 'custom' as const, capabilities: ['context-reconstruction'],
  configurationSchema: { '~standard': { version: 1 as const, vendor: 'fixture', validate: (value: unknown) => ({ value }) } } }
drivers.register({ manifest, async create(_configuration, services) { return { manifest, async run(request) {
  await services.dispatchTool({ id: request.taskId + '-call', toolId: 'custom-tool', arguments: { taskId: request.taskId } }, request.signal)
  if (request.taskId === 'b' && pause === 'pause') {
    process.send?.({ type: 'paused' })
    await new Promise<void>(resolve => request.signal.addEventListener('abort', () => resolve(), { once: true }))
    return { result: { status: 'cancelled', data: null, summary: 'stopped', errors: [{ message: 'stopped' }] } }
  }
  return { result: { status: 'ok', data: request.taskId, summary: 'completed' } }
} } } })
const worker = createWorkflowWorker({ workerId: subject, principal: { namespace: 'tenant', subject }, store, artifacts, runtime,
  runtimeForTask: context => createLocalExecutionRuntime({ rootDir: root, store: context.store, artifacts, ttlMs: 3000, renewalMs: 500 }),
  definitions, drivers, execute: runDurableWorkflow, leaseTtlMs: 3000, renewalMs: 500,
  services: { resolveSecret: async () => { throw new Error('no secrets') },
    authorizeReplay: async (call, signal, context) => !signal.aborted && call.toolId === 'custom-tool' &&
      context.actor.namespace === 'tenant' && ['alice', 'bob'].includes(context.actor.subject) &&
      context.key.namespace === 'tenant' && context.key.runId === 'run' && context.workspace.namespace === 'tenant',
    dispatchTool: async (call, signal) => {
    if (signal.aborted || call.toolId !== 'custom-tool') throw new Error('denied')
    await appendFile(join(root, '..', 'tool-calls.log'), String(call.arguments['taskId']) + '\n')
    await new Promise(resolve => setTimeout(resolve, 700))
    return { ok: true }
  } } })
process.on('message', message => { if ((message as { type: string }).type === 'stop') void worker.stop() })
try { const worked = await worker.runOnce(new AbortController().signal); process.send?.({ type: 'done', worked }) }
catch (error) { console.error(error); process.send?.({ type: 'failed' }) }
finally { await worker.stop(); await store.close(); process.disconnect?.() }
}
