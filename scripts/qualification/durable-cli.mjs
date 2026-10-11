import { access, mkdir, mkdtemp, open, opendir, realpath, rm, writeFile } from 'node:fs/promises'
import { fork, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isAbsolute, join, relative, sep } from 'node:path'

// Names only: the SDK spawner copies these selectors at the process boundary.
const profileNames = Object.freeze(['PATH', 'PATHEXT', 'SystemRoot', 'SystemDrive', 'ComSpec', 'WINDIR',
  'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'CODEX_HOME', 'CLAUDE_CONFIG_DIR',
  'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'TEMP', 'TMP', 'TMPDIR',
  'LANG', 'LC_ALL', 'LC_CTYPE'])
const stages = { opencode: 'a', 'claude-code': 'b', codex: 'c' }
const preceding = { a: null, b: 'a', c: 'b' }
const models = { opencode: 'opencode-go/deepseek-v4-flash',
  'claude-code': 'claude-haiku-4-5-20251001', codex: 'gpt-5.6-luna' }
const claudeSubtypes = Object.freeze(['error_max_turns', 'error_during_execution', 'error_max_budget_usd',
  'error_max_structured_output_retries', 'success'])

const claudeFailures = Object.freeze(['rate-limit', 'quota', 'model-access', 'auth', 'max-turns', 'permission', 'unknown'])
function ownValue(object, key) {
  if (object === undefined) return undefined
  if (object === null || typeof object !== 'object') throw Error('diagnostic-shape')
  const descriptor = Object.getOwnPropertyDescriptor(object, key)
  if (descriptor && !Object.hasOwn(descriptor, 'value')) throw Error('diagnostic-accessor')
  return descriptor?.value
}
function claudeFailure(result) {
  try {
    if (ownValue(result, 'status') !== 'failed') return 'unknown'
    const data = ownValue(result, 'data'), subtype = ownValue(data, 'subtype')
    const raw = ownValue(data, 'result'), error = ownValue(ownValue(result, 'errors'), '0')
    const message = ownValue(error, 'message')
    const sources = [raw, message].filter(value => value !== undefined)
    if (sources.some(value => typeof value !== 'string' || value.length > 4096) ||
        sources.reduce((bytes, value) => bytes + Buffer.byteLength(value, 'utf8'), 0) > 4096) return 'unknown'
    let detail = message?.trim()
    if (detail !== undefined) {
      if (ownValue(error, 'code') !== 'BRAMBO_EXECUTOR_RUN_FAILED') return 'unknown'
      // This complete prefix is SDK-owned in traits.ts #failedFromRecord for command claude.
      if (subtype !== undefined && !claudeSubtypes.includes(subtype)) return 'unknown'
      const prefix = "executor 'claude' reported failure" + (subtype === undefined ? '' : ' (' + subtype + ')')
      if (detail === prefix) detail = ''
      else if (detail.startsWith(prefix + ': ')) detail = detail.slice(prefix.length + 2).trim()
      else return 'unknown'
    }
    const text = raw?.trim()
    if (text !== undefined && detail !== undefined && text !== detail) return 'unknown'
    // Exact historical Claude observations only; unsupported native signatures stay unknown.
    const category = value => value === 'Not logged in · Please run /login' || value === 'invalid api key' ? 'auth' :
      value === "You've hit your weekly limit · resets 3pm (America/Mexico_City)" ? 'quota' : 'unknown'
    const observed = category(text ?? detail)
    if (subtype === 'error_max_turns') return observed === 'unknown' ? 'max-turns' : 'unknown'
    return observed
  } catch { return 'unknown' }
}
const permission = { '*': 'deny', edit: 'deny', write: 'deny', bash: 'deny', external_directory: 'deny',
  task: 'deny', webfetch: 'deny', websearch: 'deny' }
