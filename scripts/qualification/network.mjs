import { createServer } from 'node:http'
import { mkdir, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'


// Only code-owned labels and fixed primitive enums survive qualification diagnostics.
export function projectQualificationFailure(error, exchange = null) {
  const own = (value, key) => {
    const descriptor = value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, key) : undefined
    return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined
  }
  const result = { kind: 'unknown', code: null, name: null, label: null }
  try {
    const code = own(error, 'code'), name = own(error, 'name'), message = own(error, 'message')
    if (['EACCES','EPERM','ENOENT','EROFS','ECONNREFUSED','ECONNRESET','ENETUNREACH','ETIMEDOUT','ERR_ASSERTION'].includes(code)) {
      result.code = code
      result.kind = code === 'ERR_ASSERTION' ? 'assertion' : ['EACCES','EPERM'].includes(code) ? 'permission' :
        ['ENOENT','EROFS'].includes(code) ? 'filesystem' : 'transport'
    }
    if (code === 'BRAMBO_CONTRACT_LEASE_SCOPE_INVALID' || code === 'BRAMBO_CONTRACT_WORKFLOW_PROTOCOL_INVALID') {
      result.code = code; result.kind = code === 'BRAMBO_CONTRACT_LEASE_SCOPE_INVALID' ? 'permission' : 'protocol'
    }
    if (['Error','TypeError','SyntaxError','AssertionError','AbortError'].includes(name)) result.name = name
    const labels = {
      'Remote workflow unavailable': 'unavailable', 'Invalid remote workflow response': 'protocol',
      'Invalid remote artifact': 'protocol', 'Remote workflow aborted': 'deadline', 'Invalid remote endpoint': 'configuration',
      'checkpoint': 'assertion', 'checkpoint-boundary': 'assertion', 'contention': 'assertion',
      'worker-outcome': 'assertion', 'worker-exit': 'worker-exit', 'packet-invalid': 'protocol',
      'lease-expiry': 'deadline', 'deadline': 'deadline', 'gate-deadline': 'deadline',
      'build-failed': 'command', 'command-failed': 'command', 'cleanup-unverified': 'cleanup',
      'containment': 'containment', 'resource-collision': 'ownership', 'image-inspect-invalid': 'configuration',
      'listener-input': 'configuration', 'worker-input': 'configuration', 'opt-in': 'configuration',
      'result-unavailable': 'assertion',
    }
    if (typeof message === 'string' && message.length <= 128 && Buffer.byteLength(message) <= 128 && Object.hasOwn(labels, message)) {
      result.label = message; result.kind = labels[message]
    }
    if (own(exchange, 'typedDenied') === true) result.kind = 'permission'
    else if (own(exchange, 'transportFailure') === true && result.label === 'Remote workflow unavailable') result.kind = 'transport'
  } catch { return { kind: 'unknown', code: null, name: null, label: null } }
  return result
}

