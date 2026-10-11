import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Copied into an installed consumer so bare imports resolve there, not here.
const surfaces = {
  contracts: ['runWorkflowStoreContractSuite', 'runDriverContractSuite', 'defineStandardSchema'],
  orchestration: ['createDriverRegistry', 'runDurableWorkflow', 'importWorkflowRun'],
  'runtime-local': ['createLocalExecutionRuntime'],
  'workspace-artifacts-local': ['createLocalArtifactProvider'],
  'workflow-coordinator': ['createWorkflowCoordinator', 'createWorkflowWorker'],
  'workflow-remote': ['createRemoteRunStore', 'createRemoteArtifactProvider', 'replayRun'],
  'workflow-store-sqlite': ['openSqliteRunStore'],
}

export async function probeOrchestrationConsumer({ load = name => import(name), resolve = name => import.meta.resolve(name),
  nodeVersion = process.versions.node, rootDir } = {}) {
  const loaded = {}
  for (const [directory, names] of Object.entries(surfaces)) {
    const name = `@brambodev/${directory}`
    if (rootDir) {
      const prefix = pathToFileURL(join(rootDir, 'node_modules') + '/').href
      assert.ok(resolve(name).startsWith(prefix), `${name} resolves outside consumer project`)
    }
    loaded[directory] = await load(name)
    for (const key of names) assert.equal(typeof loaded[directory][key], 'function', `${name} public export ${key} missing`)
  }
  const contracts = loaded.contracts
  const driver = { manifest: { id: 'consumer-probe', version: '1', kind: 'custom', capabilities: ['cancellation'],
    configurationSchema: contracts.defineStandardSchema(value => ({ value })) }, async run({ signal }) {
    return { result: signal.aborted
      ? { status: 'cancelled', data: null, summary: 'aborted', errors: [{ message: 'aborted' }] }
      : { status: 'ok', data: null, summary: 'completed' } }
  } }
  const report = await contracts.runDriverContractSuite(driver, {
    key: { namespace: 'probe', runId: 'run' }, sessionId: 'session', taskId: 'task', prompt: 'probe', context: null,
    workspace: { id: 'workspace', rootPath: tmpdir(), capabilities: ['read'] }, continuation: 'fresh', signal: new AbortController().signal,
  })
  assert.equal(report.passed, true, 'published custom driver conformance failed')

  const [major, minor] = nodeVersion.split('.').map(Number)
  const eligible = major > 24 || major === 24 && minor >= 15
  const directory = await mkdtemp(join(tmpdir(), 'brambo-authority-consumer-'))
  const connections = []
  let sequence = 0, currentPath, now = 1000
  const connect = async () => {
    const store = await loaded['workflow-store-sqlite'].openSqliteRunStore({ path: currentPath, now: () => now })
    connections.push(store)
    return store
  }
  try {
    if (!eligible) {
      currentPath = join(directory, 'unsupported.sqlite')
      await assert.rejects(connect(), error => error?.code === 'BRAMBO_WORKFLOW_STORE_UNAVAILABLE',
        'unsupported runtime must produce typed unavailable')
      return { driver: 'passed', sqlite: 'unavailable', storeClauses: [] }
    }
    const storeReport = await contracts.runWorkflowStoreContractSuite({
      async open() { currentPath = join(directory, `${++sequence}.sqlite`); now = 1000; return connect() },
      reopen: connect, advance(milliseconds) { now += milliseconds },
    })
    assert.equal(storeReport.passed, true, `published SQLite conformance failed: ${JSON.stringify(storeReport.violations)}`)
    return { driver: 'passed', sqlite: 'available', storeClauses: storeReport.clauses }
  } finally {
    // Includes failed/unsupported open controls; only this generated root is removed.
    try { await Promise.all(connections.map(store => store.close())) }
    finally { await rm(directory, { recursive: true, force: true, maxRetries: 3 }) }
  }
}