function marker(raw, stage, nonce) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 4096) throw Error('marker-shape')
  const value = JSON.parse(raw)
  if (!value || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'nonce,previous,stage,verdict' ||
      value.stage !== stage || value.nonce !== nonce || value.previous !== preceding[stage] || value.verdict !== 'ok') {
    throw Error('marker-shape')
  }
  return { stage, nonce, previous: preceding[stage], verdict: 'ok' }
}
async function validateMarkerWorkspace(directory, stage, nonce) {
  const dir = await opendir(directory, { bufferSize: 4 })
  let count = 0
  for await (const entry of dir) {
    if (++count > 3 || !entry.isFile() || !/^stage-[abc]\.json$/.test(entry.name)) throw Error('artifact-shape')
    const known = entry.name[6]
    if (known > stage) throw Error('artifact-shape')
    const file = await open(join(directory, entry.name), 'r')
    try {
      const info = await file.stat()
      if (!info.isFile() || info.size > 4096) throw Error('artifact-shape')
      const bytes = Buffer.alloc(4097), read = await file.read(bytes, 0, bytes.length, 0)
      const text = bytes.subarray(0, read.bytesRead).toString()
      if (text !== JSON.stringify(marker(text, known, nonce))) throw Error('artifact-shape')
    } finally { await file.close() }
  }
}
function safeFailure(status, phase) {
  return { result: { status, data: {}, summary: phase, errors: [{ code: phase, message: phase }] } }
}
export function createQualificationFactory(ports, id, root, nonce, spawner, artifacts) {
  const stage = stages[id]
  if (!stage) throw Error('driver-id')
  let diagnostic = { calls: 0, errorCode: 'unknown', ...(id === 'claude-code' ? {
    claudeSubtype: 'unknown', claudeResultStatus: 'unknown', claudeStructuredResult: false, claudeFailure: 'unknown' } : {}) }
  const failure = (status, phase) => { diagnostic.failurePhase = phase; return safeFailure(status, phase) }
  const observingSpawner = { spawn(command, args, spawnOptions) {
    diagnostic.calls++
    const child = spawner.spawn(command, args, spawnOptions)
    diagnostic.spawnStarted = Number.isSafeInteger(child.pid) && child.pid > 0
    return { get pid() { return child.pid }, get settled() { return child.settled },
      writeStdin: value => child.writeStdin(value), endStdin: () => child.endStdin(), killTree: () => child.killTree(),
      done: child.done.then(outcome => {
        // Best-effort observation is not allowed to replace original streams or settlement.
        try {
          const get = key => Object.getOwnPropertyDescriptor(outcome, key)?.value
          diagnostic = { ...diagnostic,
            exitCode: Number.isSafeInteger(get('exitCode')) && Math.abs(get('exitCode')) <= 65535 ? get('exitCode') : null,
            stdoutPresent: typeof get('stdout') === 'string' && get('stdout').length > 0,
            stderrPresent: typeof get('stderr') === 'string' && get('stderr').length > 0,
            stdoutTruncated: get('stdoutTruncated') === true, stderrTruncated: get('stderrTruncated') === true }
        } catch { /* Hostile observation metadata cannot mask the adapter result. */ }
        return outcome
      }) }
  } }
  const options = { spawner: observingSpawner, inheritEnv: profileNames, env: { OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '' },
    extraArgs: ['--model', models[id]] }
  let traits
  if (id === 'opencode') {
    options.env = { ...options.env, OPENCODE_CONFIG: join(root, 'opencode.json'),
      OPENCODE_CONFIG_DIR: join(root, 'opencode-config'),
      OPENCODE_CONFIG_CONTENT: JSON.stringify({ permission }) }
    traits = ports.cli.OPENCODE_TRAITS
  } else if (id === 'claude-code') {
    options.extraArgs.push('--safe-mode', '--max-turns', '1', '--tools', '')
    traits = { ...ports.cli.CLAUDE_CODE_TRAITS,
      args: ports.cli.CLAUDE_CODE_TRAITS.args.filter(arg => arg !== '--dangerously-skip-permissions') }
  } else {
    options.extraArgs.push('-c', 'model_reasoning_effort=low', '--ephemeral', '--ignore-user-config', '--sandbox', 'read-only')
    traits = { ...ports.cli.CODEX_TRAITS, args: ['--ask-for-approval', 'never', ...ports.cli.CODEX_TRAITS.args] }
  }
  const factory = ports.orchestration.createCliDriverFactory({
    id, createAdapter: () => ports.cli.createCliExecutorAdapter(traits, options),
  })
  return { ...factory, observation: () => ({ ...diagnostic }), async create(configuration, services) {
    const driver = await factory.create(configuration, services)
    return { ...driver, async run(request) {
      const started = performance.now()
      let phase = 'artifact-context'
      try {
        const previous = preceding[request.taskId]
        let prior = null
        if (previous !== null) {
          const completed = request.context?.snapshot?.tasks?.find(task => task.taskId === previous)
          if (completed?.phase !== 'succeeded' || !completed.workspace) return failure('failed', 'artifact-context')
          prior = marker(Buffer.from(await artifacts.read(completed.workspace, 'stage-' + previous + '.json')).toString(),
            previous, nonce)
        }
        const expected = { stage: request.taskId, nonce, previous, verdict: 'ok' }
        const prompt = 'Return ONLY this exact JSON, without files or tools: ' + JSON.stringify(expected) +
          '\nPreviously verified immutable marker: ' + JSON.stringify(prior)
        phase = 'cli-run'
        const outcome = await driver.run({ ...request, prompt })
        if (id === 'claude-code') {
          diagnostic.claudeFailure = claudeFailure(outcome.result)
          // Public SDK metadata already selects the result record; never rescan raw streams.
          try {
            const data = Object.getOwnPropertyDescriptor(outcome.result, 'data')?.value
            const subtype = data && typeof data === 'object' ? Object.getOwnPropertyDescriptor(data, 'subtype')?.value : undefined
            const status = Object.getOwnPropertyDescriptor(outcome.result, 'status')?.value
            diagnostic.claudeSubtype = claudeSubtypes.includes(subtype) ? subtype : 'unknown'
            diagnostic.claudeResultStatus = ['ok', 'failed', 'cancelled'].includes(status) ? status : 'unknown'
            diagnostic.claudeStructuredResult = typeof subtype === 'string'
          } catch { /* Optional metadata cannot mask the original SDK result. */ }
        }
        if (outcome.result.status !== 'ok') {
          try {
            const code = ownValue(ownValue(ownValue(outcome.result, 'errors'), '0'), 'code')
            if (['BRAMBO_EXECUTOR_RUN_FAILED', 'BRAMBO_EXECUTOR_UNAVAILABLE', 'BRAMBO_EXECUTOR_CANCELLED'].includes(code)) {
              diagnostic.errorCode = code
            }
          } catch { /* Optional error metadata cannot mask the original SDK status. */ }
          return failure(outcome.result.status, 'cli-failure')
        }
        let verified
        try { verified = marker(outcome.result.data?.result, request.taskId, nonce) }
        catch { return failure('failed', 'marker-shape') }
        phase = 'artifact-shape'
        await validateMarkerWorkspace(request.workspace.rootPath, request.taskId, nonce)
        phase = 'artifact-write'
        await writeFile(join(request.workspace.rootPath, 'stage-' + request.taskId + '.json'), JSON.stringify(verified))
        return { result: { status: 'ok', data: {}, summary: 'Marker verified' } }
      } catch { return failure('failed', phase) }
      finally { const elapsed = Math.round(performance.now() - started); diagnostic.elapsedMs = elapsed >= 0 && elapsed <= 300000 ? elapsed : null }
    } }
  } }
}