export function remoteOptions(endpoint, subject, transport = fetch) {
  return { endpoint, fetch: transport, authorizeRequest: async () => ({ authorization: 'synthetic-' + subject }) }
}
export async function startAuthority(root, host = '127.0.0.1', port = 0) {
  const { createWorkflowCoordinator } = await import('@brambodev/workflow-coordinator')
  const { openSqliteRunStore } = await import('@brambodev/workflow-store-sqlite')
  const { createLocalArtifactProvider } = await import('@brambodev/workspace-artifacts-local')
  await mkdir(root, { recursive: true })
  const store = await openSqliteRunStore({ path: join(root, 'run.sqlite') })
  const artifacts = createLocalArtifactProvider({ rootDir: join(root, 'artifacts'), store })
  const source = join(root, 'source'); await mkdir(source)
  await writeFile(join(source, 'marker.txt'), 'synthetic-base\n')
  const staged = await artifacts.stage('tenant', source)
  const boot = await store.claim('tenant', ['workspace:parent'], 'bootstrap', 10000)
  if (boot.status !== 'acquired') throw Error('bootstrap')
  const workspace = { namespace: 'tenant', workspaceId: 'parent', revision: staged.revision }
  await artifacts.publish(workspace, staged, boot.lease); await store.release(boot.lease)
  const principals = new Map(['alice', 'worker-a', 'worker-b'].map(subject =>
    ['synthetic-' + subject, { namespace: 'tenant', subject }]))
  const issued = new Map()
  const capabilityKey = lease => JSON.stringify([lease.namespace, lease.ownerId,
    Object.entries(lease.epochs).sort(([a], [b]) => a.localeCompare(b))])
  const remember = result => {
    if (result.status === 'acquired') issued.set(capabilityKey(result.lease), structuredClone(result.lease))
    return result
  }
  const trackedStore = new Proxy(store, { get(target, property) {
    if (property === 'claim' || property === 'renew') return async (...args) => remember(await target[property](...args))
    const value = Reflect.get(target, property, target)
    return typeof value === 'function' ? value.bind(target) : value
  } })
  let publicationAttempts = 0
  const authority = createWorkflowCoordinator({ store: trackedStore, artifacts: { ...artifacts, publish: (...args) => {
    publicationAttempts++
    return artifacts.publish(...args)
  } },
    authenticate: async request => principals.get(request.headers.authorization),
    // Application policy: the default server reports backend stale exceptions as unavailable.
    // Retain only genuinely issued public capabilities and deny expired publication before the backend.
    authorize: async (principal, operation, resource) => {
      if (operation !== 'artifact.publish') return true
      const lease = issued.get(capabilityKey(resource.lease))
      return Boolean(lease && lease.namespace === principal.namespace && lease.ownerId === principal.subject &&
        resource.ref.namespace === principal.namespace && Object.hasOwn(lease.epochs, 'workspace:' + resource.ref.workspaceId) &&
        await store.valid(lease))
    },
    workerAllowed: async principal => ['worker-a', 'worker-b'].includes(principal.subject) })
  const server = createServer(authority.handler)
  await new Promise(resolve => server.listen(port, host, resolve))
  return { workspace, publicationAttempts: () => publicationAttempts,
    endpoint: 'http://' + (host === '0.0.0.0' ? 'coordinator' : host) + ':' + server.address().port + '/v1/workflow',
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await store.close() } }
}
export async function runWorker({ root, endpoint, subject, report, mode }) {
  if (!['worker-a', 'worker-b'].includes(subject) || !['checkpoint', 'run', 'revoked'].includes(mode)) throw Error('worker-input')
  const { createWorkflowWorker } = await import('@brambodev/workflow-coordinator')
  const { createRemoteRunStore, createRemoteArtifactProvider } = await import('@brambodev/workflow-remote')
  const { createDriverRegistry, createWorkflowRegistry, runDurableWorkflow } = await import('@brambodev/orchestration')
  const { createLocalExecutionRuntime } = await import('@brambodev/runtime-local')
  const store = createRemoteRunStore(remoteOptions(endpoint, subject))
  const artifacts = createRemoteArtifactProvider(remoteOptions(endpoint, subject))
  const definitions = createWorkflowRegistry(), drivers = createDriverRegistry(), calls = { a: 0, b: 0 }
  definitions.register({ id: 'network-flow', version: '1', tasks: ['a', 'b'].map(id => ({ id,
    dependsOn: id === 'a' ? [] : ['a'], driverId: 'synthetic', configuration: null, prompt: id,
    required: [], optional: [], maxAttempts: 1 })) })
  const manifest = { id: 'synthetic', version: '1', kind: 'custom', capabilities: ['context-reconstruction'],
    configurationSchema: { '~standard': { version: 1, vendor: 'qualification', validate: value => ({ value }) } } }
  drivers.register({ manifest, async create() { return { manifest, async run(request) {
    calls[request.taskId]++
    await writeFile(join(request.workspace.rootPath, request.taskId + '.txt'), 'synthetic-' + request.taskId + '\n')
    return { result: { status: 'ok', data: null, summary: 'completed' } }
  } } } })
  const runtime = context => createLocalExecutionRuntime({ rootDir: root, store: context?.store ?? store, artifacts,
    ttlMs: 3000, renewalMs: 500 })
  const worker = createWorkflowWorker({ workerId: subject, principal: { namespace: 'tenant', subject }, store, artifacts,
    definitions, drivers, runtime: runtime(), runtimeForTask: runtime, leaseTtlMs: 3000, renewalMs: 500,
    execute: options => runDurableWorkflow({ ...options, prepareTask: async context => {
      if (mode === 'checkpoint' && context.taskId === 'b') {
        report({ type: 'checkpoint', calls: { ...calls }, lease: await options.currentParentLease() })
        await new Promise(() => {})
      }
      return options.prepareTask(context)
    } }),
    services: { authorizeReconstruction: async (_context, signal, provenance) => mode !== 'revoked' && !signal.aborted &&
      provenance.actor.namespace === 'tenant' && provenance.actor.subject === 'alice' &&
      provenance.key.namespace === 'tenant' && provenance.key.runId === 'run', authorizeReplay: async () => false,
      resolveSecret: async () => { throw Error('denied') }, dispatchTool: async () => { throw Error('denied') } } })
  let failure, failedPhase = 'worker-run'
  try { await worker.runOnce(new AbortController().signal) }
  catch (error) { failure = projectQualificationFailure(error) }
  finally {
    for (const close of [() => worker.stop(), () => store.close()]) {
      try { await close() } catch (error) { if (!failure) { failedPhase = 'worker-close'; failure = projectQualificationFailure(error) } }
    }
  }
  report(failure ? { type: 'failed', failedPhase, failure, calls } : { type: 'done', calls })
  return !failure
}
let mainPhase = 'startup'
const emit = packet => process.send ? process.send(packet) : console.log(JSON.stringify(packet))
async function main() {
  const [role, root, endpoint, subject, mode, gate] = process.argv.slice(2)
  const report = emit
  if (role === '--coordinator') {
    mainPhase = 'coordinator-setup'
    const host = endpoint ?? '127.0.0.1', port = Number(subject ?? 0)
    if (!['127.0.0.1', '0.0.0.0'].includes(host) || !Number.isSafeInteger(port) || port < 0 || port > 65535) throw Error('listener-input')
    const authority = await startAuthority(root, host, port)
    report({ type: 'ready', endpoint: authority.endpoint, workspace: authority.workspace })
    process.on('message', message => { if (message?.type === 'close') void authority.close().then(() => process.disconnect()) })
  } else if (role === '--worker') {
    mainPhase = 'worker-setup'
    if (gate !== undefined && gate !== '--wait') throw Error('worker-input')
    if (gate === '--wait') {
      const end = performance.now() + 30000
      while (!await access(join(root, 'start')).then(() => true, () => false)) {
        if (performance.now() >= end) throw Error('gate-deadline')
        await new Promise(resolve => setTimeout(resolve, 25))
      }
    }
    if (!await runWorker({ root, endpoint, subject, mode, report })) process.exitCode = 1
    process.disconnect?.()
  } else throw Error('opt-in')
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => {
  emit({ type: 'failed', failedPhase: mainPhase, failure: projectQualificationFailure(error), calls: { a: null, b: null } })
  process.exitCode = 1
})
