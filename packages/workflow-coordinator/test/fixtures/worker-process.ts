// Host launched test worker, with credentials explicitly supplied by the test.
import { appendFileSync } from 'node:fs'
import { mkdir, appendFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createWorkflowWorker } from '@brambodev/workflow-coordinator'
import { createRemoteRunStore, createRemoteArtifactProvider } from '@brambodev/workflow-remote'
import { createDriverRegistry, createWorkflowRegistry, runDurableWorkflow, createCliDriverFactory } from '@brambodev/orchestration'
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
const cliMode = ['cli-checkpoint', 'cli-run', 'cli-revoked', 'cli-malformed'].includes(pause)
definitions.register({ id: 'flow', version: '1', tasks: (cliMode ? ['a', 'b', 'c'] : ['a', 'b']).map(id => ({ id, dependsOn: id === 'a' ? [] : [id === 'b' ? 'a' : 'b'],
  driverId: cliMode ? ({ a: 'opencode', b: 'claude-code', c: 'codex' } as Record<string, string>)[id]! : 'custom', configuration: cliMode ? {} : null, prompt: id, required: [], optional: [], maxAttempts: cliMode ? 1 : 2 })) })
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

if (cliMode) {
  // Workspace fixture reuse only: session already declares this dependency.
  // Resolve the PUBLIC package root under brambo-source, not a private source path.
  // This is not guidance for a published consumer's dependency declaration.
  const { createRequire } = await import('node:module')
  const publicEntry = createRequire(new URL('../../../session/package.json', import.meta.url))
    .resolve('@brambodev/adapter-cli')
  type SpawnOptions = { cwd: string; onStdoutLine?: (line: string) => void }
  type Spawner = { spawn(command: string, args: readonly string[], options: SpawnOptions): {
    pid: undefined; readonly settled: boolean; writeStdin(value: string): void; endStdin(): void
    killTree(): void; done: Promise<{ exitCode: number | null; stdout: string; stderr: string }>
  } }
  type Factory = (options: { spawner: Spawner; inheritEnv: readonly string[] }) => import('@brambodev/contracts').ExecutorAdapter
  const adapters = await import(pathToFileURL(publicEntry).href) as {
    createOpenCodeAdapter: Factory; createClaudeCodeAdapter: Factory; createCodexAdapter: Factory
  }
  const factories = [adapters.createOpenCodeAdapter, adapters.createClaudeCodeAdapter, adapters.createCodexAdapter]
  const ids = ['opencode', 'claude-code', 'codex'] as const
  for (const [index, id] of ids.entries()) {
    const spawner: Spawner = { spawn(command, args, options) {
      appendFileSync(join(root, '..', 'cli-calls.log'), id + '\n')
      if (command !== (id === 'claude-code' ? 'claude' : id)) throw new Error('unexpected fixture command')
      let input = '', settled = false
      let resolve!: (outcome: { exitCode: number | null; stdout: string; stderr: string }) => void
      const done = new Promise<{ exitCode: number | null; stdout: string; stderr: string }>(finish => { resolve = finish })
      async function complete(prompt: string) {
        try {
          const marker = '\n\nCurrent task:\n'
          const context = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1, prompt.lastIndexOf(marker))) as {
            snapshot: { tasks: { taskId: string; phase: string }[] }
          }
          if (index > 0 && context.snapshot.tasks[0]?.phase !== 'succeeded') throw new Error('missing completed context')
          await writeFile(join(options.cwd, id + '.txt'), 'synthetic-' + id + '-artifact\n')
          const event = id === 'opencode' ? { type: 'text', part: { type: 'text', text: 'synthetic-' + id } } :
            id === 'claude-code' ? { type: 'result', subtype: 'success', is_error: false, result: 'synthetic-' + id } :
              { type: 'item.completed', item: { type: 'agent_message', text: 'synthetic-' + id } }
          const stdout = JSON.stringify(event) + '\n'
          options.onStdoutLine?.(stdout.trim())
          settled = true; resolve({ exitCode: 0, stdout, stderr: '' })
        } catch { settled = true; resolve({ exitCode: 1, stdout: '', stderr: 'synthetic fixture refusal' }) }
      }
      if (id === 'opencode') void complete(args.at(-1)!)
      return { pid: undefined, get settled() { return settled }, done,
        writeStdin(value) { input += value }, endStdin() { if (id !== 'opencode') void complete(input) },
        killTree() { settled = true; resolve({ exitCode: null, stdout: '', stderr: '' }) } }
    } }
    const factory = createCliDriverFactory({ id, createAdapter: () => factories[index]!({ spawner, inheritEnv: [] }) })
    // Sensitivity input: a dispatched stage with unusable reconstructed context must remain counted.
    drivers.register(pause === 'cli-malformed' && index === 1 ? { ...factory,
      async create(configuration, services) {
        const driver = await factory.create(configuration, services)
        return { ...driver, run: request => driver.run({ ...request, context: null }) }
      },
    } : factory)
  }
}

const worker = createWorkflowWorker({ workerId: subject, principal: { namespace: 'tenant', subject }, store, artifacts, runtime,
  runtimeForTask: context => createLocalExecutionRuntime({ rootDir: root, store: context.store, artifacts, ttlMs: 3000, renewalMs: 500 }),
  definitions, drivers, execute: options => runDurableWorkflow({ ...options,
    prepareTask: async context => {
      if (pause === 'cli-checkpoint' && context.taskId === 'b') {
        process.send?.({ type: 'checkpoint', lease: await options.currentParentLease?.() ?? options.lease })
        await new Promise<void>(() => {})
      }
      return options.prepareTask(context)
    },
  }), leaseTtlMs: 3000, renewalMs: 500,
  services: { resolveSecret: async () => { throw new Error('no secrets') },
    authorizeReconstruction: async (_context, signal, provenance) => !signal.aborted &&
      pause !== 'cli-revoked' && provenance.actor.namespace === 'tenant' && ['alice', 'bob'].includes(provenance.actor.subject) &&
      provenance.key.namespace === 'tenant' && provenance.key.runId === 'run',
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