export async function runQualificationWorker({ ports, root, endpoint, subject, nonce, spawner, pause, revoked }) {
  const remote = { endpoint, fetch, authorizeRequest: async () => ({ authorization: 'synthetic-' + subject }) }
  const store = ports.remote.createRemoteRunStore(remote), artifacts = ports.remote.createRemoteArtifactProvider(remote)
  const definitions = ports.orchestration.createWorkflowRegistry()
  definitions.register({ id: 'flow', version: '1', tasks: ['a', 'b', 'c'].map((id, index) => ({
    id, dependsOn: index === 0 ? [] : [index === 1 ? 'a' : 'b'],
    driverId: ['opencode', 'claude-code', 'codex'][index], configuration: {}, prompt: 'Canonical marker',
    required: [], optional: [], maxAttempts: 1,
  })) })
  const drivers = ports.orchestration.createDriverRegistry()
  const factories = Object.keys(stages).map(id => createQualificationFactory(ports, id, root, nonce, spawner, artifacts))
  for (const factory of factories) drivers.register(factory)
  const runtime = context => ports.runtime.createLocalExecutionRuntime({ rootDir: root, store: context?.store ?? store,
    artifacts, ttlMs: 3000, renewalMs: 500 })
  const worker = ports.coordinator.createWorkflowWorker({ workerId: subject, principal: { namespace: 'tenant', subject },
    store, artifacts, definitions, drivers, runtime: runtime(), runtimeForTask: runtime,
    leaseTtlMs: 3000, renewalMs: 500, execute: options => ports.orchestration.runDurableWorkflow({ ...options,
      prepareTask: async context => {
        if (pause && context.taskId === 'b') {
          process.send?.({ type: 'checkpoint', lease: await options.currentParentLease(), observations: factories.map(factory => ({ stage: stages[factory.manifest.id], ...factory.observation() })) })
          await new Promise(() => {})
        }
        return options.prepareTask(context)
      },
    }),
    services: { resolveSecret: async () => { throw Error('denied') }, dispatchTool: async () => { throw Error('denied') },
      authorizeReconstruction: async (_context, signal, provenance) => !revoked && !signal.aborted &&
        provenance.actor.namespace === 'tenant' && provenance.actor.subject === 'alice' &&
        provenance.key.namespace === 'tenant' && provenance.key.runId === 'run',
      authorizeReplay: async () => false },
  })
  const controller = new AbortController()
  const abort = message => { if (message?.type === 'abort') controller.abort() }
  process.on('message', abort)
  try {
    await worker.runOnce(controller.signal)
    process.send?.({ type: 'done', observations: factories.map(factory => ({
      stage: stages[factory.manifest.id], ...factory.observation(),
    })) })
  }
  catch { process.send?.({ type: 'failed' }) }
  finally { process.off('message', abort); await worker.stop(); await store.close() }
}

