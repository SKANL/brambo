import assert from 'node:assert/strict'
import { appendFileSync, writeFileSync } from 'node:fs'
import { fork, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { createQualificationFactory, runQualificationWorker, checkStartup, runQualification, loadQualificationPorts } from './durable-cli.mjs'

const nonce = 'SYNTHETIC_NONCE'
const ids = ['opencode', 'claude-code', 'codex']
const ports = loadQualificationPorts
// Historical native literals come from OBSERVED_REFUSALS, not inferred keywords.
const claudeTexts = {
  login: 'Not logged in · Please run /login', key: 'invalid api key',
  quota: "You've hit your weekly limit · resets 3pm (America/Mexico_City)",
}
const claudeCases = {
  login: ['auth', claudeTexts.login], key: ['auth', claudeTexts.key], quota: ['quota', claudeTexts.quota],
  trimmed: ['auth', '  ' + claudeTexts.login + '\n'],
  'error-only': ['auth', claudeTexts.login], 'max-turns': ['max-turns', ''],
  prose: ['unknown', 'The documentation mentions ' + claudeTexts.login],
  case: ['unknown', 'INVALID API KEY'], rate: ['unknown', 'HTTP 429 rate limit'],
  model: ['unknown', 'model not found'], permission: ['unknown', 'tool use refused'],
  'quota-similar': ['unknown', "You've hit your weekly limit · resets 4pm (America/Mexico_City)"],
  conflict: ['unknown', claudeTexts.login], 'subtype-conflict': ['unknown', claudeTexts.login],
  'result-accessor': ['unknown', claudeTexts.login], 'message-accessor': ['unknown', claudeTexts.login],
  'errors-accessor': ['unknown', claudeTexts.login], 'data-proxy': ['unknown', claudeTexts.login],
  'errors-proxy': ['unknown', claudeTexts.login], nonstring: ['unknown', claudeTexts.login],
  inherited: ['unknown', claudeTexts.login], 'wrong-prefix': ['unknown', claudeTexts.login],
  oversized: ['unknown', 'é'.repeat(2049)], 'combined-budget': ['unknown', ' '.repeat(4000) + claudeTexts.login],
}


function syntheticEnv(root) {
  return { SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows', SystemDrive: 'C:',
    COMSPEC: 'C:\\Windows\\System32\\cmd.exe', HOME: root, USERPROFILE: root, TEMP: root, TMP: root }
}
async function clean(root) {
  const actual = await realpath(root), boundary = await realpath(tmpdir())
  const rel = relative(boundary, actual)
  assert.ok(!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep))
  await rm(actual, { recursive: true, force: true })
}
async function probe(id, variant) {
  const root = await mkdtemp(join(tmpdir(), 'brambo-durable-probe-'))
  const child = fork(fileURLToPath(import.meta.url), ['--probe', root, id, variant], {
    execArgv: ['--conditions=brambo-source'], env: syntheticEnv(root), stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  child.stdout.resume(); child.stderr.resume()
  const packets = []
  child.on('message', packet => packets.push(packet))
  const timer = setTimeout(() => child.kill('SIGKILL'), 20000)
  try {
    const [code] = await once(child, 'exit')
    assert.equal(code, variant === 'lease-expiry' ? 1 : 0, 'SAFE_MAP ' + JSON.stringify(packets.filter(packet => packet.type === 'probe-failed')))
    assert.equal(packets.length, 1)
    return packets[0]
  } finally { clearTimeout(timer); await clean(root) }
}
async function runProbe(root, id, variant) {
  const p = await ports(), rawStore = await p.sqlite.openSqliteRunStore({ path: join(root, 'run.sqlite') })
  if (variant === 'claude-subtype-accessor' || variant.startsWith('claude-classify:')) {
    const createFactory = p.orchestration.createCliDriverFactory
    p.orchestration = { ...p.orchestration, createCliDriverFactory: (...args) => {
      const factory = createFactory(...args)
      return { ...factory, async create(...configuration) {
        const driver = await factory.create(...configuration)
        return { ...driver, async run(request) {
          // Inject hostile metadata after genuine public SDK parsing and validation.
          const response = await driver.run(request), outcome = response.result
          if (variant === 'claude-subtype-accessor') {
            Object.defineProperty(outcome.data, 'subtype', { get() { throw Error('PRIVATE_SYNTHETIC_GETTER') } })
          } else {
            const kind = variant.slice('claude-classify:'.length)
            const hostile = { get() { throw Error('PRIVATE_SYNTHETIC_GETTER') } }
            if (kind === 'error-only') delete outcome.data.result
            if (kind === 'conflict') outcome.errors[0].message = "executor 'claude' reported failure (error_during_execution): " + claudeTexts.quota
            if (kind === 'result-accessor') Object.defineProperty(outcome.data, 'result', hostile)
            if (kind === 'message-accessor') Object.defineProperty(outcome.errors[0], 'message', hostile)
            if (kind === 'errors-accessor') Object.defineProperty(outcome, 'errors', hostile)
            if (kind === 'data-proxy') outcome.data = new Proxy(outcome.data, { getOwnPropertyDescriptor() { throw Error('PRIVATE_SYNTHETIC_TRAP') } })
            if (kind === 'errors-proxy') outcome.errors = new Proxy(outcome.errors, { getOwnPropertyDescriptor() { throw Error('PRIVATE_SYNTHETIC_TRAP') } })
            if (kind === 'nonstring') outcome.data.result = { toString() { throw Error('PRIVATE_SYNTHETIC_COERCION') } }
            if (kind === 'inherited') { delete outcome.data.result; Object.setPrototypeOf(outcome.data, { result: claudeTexts.login }); outcome.errors[0].message = 'untrusted prose' }
            if (kind === 'wrong-prefix') { delete outcome.data.result; outcome.errors[0].message = "executor 'opencode' reported failure (error_during_execution): " + claudeTexts.login }
          }
          return response
        } }
      } }
    } }
  }
  let boundary = 'artifact-setup', lastValidation = null, renewalStatus = null, publicationReturned = false, canonicalPublished = false, delayedStageStarted = false
  const store = new Proxy(rawStore, { get(target, key) {
    const method = target[key]
    if (typeof method !== 'function') return method
    return async (...args) => {
      const result = await method.apply(target, args)
      if (key === 'valid' && args[0]?.ownerId === 'probe') lastValidation = result
      if (key === 'renew' && args[0]?.ownerId === 'probe') renewalStatus = ['acquired', 'contended'].includes(result.status) ? result.status : 'unknown'
      return result
    }
  } })
  try {
    const artifacts = p.artifacts.createLocalArtifactProvider({ rootDir: join(root, 'artifacts'), store })
    if (['slow-stage', 'lease-expiry'].includes(variant)) {
      const stageArtifact = artifacts.stage.bind(artifacts)
      artifacts.stage = async (namespace, source) => {
        if (source.includes('.brambo-runtime-')) { delayedStageStarted = true; await new Promise(resolve => setTimeout(resolve, 3100)) }
        return stageArtifact(namespace, source)
      }
    }
    const source = join(root, 'source'); await mkdir(source)
    await writeFile(join(source, 'stage-a.json'), JSON.stringify({ stage: 'a', nonce: variant === 'corrupt-artifact' ? 'WRONG' : nonce, previous: null, verdict: 'ok' }))
    const staged = await artifacts.stage('tenant', source)
    const boot = await store.claim('tenant', ['workspace:parent'], 'bootstrap', 10000)
    const workspace = { namespace: 'tenant', workspaceId: 'parent', revision: staged.revision }
    await artifacts.publish(workspace, staged, boot.lease); await store.release(boot.lease)
    let observed, calls = 0
    const marker = { stage: 'b', nonce: variant === 'wrong-nonce' ? 'WRONG' : nonce, previous: 'a', verdict: 'ok' }
    const result = variant === 'malformed' ? 'PRIVATE_SYNTHETIC_NOT_JSON' :
      variant === 'oversized' ? 'X'.repeat(5000) :
      JSON.stringify(variant === 'extra' ? { ...marker, secret: 'PRIVATE_SYNTHETIC_EXTRA' } : marker)
    const spawner = { spawn(_command, args, options) {
      calls++
      if (variant === 'workspace-extra') writeFileSync(join(options.cwd, 'unexpected.txt'), 'PRIVATE_SYNTHETIC_FILE')
      if (variant === 'throw-getter') {
        const error = new Error()
        Object.defineProperty(error, 'message', { get() { throw Error('PRIVATE_SYNTHETIC_GETTER') } })
        throw error
      }
      observed = { dangerous: args.includes('--dangerously-skip-permissions'), safe: args.includes('--safe-mode'),
        toolsEmpty: args[args.indexOf('--tools') + 1] === '', maxTurns: args[args.indexOf('--max-turns') + 1],
        model: args[args.indexOf('--model') + 1], readonly: args[args.indexOf('--sandbox') + 1] === 'read-only',
        ignore: args.includes('--ignore-user-config'), ephemeral: args.includes('--ephemeral'),
        approvalRoot: args[0] === '--ask-for-approval' && args[1] === 'never',
        low: args.includes('model_reasoning_effort=low'),
        isolated: Array.isArray(options.inheritEnv) && !options.inheritEnv.includes('UNRELATED_SYNTHETIC_KEY'),
        blankKeys: options.env?.OPENAI_API_KEY === '' && options.env?.ANTHROPIC_API_KEY === '',
        denied: options.env?.OPENCODE_CONFIG_CONTENT?.includes('"*":"deny"') === true }
      let settled = false, resolve
      const done = new Promise(finish => { resolve = finish })
      const complete = () => {
        const event = id === 'opencode' ? { type: 'text', part: { type: 'text', text: result } } :
          id === 'claude-code' ? { type: 'result', subtype: 'success', is_error: false, result } :
            { type: 'item.completed', item: { type: 'agent_message', text: result } }
        if (variant.startsWith('claude-subtype:')) {
          const subtype = variant.slice('claude-subtype:'.length)
          event.subtype = subtype; event.is_error = subtype !== 'success'
          if (subtype !== 'success') {
            event.result = 'PRIVATE_SYNTHETIC_RESULT'; event.errors = ['PRIVATE_SYNTHETIC_MESSAGE']
            event.session_id = 'PRIVATE_SYNTHETIC_SESSION'
          }
        }

if (variant.startsWith('claude-classify:')) {
          const kind = variant.slice('claude-classify:'.length)
          event.subtype = ['max-turns', 'subtype-conflict'].includes(kind) ? 'error_max_turns' : 'error_during_execution'
          event.is_error = true; event.result = claudeCases[kind][1]
        }
        const stdout = JSON.stringify(event) + '\n'
        options.onStdoutLine?.(stdout.trim()); settled = true
        resolve({ exitCode: variant === 'exit' ? 2 : 0, stdout, stderr: variant === 'exit' ? 'PRIVATE_SYNTHETIC_STDERR' : '' })
      }
      if (id === 'opencode') complete()
      return { pid: undefined, get settled() { return settled }, done, writeStdin() {},
        endStdin() { if (id !== 'opencode') complete() },
        killTree() { settled = true; resolve({ exitCode: null, stdout: '', stderr: '' }) } }
    } }
    const factory = createQualificationFactory(p, id, root, nonce, spawner, artifacts)
    const driver = await factory.create({}, { dispatchTool: async () => { throw Error('denied') },
      resolveSecret: async () => { throw Error('denied') } })
    boundary = 'task-claim'
    // Policy/artifact probes use public defaults; only the expiry regression has a short lease.
    const claimed = await store.claim('tenant', ['task:run:b', 'workspace:parent'], 'probe', variant === 'lease-expiry' ? 3000 : 30000)
    const runtime = p.runtime.createLocalExecutionRuntime({ rootDir: join(root, 'runtime'), store, artifacts,
      ...(variant === 'lease-expiry' ? { ttlMs: 3000, renewalMs: 500 } : {}) })
    const context = { snapshot: { tasks: [{ taskId: 'a', phase: 'succeeded', workspace }] } }
    boundary = 'runtime-execute'
    const outcome = await runtime.execute(driver, { key: { namespace: 'tenant', runId: 'run' }, sessionId: 'session',
      taskId: 'b', prompt: 'Return the canonical stage marker.', workspace, context,
      continuation: 'reconstructed', signal: new AbortController().signal }, claimed.lease)
    publicationReturned = true
    boundary = 'artifact-verification'
    const unsafe = JSON.stringify(outcome.outcome).includes('PRIVATE_SYNTHETIC') ||
      JSON.stringify(outcome.outcome).includes(nonce)
    let canonical = false
    if (outcome.outcome.result.status === 'ok') {
      await artifacts.publish(outcome.workspace, outcome.staged, outcome.publicationLease)
      canonicalPublished = true
      const bytes = await artifacts.read(outcome.workspace, 'stage-b.json').catch(() => new Uint8Array())
      canonical = Buffer.from(bytes).toString() === JSON.stringify(marker)
    }
    await store.release(outcome.publicationLease)
    process.send({ status: outcome.outcome.result.status, dataEmpty: JSON.stringify(outcome.outcome.result.data) === '{}',
      unsafe, canonical, calls, observed, failure: outcome.outcome.result.summary, diagnostic: factory.observation() })
  } catch (error) {
    const value = Object.getOwnPropertyDescriptor(error && typeof error === 'object' ? error : {}, 'code')?.value
    const code = ['BRAMBO_CONTRACT_LEASE_SCOPE_INVALID', 'BRAMBO_WORKFLOW_STORE_INVALID', 'ENOENT', 'EPERM', 'EBUSY'].includes(value) ? value : 'unknown'
    process.send({ type: 'probe-failed', boundary, code, lastValidation, renewalStatus, publicationReturned, canonicalPublished, delayedStageStarted })
    throw error
  } finally { await store.close() }
}
async function workerProbe(root, endpoint, subject, pause, variant) {
  const mode = process.env.FIXTURE_COUNTER_MODE
  if (mode) {
    const send = process.send.bind(process)
    process.send = packet => {
      const target = mode.startsWith('first-') ? 'checkpoint' : 'done'
      if (packet.type === target) {
        const row = packet.observations.find(item => item.stage === 'a')
        if (mode.endsWith('overflow')) row.calls = 2
        if (mode.endsWith('type')) row.calls = 'PRIVATE_SYNTHETIC_COUNTER'
        if (mode.endsWith('missing')) delete row.calls
        if (mode.endsWith('row')) packet.observations = packet.observations.filter(item => item.stage !== 'a')
        if (mode.endsWith('duplicate')) packet.observations.push({ ...row })
      }
      send(packet)
    }
  }
  const p = await ports()
  const spawner = { spawn(command, args) {
    const id = command === 'claude' ? 'claude-code' : command
    const stage = { opencode: 'a', 'claude-code': 'b', codex: 'c' }[id]
    // Counter is recorded at spawn entry, even if the synthetic child refuses.
    appendFileSync(join(root, '..', 'calls'), stage + '\n')
    let input = '', settled = false, resolve
    const done = new Promise(finish => { resolve = finish })
    async function complete() {
      const prompt = id === 'opencode' ? args.at(-1) : input
      const wanted = { stage, nonce, previous: { a: null, b: 'a', c: 'b' }[stage], verdict: 'ok' }
      const contextOK = stage === 'a' || prompt.includes('Previously verified immutable marker: ' +
        JSON.stringify({ stage: wanted.previous, nonce, previous: stage === 'b' ? null : 'a', verdict: 'ok' }))
      const result = variant === 'fail-b' && stage === 'b' ? 'NOT_JSON' : JSON.stringify(wanted)
      const event = id === 'opencode' ? { type: 'text', part: { type: 'text', text: result } } :
        id === 'claude-code' ? { type: 'result', subtype: 'success', is_error: false, result } :
          { type: 'item.completed', item: { type: 'agent_message', text: result } }
      if (variant === 'claude-error' && stage === 'b') {
        event.subtype = 'error_max_turns'; event.is_error = false; event.result = 'PRIVATE_SYNTHETIC_RESULT'
      }
      const stdout = JSON.stringify(event) + '\n'
      settled = true; resolve({ exitCode: variant === 'claude-error' && stage === 'b' ? 1 : contextOK ? 0 : 2, stdout, stderr: '' })
    }
    if (id === 'opencode') void complete()
    return { pid: undefined, get settled() { return settled }, done, writeStdin(value) { input += value },
      endStdin() { if (id !== 'opencode') void complete() }, killTree() { settled = true; resolve({ exitCode: null, stdout: '', stderr: '' }) } }
  } }
  await runQualificationWorker({ ports: p, root, endpoint, subject, nonce, spawner,
    pause: pause === 'pause', revoked: variant === 'revoked' })
  if (process.env.FIXTURE_HANG_AFTER_DONE === 'true' && subject === 'worker-b') {
    await new Promise(() => { setInterval(() => {}, 1000) })
  }
}
async function restartScenario(variant) {
  const root = await mkdtemp(join(tmpdir(), 'brambo-durable-test-'))
  try {
    const proof = await runQualification({ ports: await ports(), workerFile: fileURLToPath(import.meta.url),
      env: syntheticEnv(root), nonce, variant })
    assert.equal(proof.checkpoint, true); assert.equal(proof.qualified, variant === 'valid')
    assert.deepEqual(proof.before.map(task => [task.phase, task.attempt]), [['succeeded', 1], ['pending', 0], ['pending', 0]])
    assert.equal(proof.status, variant === 'valid' ? 'succeeded' : 'blocked')
    assert.deepEqual(proof.counts, variant === 'valid' ? { a: 1, b: 1, c: 1 } :
      variant === 'revoked' ? { a: 1, b: 0, c: 0 } : { a: 1, b: 1, c: 0 })
    assert.equal(proof.completedUnchanged, true); assert.equal(proof.baseUnchanged, true)
    assert.equal(proof.unsafeJournal, false); assert.equal(proof.staleCommit, 'stale-lease')
    assert.deepEqual(proof.artifactStages, variant === 'valid' ? ['a', 'b', 'c'] : ['a'])
    for (const observation of proof.observations.filter(item => item.calls === 1)) assert.ok(Number.isSafeInteger(observation.elapsedMs) && observation.elapsedMs >= 0 && observation.elapsedMs <= 300000)
    assert.equal(proof.artifactCount, 1); assert.equal(proof.cleanupVerified, true)
  } finally { await clean(root) }
}

if (process.argv[2] === '--worker') {
  try { await workerProbe(...process.argv.slice(3)); process.disconnect() }
  catch { process.exitCode = 1; process.disconnect() }
} else if (process.argv[2] === '--probe') {
  try { await runProbe(...process.argv.slice(3)); process.disconnect() }
  catch { process.exitCode = 1; process.disconnect() }
} else {
  for (const [kind, [expected]] of Object.entries(claudeCases)) {
    test('Claude failure classification ' + kind + ' keeps only a fixed enum', async () => {
      const proof = await probe('claude-code', 'claude-classify:' + kind)
      assert.equal(proof.status, 'failed'); assert.equal(proof.calls, 1)
      assert.equal(proof.failure, 'cli-failure')
      assert.equal(proof.diagnostic.claudeFailure, expected)
      assert.equal(proof.dataEmpty, true); assert.equal(proof.unsafe, false)
      const safe = JSON.stringify(proof)
      for (const raw of [...Object.values(claudeTexts), 'PRIVATE_SYNTHETIC', 'executor ']) assert.equal(safe.includes(raw), false)
    })
  }
  for (const [subtype, expected, status] of [
    ['error_max_turns', 'error_max_turns', 'failed'],
    ['error_during_execution', 'error_during_execution', 'failed'],
    ['error_max_budget_usd', 'error_max_budget_usd', 'failed'],
    ['error_max_structured_output_retries', 'error_max_structured_output_retries', 'failed'],
    ['success', 'success', 'ok'], ['PRIVATE_SYNTHETIC_SUBTYPE', 'unknown', 'failed'],
  ]) test('public Claude subtype projection ' + expected + ' keeps only bounded metadata for ' + status, async () => {
    const proof = await probe('claude-code', 'claude-subtype:' + subtype)
    assert.equal(proof.status, status); assert.equal(proof.calls, 1)
    assert.equal(proof.diagnostic.claudeSubtype, expected)
    assert.equal(proof.diagnostic.claudeResultStatus, status)
    assert.equal(proof.diagnostic.claudeStructuredResult, true)
    assert.equal(JSON.stringify(proof).includes('PRIVATE_SYNTHETIC'), false)
    assert.equal(proof.dataEmpty, true); assert.equal(proof.unsafe, false)
  })
  test('public Claude subtype projection does not invoke hostile metadata accessors', async () => {
    const proof = await probe('claude-code', 'claude-subtype-accessor')
    assert.equal(proof.status, 'ok'); assert.equal(proof.canonical, true)
    assert.equal(proof.diagnostic.claudeSubtype, 'unknown')
    assert.equal(proof.diagnostic.claudeStructuredResult, false)
    assert.equal(proof.diagnostic.claudeResultStatus, 'ok')
    assert.equal(JSON.stringify(proof).includes('PRIVATE_SYNTHETIC'), false)
  })
  test('actual controller preserves bounded Claude subtype through restart failure proof', async () => {
    const root = await mkdtemp(join(tmpdir(), 'brambo-durable-subtype-'))
    try {
      const proof = await runQualification({ ports: await ports(), workerFile: fileURLToPath(import.meta.url),
        env: syntheticEnv(root), nonce, variant: 'claude-error' })
      assert.equal(proof.status, 'blocked'); assert.equal(proof.qualified, false)
      assert.deepEqual(proof.counts, { a: 1, b: 1, c: 0 })
      const observation = proof.observations.find(item => item.stage === 'b')
      assert.equal(observation.claudeSubtype, 'error_max_turns')
      assert.equal(observation.claudeResultStatus, 'failed')
      assert.equal(observation.claudeStructuredResult, true)
      assert.equal(observation.claudeFailure, 'max-turns')
      assert.equal(JSON.stringify(proof).includes('PRIVATE_SYNTHETIC'), false)
      assert.equal(proof.unsafeJournal, false); assert.equal(proof.cleanupVerified, true)
    } finally { await clean(root) }
  })
  test('trusted caller work deadline settles the actual controller before qualification', async () => {
    const root = await mkdtemp(join(tmpdir(), 'brambo-durable-deadline-'))
    const controller = new AbortController(); controller.abort()
    try {
      await assert.rejects(runQualification({ ports: await ports(), workerFile: fileURLToPath(import.meta.url),
        env: syntheticEnv(root), nonce, signal: controller.signal }), /deadline/)
    } finally { await clean(root) }
  })
  for (const ttlMs of [3000, 10000]) test('actual controller resource expiry barrier ' + ttlMs + ' handles renewed checkpoint capability', async () => {
    const root = await mkdtemp(join(tmpdir(), 'brambo-durable-renewal-'))
    const p = await ports()
    let authorityStore, latestLease, renewed = false, remoteClients = 0
    const openStore = p.sqlite.openSqliteRunStore
    const createRemote = p.remote.createRemoteRunStore
    p.sqlite = { ...p.sqlite, openSqliteRunStore: async options => {
      authorityStore = await openStore(options)
      return new Proxy(authorityStore, { get(target, key) {
        const method = target[key]
        if (typeof method !== 'function') return method
        return async (...args) => {
          const result = await method.apply(target, args)
          if (['claim', 'renew'].includes(key) && result.status === 'acquired' && result.lease.ownerId === 'worker-a') latestLease = result.lease
          return result
        }
      } })
    } }
    p.remote = { ...p.remote, createRemoteRunStore: options => {
      const client = createRemote(options)
      if (++remoteClients !== 2) return client
      // Real authority renewal models the in-flight final renewal after checkpoint capture.
      const renewal = authorityStore.renew(latestLease, ttlMs).then(result => { renewed = result.status === 'acquired' })
      return new Proxy(client, { get(target, key) {
        const method = target[key]
        return typeof method === 'function' ? async (...args) => { await renewal; return method.apply(target, args) } : method
      } })
    } }
    try {
      const proof = await runQualification({ ports: p, workerFile: fileURLToPath(import.meta.url), env: syntheticEnv(root), nonce })
      assert.equal(renewed, true, 'actual authority renewed the captured capability')
      assert.equal(proof.status, ttlMs === 3000 ? 'succeeded' : 'blocked', 'stale capability alone cannot start replacement')
      assert.equal(proof.qualified, ttlMs === 3000)
      if (ttlMs === 3000) {
        assert.deepEqual(proof.counts, { a: 1, b: 1, c: 1 }); assert.equal(proof.staleCommit, 'stale-lease')
      } else {
        assert.equal(proof.reason, 'lease-expiry')
        assert.deepEqual(proof.stages.map(task => [task.phase, task.attempt]), [['succeeded', 1], ['pending', 0], ['pending', 0]])
      }
      assert.equal(proof.cleanupVerified, true)
    } finally { await clean(root) }
  })
  for (const mode of ['failure', 'hang', 'no-termination']) {
    test('actual controller preserves workspace when tree killer ' + mode + ' cannot confirm cleanup', async () => {
      const root = await mkdtemp(join(tmpdir(), 'brambo-durable-cleanup-'))
      let ownedChild, retainedRoot, helper
      let watchdogFired = false, workWatchdogFired = false, killerStartedAt = null, watchdog
      const workController = new AbortController()
      const workWatchdog = setTimeout(() => { workWatchdogFired = true; workController.abort() }, 30000)
      const emergencyCleanup = () => {
        watchdogFired = true
        if (helper && helper.exitCode === null && helper.signalCode === null) helper.kill('SIGKILL')
        if (ownedChild && ownedChild.exitCode === null && ownedChild.signalCode === null) {
          const killer = spawn('C:\\Windows\\System32\\taskkill.exe', ['/pid', String(ownedChild.pid), '/t', '/f'], { env: syntheticEnv(root), stdio: 'ignore' })
          killer.unref()
        }
      }
      const startTreeKill = child => {
        killerStartedAt = performance.now()
        clearTimeout(workWatchdog)
        watchdog = setTimeout(emergencyCleanup, 5000)
        ownedChild = child
        retainedRoot = dirname(child.spawnargs[child.spawnargs.indexOf('--worker') + 1])
        helper = spawn(process.execPath, ['--eval', mode === 'failure' ? 'process.exit(1)' :
          mode === 'hang' ? 'setInterval(()=>{},1000)' : 'process.exit(0)'],
        { env: syntheticEnv(root), stdio: 'ignore' })
        return helper
      }
      try {
        const start = performance.now()
        const proof = await runQualification({ ports: await ports(), workerFile: fileURLToPath(import.meta.url),
          env: { ...syntheticEnv(root), FIXTURE_HANG_AFTER_DONE: 'true' }, nonce, startTreeKill, signal: workController.signal })
        assert.equal(workWatchdogFired, false, 'synthetic workflow finished within its separate work deadline')
        assert.equal(watchdogFired, false, 'SAFE_MAP ' + JSON.stringify({ watchdogFired, totalMs: Math.round(performance.now() - start), killerAfterMs: killerStartedAt === null ? null : Math.round(killerStartedAt - start), cleanupMs: killerStartedAt === null ? null : Math.round(performance.now() - killerStartedAt), status: proof.status, stages: proof.stages, cleanup: proof.cleanupStatus }))
        assert.equal(proof.qualified, false)
        assert.equal(proof.cleanupVerified, false); assert.equal(proof.cleanupStatus, 'cleanup-unverified')
        assert.ok(killerStartedAt !== null && performance.now() - killerStartedAt < 5000, 'cleanup-only settlement remains bounded')
        assert.equal(ownedChild.exitCode, null, 'uncertain worker remains alive')
        assert.equal(ownedChild.signalCode, null)
        await realpath(retainedRoot)
      } finally {
        clearTimeout(watchdog); clearTimeout(workWatchdog)
        if (helper && helper.exitCode === null && helper.signalCode === null) { const exited = once(helper, 'exit'); helper.kill('SIGKILL'); await exited }
        if (ownedChild && ownedChild.exitCode === null && ownedChild.signalCode === null) {
          const exited = once(ownedChild, 'exit')
          const killer = spawn('C:\\Windows\\System32\\taskkill.exe', ['/pid', String(ownedChild.pid), '/t', '/f'],
            { env: syntheticEnv(root), stdio: 'ignore' })
          const [code] = await once(killer, 'exit'); assert.equal(code, 0)
          await exited
        }
        if (retainedRoot && await realpath(retainedRoot).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error })) await clean(retainedRoot)
        await clean(root)
      }
    })
  }
  for (const mode of ['next-overflow', 'next-type', 'next-missing', 'next-row', 'next-duplicate',
    'first-overflow', 'first-type', 'first-missing', 'first-row']) {
    test('actual controller rejects ' + mode + ' counter evidence rather than treating it as zero', async () => {
      const root = await mkdtemp(join(tmpdir(), 'brambo-durable-counters-'))
      try {
        const proof = await runQualification({ ports: await ports(), workerFile: fileURLToPath(import.meta.url),
          env: { ...syntheticEnv(root), FIXTURE_COUNTER_MODE: mode }, nonce })
        assert.equal(proof.status, 'succeeded', 'SAFE_MAP ' + JSON.stringify({ status: proof.status, stages: proof.stages, observations: proof.observations, counts: proof.counts, counterFailure: proof.counterFailure, cleanup: proof.cleanupStatus }))
        assert.equal(proof.qualified, false)
        assert.equal(proof.counts.a, null)
        assert.equal(proof.counterFailure, 'counter-invalid')
        assert.equal(JSON.stringify(proof).includes('PRIVATE_SYNTHETIC_COUNTER'), false)
        assert.equal(proof.cleanupVerified, true)
      } finally { await clean(root) }
    })
  }
  test('actual entry point blocks before CLI lookup without opt-in or source condition', async () => {
    const root = await mkdtemp(join(tmpdir(), 'brambo-durable-entry-'))
    try {
      for (const [args, reason] of [[[], 'opt-in'], [['--live'], 'source-condition'], [['--live', '--unknown'], 'opt-in']]) {
        const child = spawn(process.execPath, [fileURLToPath(new URL('./durable-cli.mjs', import.meta.url)), ...args],
          { env: syntheticEnv(root), stdio: ['ignore', 'pipe', 'pipe'] })
        let output = ''
        child.stdout.on('data', bytes => { output += bytes }); child.stderr.resume()
        const [code] = await once(child, 'exit')
        assert.equal(code, 1)
        assert.deepEqual(JSON.parse(output), { status: 'blocked', reason })
      }
    } finally { await clean(root) }
  })
  test('live startup requires opt-in, source condition and absent managed config', async () => {
    const fixtures = [
      [[], ['--conditions=brambo-source'], async () => false, 'opt-in'],
      [['--live'], [], async () => false, 'source-condition'],
      [['--live'], ['--conditions=brambo-source'], async () => true, 'managed-config'],
      [['--live'], ['--conditions=brambo-source'], async () => { throw Error('PRIVATE_SYNTHETIC') }, 'preflight-unavailable'],
    ]
    for (const [args, execArgv, exists, reason] of fixtures) {
      assert.deepEqual(await checkStartup({ args, execArgv, exists }), { allowed: false, reason })
    }
    assert.deepEqual(await checkStartup({ args: ['--live'], execArgv: ['--conditions=brambo-source'],
      exists: async () => false }), { allowed: true })
  })
  test('non-expiry public runtime probe preserves canonical artifacts through delayed staging', async () => {
    const proof = await probe('opencode', 'slow-stage')
    assert.equal(proof.status, 'ok'); assert.equal(proof.canonical, true); assert.equal(proof.calls, 1)
    assert.equal(proof.dataEmpty, true); assert.equal(proof.unsafe, false)
  })
  test('explicit short lease withholds publication when delayed staging loses authority', async () => {
    const proof = await probe('opencode', 'lease-expiry')
    assert.equal(proof.type, 'probe-failed'); assert.equal(proof.boundary, 'runtime-execute')
    assert.equal(proof.lastValidation, false); assert.equal(proof.delayedStageStarted, true)
    assert.equal(proof.publicationReturned, false); assert.equal(proof.canonicalPublished, false)
    assert.equal(proof.code, 'unknown')
  })
  test('actual failing CLI outcome preserves bounded process diagnostic only', async () => {
    const proof = await probe('codex', 'exit')
    assert.ok(Number.isSafeInteger(proof.diagnostic.elapsedMs) && proof.diagnostic.elapsedMs >= 0)
    const diagnostic = { ...proof.diagnostic }; delete diagnostic.elapsedMs
    assert.deepEqual(diagnostic, { calls: 1, exitCode: 2, stdoutPresent: true, stderrPresent: true,
      spawnStarted: false, stdoutTruncated: false, stderrTruncated: false, failurePhase: 'cli-failure', errorCode: 'BRAMBO_EXECUTOR_RUN_FAILED' })
  })
  test('untrusted extra workspace file is refused rather than published as an artifact', async () => {
    const proof = await probe('claude-code', 'workspace-extra')
    assert.equal(proof.status, 'failed'); assert.equal(proof.canonical, false); assert.equal(proof.unsafe, false)
    assert.equal(proof.failure, 'artifact-shape'); assert.equal(proof.calls, 1)
  })
  test('corrupt predecessor artifact is refused before CLI dispatch with a precise safe boundary', async () => {
    const proof = await probe('claude-code', 'corrupt-artifact')
    assert.equal(proof.status, 'failed'); assert.equal(proof.calls, 0)
    assert.equal(proof.failure, 'artifact-context'); assert.equal(proof.diagnostic.failurePhase, 'artifact-context'); assert.equal(proof.unsafe, false)
  })
  test('hostile thrown metadata cannot reject the runtime or expose strings', async () => {
    const proof = await probe('claude-code', 'throw-getter')
    assert.equal(proof.status, 'failed'); assert.equal(proof.calls, 1)
    assert.equal(proof.failure, 'cli-run'); assert.equal(proof.unsafe, false)
    assert.equal(proof.diagnostic.errorCode, 'unknown')
  })
  for (const variant of ['valid', 'revoked', 'fail-b']) {
    test('actual durable worker restart ' + variant + ' preserves completed stage and stops safely', () => restartScenario(variant))
  }
  for (const id of ids) test('public runtime ' + id + ' preserves isolation and canonical artifact handoff', async () => {
    const proof = await probe(id, 'valid')
    assert.equal(proof.status, 'ok'); assert.equal(proof.calls, 1)
    assert.equal(proof.dataEmpty, true); assert.equal(proof.unsafe, false); assert.equal(proof.canonical, true)
    assert.equal(proof.observed.isolated, true); assert.equal(proof.observed.blankKeys, true)
    if (id === 'opencode') { assert.equal(proof.observed.model, 'opencode-go/deepseek-v4-flash'); assert.equal(proof.observed.denied, true) }
    if (id === 'claude-code') {
      assert.equal(proof.observed.dangerous, false); assert.equal(proof.observed.safe, true)
      assert.equal(proof.observed.toolsEmpty, true); assert.equal(proof.observed.maxTurns, '1')
      assert.equal(proof.observed.model, 'claude-haiku-4-5-20251001')
    }
    if (id === 'codex') {
      assert.equal(proof.observed.model, 'gpt-5.6-luna'); assert.equal(proof.observed.low, true)
      for (const field of ['readonly', 'ignore', 'ephemeral', 'approvalRoot']) assert.equal(proof.observed[field], true)
    }
  })
  for (const variant of ['wrong-nonce', 'malformed', 'oversized', 'extra', 'exit']) {
    test('public runtime rejects ' + variant + ' without raw journal diagnostics', async () => {
      const proof = await probe('claude-code', variant)
      assert.equal(proof.status, 'failed'); assert.equal(proof.unsafe, false); assert.equal(proof.canonical, false)
      assert.equal(proof.dataEmpty, true); assert.equal(proof.calls, 1)
    })
  }
}