export async function checkStartup({ args, execArgv, exists }) {
  if (args.length !== 1 || args[0] !== '--live') return { allowed: false, reason: 'opt-in' }
  if (!execArgv.some(arg => arg === '--conditions=brambo-source' || arg === '-Cbrambo-source')) {
    return { allowed: false, reason: 'source-condition' }
  }
  try {
    if (await exists('C:\\ProgramData\\opencode')) return { allowed: false, reason: 'managed-config' }
  } catch { return { allowed: false, reason: 'preflight-unavailable' } }
  return { allowed: true }
}

export async function loadQualificationPorts() {
  const owner = createRequire(new URL('../../packages/workflow-coordinator/package.json', import.meta.url))
  const session = createRequire(new URL('../../packages/session/package.json', import.meta.url))
  // Workspace qualification reuses existing manifest-declared devdependencies.
  // Consumers must declare their own dependencies; never import private package paths.
  const load = (name, resolver = owner) => import(pathToFileURL(resolver.resolve('@brambodev/' + name)).href)
  return { cli: await load('adapter-cli', session), orchestration: await load('orchestration'),
    sqlite: await load('workflow-store-sqlite'), artifacts: await load('workspace-artifacts-local'),
    runtime: await load('runtime-local'), remote: await load('workflow-remote'),
    coordinator: await load('workflow-coordinator') }
}
function launchWorker(file, args, env, signal) {
  const child = fork(file, args, { execArgv: ['--conditions=brambo-source'], env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true })
  // Never emit native output or exception strings.
  child.stdout.resume(); child.stderr.resume()
  const packets = []
  child.on('message', packet => packets.push(packet))
  return { child, async receive() {
    while (!signal.aborted) {
      if (packets.length) return packets.shift()
      if (child.exitCode !== null || child.signalCode !== null) throw Error('worker-exit')
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    throw Error('deadline')
  } }
}
function waitForExit(child, milliseconds) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true)
  return new Promise(resolve => {
    const finish = settled => {
      clearTimeout(timer); child.off('exit', exited); child.off('error', failed); resolve(settled)
    }
    const exited = () => finish(true), failed = () => finish(false)
    const timer = setTimeout(() => finish(false), milliseconds)
    child.once('exit', exited); child.once('error', failed)
  })
}
function nativeTreeKiller(child) {
  if (process.platform !== 'win32') return null
  return spawn('C:\\Windows\\System32\\taskkill.exe', ['/pid', String(child.pid), '/t', '/f'],
    { windowsHide: true, stdio: 'ignore', env: { SystemRoot: 'C:\\Windows' } })
}
async function terminateWorker(child, startTreeKill = nativeTreeKiller) {
  if (child.exitCode !== null || child.signalCode !== null) return true
  try { child.send({ type: 'abort' }, () => {}) } catch { /* Still require confirmed tree settlement. */ }
  if (await waitForExit(child, 1000)) return true
  let killer
  try { killer = startTreeKill(child) } catch { return false }
  if (!killer) return false
  if (!await waitForExit(killer, 2000)) {
    // This is the owned trusted command helper, never a provider parent-only fallback.
    try { killer.kill('SIGKILL') } catch { killer.unref(); return false }
    if (!await waitForExit(killer, 1000)) killer.unref()
    return false
  }
  if (killer.exitCode !== 0) return false
  return waitForExit(child, 2000)
}
function detachUnverified(child) {
  child.stdout?.destroy(); child.stderr?.destroy()
  try { if (child.connected) child.disconnect() } catch { /* Unverified, never a successful cleanup. */ }
  child.unref()
}

async function removeOwned(root) {
  const actual = await realpath(root), boundary = await realpath(tmpdir()), rel = relative(boundary, actual)
  if (isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep) || !rel.startsWith('brambo-durable-')) {
    throw Error('cleanup-scope')
  }
  await rm(actual, { recursive: true, force: true })
}
const phases = ['pending', 'running', 'succeeded', 'failed', 'cancelled', 'blocked', 'uncertain']
function taskProjection(snapshot) {
  return snapshot.tasks.map(task => ({ stage: ['a', 'b', 'c'].includes(task.taskId) ? task.taskId : 'unknown',
    phase: phases.includes(task.phase) ? task.phase : 'unknown',
    attempt: Number.isSafeInteger(task.attempt) && task.attempt >= 0 && task.attempt <= 1 ? task.attempt : null }))
}
export async function runQualification({ ports, workerFile, workerArgs = [], env, nonce, variant = 'valid', startTreeKill, signal: callerSignal }) {
  const root = await mkdtemp(join(tmpdir(), 'brambo-durable-')), children = []
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 300000)
  const signal = callerSignal ? AbortSignal.any([controller.signal, callerSignal]) : controller.signal
  let store, server, proof, failure
  try {
    if (signal.aborted) throw Error('deadline')
    store = await ports.sqlite.openSqliteRunStore({ path: join(root, 'run.sqlite') })
    const artifacts = ports.artifacts.createLocalArtifactProvider({ rootDir: join(root, 'artifacts'), store })
    const source = join(root, 'source'); await mkdir(source)
    const staged = await artifacts.stage('tenant', source)
    const boot = await store.claim('tenant', ['workspace:parent'], 'bootstrap', 10000)
    const workspace = { namespace: 'tenant', workspaceId: 'parent', revision: staged.revision }
    await artifacts.publish(workspace, staged, boot.lease); await store.release(boot.lease)
    const principals = new Map(['alice', 'worker-a', 'worker-b'].map(subject =>
      ['synthetic-' + subject, { namespace: 'tenant', subject }]))
    const authority = ports.coordinator.createWorkflowCoordinator({ store, artifacts,
      authenticate: async request => principals.get(request.headers.authorization),
      authorize: async () => true, workerAllowed: async principal => ['worker-a', 'worker-b'].includes(principal.subject) })
    server = createServer(authority.handler)
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const endpoint = 'http://127.0.0.1:' + server.address().port + '/v1/workflow'
    const key = { namespace: 'tenant', runId: 'run' }
    const client = ports.remote.createRemoteRunStore({ endpoint, fetch,
      authorizeRequest: async () => ({ authorization: 'synthetic-alice' }) })
    await client.create({ schemaVersion: 1, key, revision: 0, workflowId: 'flow', workflowVersion: '1',
      sessionId: 'session', status: 'pending', workspace, tasks: [], context: null, cancelRequested: false },
    { key, clientId: 'a', idempotencyKey: 'start', kind: 'start', payload: null }, { namespace: 'tenant', subject: 'alice' })
    for (const subject of ['worker-a', 'worker-b']) {
      await mkdir(join(root, subject, 'opencode-config'), { recursive: true })
      await writeFile(join(root, subject, 'opencode.json'), JSON.stringify({ permission }))
    }
    const first = launchWorker(workerFile, [...workerArgs, '--worker', join(root, 'worker-a'), endpoint,
      'worker-a', 'pause', 'valid', nonce], env, signal)
    children.push(first.child)
    const checkpoint = await first.receive(), before = await client.get(key)
    if (checkpoint.type !== 'checkpoint') {
      proof = { status: before.status, before: taskProjection(before), stages: taskProjection(before),
        checkpoint: false, observations: firstPacketObservations(checkpoint), reason: 'checkpoint-not-reached' }
      return proof
    }
    if (JSON.stringify(taskProjection(before)) !== JSON.stringify([
      { stage: 'a', phase: 'succeeded', attempt: 1 }, { stage: 'b', phase: 'pending', attempt: 0 },
      { stage: 'c', phase: 'pending', attempt: 0 }])) throw Error('checkpoint-boundary')
    const completed = structuredClone(before.tasks[0])
    // At this exact verified boundary there is no admitted CLI; termination is
    // deliberately abrupt, not cooperative worker.stop recovery.
    const checkpointExit = waitForExit(first.child, 2000)
    if (!first.child.kill('SIGKILL') || !await checkpointExit) throw Error('checkpoint-termination')
    const expiryDeadline = performance.now() + 5000
    let checkingExpiry = true
    const stale = ports.remote.createRemoteRunStore({ endpoint,
      fetch: (input, init) => fetch(input, { ...init, signal: checkingExpiry
        ? AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, Math.ceil(expiryDeadline - performance.now())))])
        : signal }),
      authorizeRequest: async () => ({ authorization: 'synthetic-worker-a' }) })
    // A renewed capability is stale immediately, while its resource ownership remains live.
    // Acquire/release the exact resources to prove availability without admitting a task.
    while (true) {
      if (signal.aborted) throw Error('deadline')
      if (performance.now() >= expiryDeadline) {
        proof = { status: 'blocked', checkpoint: true, qualified: false, reason: 'lease-expiry',
          before: taskProjection(before), stages: taskProjection(before),
          observations: firstPacketObservations(checkpoint) }
        return proof
      }
      try {
        const barrier = await stale.claim('tenant', Object.keys(checkpoint.lease.epochs), 'worker-a', 3000)
        if (barrier.status === 'acquired') { await stale.release(barrier.lease); break }
        if (barrier.status !== 'contended') throw Error('lease-expiry')
      } catch (error) {
        if (signal.aborted) throw Error('deadline', { cause: error })
        if (performance.now() < expiryDeadline) throw error
      }
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    checkingExpiry = false
    const second = launchWorker(workerFile, [...workerArgs, '--worker', join(root, 'worker-b'), endpoint,
      'worker-b', 'run', variant, nonce], env, signal)
    children.push(second.child)
    const done = await second.receive(), after = await client.get(key)
    const bytes = await artifacts.read(completed.workspace, 'stage-a.json')
    marker(Buffer.from(bytes).toString(), 'a', nonce)
    const staleResult = await stale.commit({ snapshot: { ...after, revision: after.revision + 1 },
      expectedRevision: after.revision, lease: checkpoint.lease, events: [] })
    const manifest = await artifacts.manifest(completed.workspace)
    const firstObservations = firstPacketObservations(checkpoint), nextObservations = firstPacketObservations(done)
    const observations = ['a', 'b', 'c'].map(stage => {
      const first = firstObservations.find(item => item.stage === stage), next = nextObservations.find(item => item.stage === stage)
      return next?.calls === 0 && first?.calls === 1 ? first : next
    }).filter(Boolean)
    proof = { status: phases.includes(after.status) ? after.status : 'unknown', checkpoint: true,
      before: taskProjection(before), stages: taskProjection(after),
      completedUnchanged: JSON.stringify(after.tasks[0]) === JSON.stringify(completed),
      baseUnchanged: JSON.stringify(after.workspace) === JSON.stringify(workspace),
      unsafeJournal: JSON.stringify(after).includes(nonce), staleCommit: staleResult.status,
      artifactStages: ['a'], artifactCount: manifest.entries.length,
      observations, counts: Object.fromEntries(['a', 'b', 'c'].map(stage => {
        const first = firstObservations.find(item => item.stage === stage)?.calls
        const next = nextObservations.find(item => item.stage === stage)?.calls
        return [stage, Number.isSafeInteger(first) && Number.isSafeInteger(next) ? first + next : null]
      })) }
    if (after.status === 'succeeded') {
      for (const stage of ['b', 'c']) {
        const task = after.tasks.find(task => task.taskId === stage)
        marker(Buffer.from(await artifacts.read(task.workspace, 'stage-' + stage + '.json')).toString(), stage, nonce)
        proof.artifactStages.push(stage)
      }
    }
    proof.counterFailure = Object.values(proof.counts).some(count => count === null || count > 1) ? 'counter-invalid' : null
    proof.qualified = after.status === 'succeeded' && proof.completedUnchanged && proof.baseUnchanged &&
      !proof.unsafeJournal && proof.staleCommit === 'stale-lease' && proof.artifactStages.length === 3 &&
      Object.values(proof.counts).every(count => count === 1) &&
      proof.stages.every(task => task.phase === 'succeeded' && task.attempt === 1)
    return proof
  } catch (error) { failure = { error } } finally {
    clearTimeout(timer)
    let confirmed = true
    for (const child of children.reverse()) {
      if (!await terminateWorker(child, startTreeKill)) { confirmed = false; detachUnverified(child) }
    }
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
    await store?.close()
    if (confirmed) {
      await removeOwned(root)
      if (proof) {
        proof.cleanupVerified = await access(root).then(() => false, error => error.code === 'ENOENT')
        proof.cleanupStatus = proof.cleanupVerified ? 'verified' : 'cleanup-unverified'
      }
    } else {
      // Authority is closed, but an uncertain tree may still hold this workspace.
      // Keep it intact and never report successful qualification or cleanup.
      if (!proof) {
        const error = new Error('cleanup-unverified'); error.code = 'cleanup-unverified'; failure = { error }
      } else {
        proof.qualified = false; proof.cleanupVerified = false; proof.cleanupStatus = 'cleanup-unverified'
      }
    }
  }
  if (failure) throw failure.error
}
function firstPacketObservations(packet) {
  // Workers are code-owned. Still reject unknown data properties and raw strings.
  const rows = Array.isArray(packet?.observations) ? packet.observations : []
  return ['a', 'b', 'c'].map(stage => {
    const matches = rows.filter(item => item?.stage === stage)
    const item = matches.length === 1 ? matches[0] : {}
    const counterValid = rows.length === 3 && matches.length === 1
    return ({
    stage, failurePhase: ['artifact-context', 'cli-run', 'cli-failure', 'marker-shape', 'artifact-shape', 'artifact-write'].includes(item.failurePhase) ? item.failurePhase : null, elapsedMs: Number.isSafeInteger(item.elapsedMs) && item.elapsedMs >= 0 && item.elapsedMs <= 300000 ? item.elapsedMs : null, calls: counterValid && Number.isSafeInteger(item.calls) && item.calls >= 0 && item.calls <= 1 ? item.calls : null,
    exitCode: Number.isSafeInteger(item.exitCode) && Math.abs(item.exitCode) <= 65535 ? item.exitCode : null,
    spawnStarted: item.spawnStarted === true, stdoutPresent: item.stdoutPresent === true,
    stderrPresent: item.stderrPresent === true, stdoutTruncated: item.stdoutTruncated === true,
    stderrTruncated: item.stderrTruncated === true,
    errorCode: ['BRAMBO_EXECUTOR_RUN_FAILED', 'BRAMBO_EXECUTOR_UNAVAILABLE', 'BRAMBO_EXECUTOR_CANCELLED'].includes(item.errorCode)
      ? item.errorCode : 'unknown',
    ...(stage === 'b' ? {
      claudeSubtype: claudeSubtypes.includes(item.claudeSubtype) ? item.claudeSubtype : 'unknown',
      claudeResultStatus: ['ok', 'failed', 'cancelled'].includes(item.claudeResultStatus) ? item.claudeResultStatus : 'unknown',
      claudeStructuredResult: item.claudeStructuredResult === true,
      claudeFailure: claudeFailures.includes(item.claudeFailure) ? item.claudeFailure : 'unknown' } : {}) })
  })
}
async function liveMain() {
  const args = process.argv.slice(2), workerMode = args[1] === '--worker' && typeof process.send === 'function'
  const ready = await checkStartup({ args: workerMode ? args.slice(0, 1) : args, execArgv: process.execArgv,
    exists: path => access(path).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error }) })
  if (!ready.allowed) { console.log(JSON.stringify({ status: 'blocked', reason: ready.reason })); process.exitCode = 1; return }
  const ports = await loadQualificationPorts()
  if (workerMode) {
    const [root, endpoint, subject, pause, variant, nonce] = args.slice(2)
    if (args.length !== 8 || !['pause', 'run'].includes(pause) || variant !== 'valid') throw Error('worker-input')
    const actual = await realpath(root), boundary = await realpath(tmpdir()), rel = relative(boundary, actual)
    if (isAbsolute(rel) || rel.startsWith('..') || !rel.startsWith('brambo-durable-')) throw Error('worker-root')
    if (!/^http:\/\/127\.0\.0\.1:\d+\/v1\/workflow$/.test(endpoint) || !['worker-a', 'worker-b'].includes(subject) ||
        !/^[a-f0-9-]{36}$/.test(nonce)) throw Error('worker-input')
    await runQualificationWorker({ ports, root, endpoint, subject, nonce, pause: pause === 'pause',
      revoked: false, spawner: ports.cli.createNodeChildSpawner() })
    process.disconnect()
  } else {
    // Only the explicitly curated selector names are copied; never log values.
    const env = Object.fromEntries(profileNames.filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]]))
    env.OPENAI_API_KEY = ''; env.ANTHROPIC_API_KEY = ''
    const proof = await runQualification({ ports, workerFile: fileURLToPath(import.meta.url),
      workerArgs: ['--live'], env, nonce: randomUUID() })
    console.log(JSON.stringify(proof))
    if (!proof.qualified || !proof.cleanupVerified) process.exitCode = 1
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  liveMain().catch(error => {
    const reason = Object.getOwnPropertyDescriptor(error && typeof error === 'object' ? error : {}, 'code')?.value === 'cleanup-unverified' ? 'cleanup-unverified' : 'unknown'
    console.log(JSON.stringify({ status: 'failed', reason })); process.exitCode = 1
  })
}
