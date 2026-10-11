import { describe, expect, it } from 'vitest'
import { admitConfiguredWorkflowRun, createDriverRegistry, resolveExecutionConfiguration, runDelegatedTaskGraph, runTaskGraph } from '@brambodev/orchestration'
import { defineStandardSchema, mapControlExtensions } from '@brambodev/contracts'
import type { ControlExtension, DriverFactory, DriverRequest, ExecutionConfigurationLayers, ExecutionControlContract, ExecutionControlHost, JsonObject, JsonValue, ModelCapabilityResolver, RunSnapshot } from '@brambodev/contracts'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { readFile } from 'node:fs/promises'
import { workflowFixture } from './helpers/workflow-fixture.ts'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJsonlOrchestrationStateStore } from '../src/state-store.ts'

describe('runTaskGraph', () => {
  it('runs dependencies before dependants and exposes results', async () => {
    const order: string[] = []
    const result = await runTaskGraph([
      { id: 'prepare', run: async () => { order.push('prepare'); return 7 } },
      { id: 'use', dependsOn: ['prepare'], run: async ({ getResult }) => { order.push('use'); return (getResult('prepare') as number) + 1 } },
    ])
    expect(order).toEqual(['prepare', 'use'])
    expect(result.status).toBe('succeeded')
    expect(result.tasks[1]?.result).toBe(8)
  })

  it('blocks dependants after a failure without invoking them', async () => {
    let invoked = false
    const result = await runTaskGraph([
      { id: 'fail', run: async () => { throw new Error('boom') } },
      { id: 'blocked', dependsOn: ['fail'], run: async () => { invoked = true } },
    ])
    expect(invoked).toBe(false)
    expect(result.status).toBe('failed')
    expect(result.tasks.map((task) => task.status)).toEqual(['failed', 'blocked'])
  })

  it('rejects cycles before executing tasks', async () => {
    await expect(runTaskGraph([
      { id: 'a', dependsOn: ['b'], run: async () => undefined },
      { id: 'b', dependsOn: ['a'], run: async () => undefined },
    ])).rejects.toThrow('cycle')
  })

  it('retries a failed task up to its declared attempt bound', async () => {
    let attempts = 0
    const result = await runTaskGraph([{ id: 'retry', maxAttempts: 2, run: async () => {
      attempts += 1
      if (attempts === 1) throw new Error('transient')
      return 'ok'
    } }])
    expect(result.status).toBe('succeeded')
    expect(attempts).toBe(2)
    expect(result.tasks[0]?.attempts).toBe(2)
  })

  it('resumes succeeded tasks from initial records without invoking them again', async () => {
    let prepared = 0
    let consumed = 0
    const result = await runTaskGraph([
      { id: 'prepare', run: async () => { prepared += 1; return 'ready' } },
      { id: 'consume', dependsOn: ['prepare'], run: async ({ getResult }) => { consumed += 1; return getResult('prepare') } },
    ], { initialRecords: [{ id: 'prepare', status: 'succeeded', result: 'ready', attempts: 1 }] })
    expect(result.status).toBe('succeeded')
    expect(prepared).toBe(0)
    expect(consumed).toBe(1)
  })

  it('persists and reloads the last orchestration snapshot', async () => {
    const root = await mkdtemp(join(tmpdir(), 'brambo-orchestration-'))
    try {
      const store = createJsonlOrchestrationStateStore(join(root, 'state.jsonl'))
      const records = [{ id: 'a', status: 'succeeded' as const, result: 1, attempts: 1 }]
      store.save(records)
      store.save([{ id: 'a', status: 'succeeded' as const, result: 2, attempts: 2 }])
      expect(store.load()).toEqual([{ id: 'a', status: 'succeeded', result: 2, attempts: 2 }])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('uses the state store as the default resume source', async () => {
    const root = await mkdtemp(join(tmpdir(), 'brambo-orchestration-resume-'))
    try {
      const store = createJsonlOrchestrationStateStore(join(root, 'state.jsonl'))
      let calls = 0
      await runTaskGraph([{ id: 'once', run: async () => { calls += 1; return 42 } }], { stateStore: store })
      const resumed = await runTaskGraph([{ id: 'once', run: async () => { calls += 1; return 99 } }], { stateStore: store })
      expect(resumed.status).toBe('succeeded')
      expect(calls).toBe(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('runs delegated work through the orchestration graph', async () => {
    const result = await runDelegatedTaskGraph([
      { id: 'child', request: { id: 'child', input: 'hello' }, handler: { execute: async ({ input }) => input.toUpperCase() } },
    ])
    expect(result.status).toBe('succeeded')
    expect(result.tasks[0]?.result).toBe('HELLO')
  })
})

// Cross-package workspace proof follows the owning package's public root export.
// It does not install dependencies or substitute an arbitrary private module.
async function publicPackage(directory: string) {
  const manifestPath = join(import.meta.dirname, '../../', directory, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  createRequire(manifestPath).resolve(manifest.name)
  return import(pathToFileURL(join(import.meta.dirname, '../../', directory, manifest.exports['.']['brambo-source'])).href)
}

const deliberationSchema = defineStandardSchema<JsonValue>(value => value === 'low' || value === 'medium' || value === 'high' || value === 'deep'
  ? { value } : { issues: [{ message: 'invalid deliberation' }] })
const budgetSchema = defineStandardSchema<JsonValue>(value => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
  ? { value } : { issues: [{ message: 'invalid budget' }] })
const controlSchema = defineStandardSchema<JsonObject>(value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).every(key => key === 'deliberation') && (!Object.hasOwn(value, 'deliberation') || ['low', 'medium', 'high', 'deep'].includes(String((value as JsonObject)['deliberation'])))
  ? { value: value as JsonObject } : { issues: [{ message: 'invalid controls' }] })
const acmeContract: ExecutionControlContract = { providerId: 'acme', requiresModel: true, configurationSchema: controlSchema,
  controls: [{ id: 'acme:deliberation', configurationKey: 'deliberation', schema: deliberationSchema }, { id: 'acme:budget', schema: budgetSchema }] }
const acmeResolver: ModelCapabilityResolver = query => query.providerId === 'acme' && query.model === 'custom-model'
  ? { status: 'supported', version: 'synthetic-v1' } : { status: 'unknown', version: 'synthetic-v1' }
const acmeLayers: ExecutionConfigurationLayers = {
  defaults: { model: 'custom-model', configuration: { deliberation: 'low' } },
  profile: { configuration: { deliberation: 'medium' } },
  task: { configuration: { deliberation: 'high' }, extensions: [{ id: 'acme:budget', value: 5, requiredSupport: true }] },
  run: { configuration: { deliberation: 'deep' }, extensions: [{ id: 'acme:budget', value: 9, requiredSupport: true }] },
}

it('public model control exports compose a custom provider for direct and admitted use', async () => {
  const api = await publicPackage('adapter-api')
  const registration: ControlExtension<JsonObject> = { descriptor: acmeContract.controls[1]!, map: value => ({ budget: value }) }
  const nativeSchema = defineStandardSchema<JsonObject>(value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === 1 && (value as JsonObject)['budget'] === 9
    ? { value: { budget: 9 } } : { issues: [{ message: 'invalid native budget' }] })
  const emptySchema = defineStandardSchema<JsonObject>(value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0
    ? { value: {} } : { issues: [{ message: 'expected empty driver configuration' }] })
  const factory: DriverFactory = api.createApiDriverFactory({
    manifest: { id: 'acme-driver', version: '1', kind: 'api', capabilities: [], configurationSchema: emptySchema },
    configurationControls: acmeContract,
    createAdapter: () => { throw new Error('legacy construction not expected') },
    createConfiguredAdapter: async (_legacy: unknown, effective: Awaited<ReturnType<typeof resolveExecutionConfiguration>>) => {
      const native = await mapControlExtensions(effective.extensions, [registration], nativeSchema)
      return { run: async () => ({ status: 'ok', data: { deliberation: effective.configuration['deliberation']!, native }, summary: 'configured' }) }
    },
  })
  const registry = createDriverRegistry(); registry.register(factory)
  const host: ExecutionControlHost = { contract: acmeContract, resolver: acmeResolver }
  const effective = await resolveExecutionConfiguration(acmeLayers, host)
  expect(effective).toEqual({ version: 1, providerId: 'acme', model: 'custom-model', configuration: { deliberation: 'deep' },
    extensions: [{ id: 'acme:budget', value: 9, requiredSupport: true }],
    support: [{ id: 'acme:deliberation', status: 'supported', version: 'synthetic-v1' }, { id: 'acme:budget', status: 'supported', version: 'synthetic-v1' }] })
  const driver = await registry.resolve('acme-driver').createConfigured!({}, effective, { dispatchTool: async () => null, resolveSecret: async () => 'unused' })
  const request: DriverRequest = { key: { namespace: 'consumer', runId: 'run' }, sessionId: 'session', taskId: 'task', prompt: 'synthetic',
    workspace: { id: 'workspace', rootPath: '/synthetic', capabilities: ['read'] }, continuation: 'fresh', context: null, signal: new AbortController().signal }
  expect(await driver.run(request)).toMatchObject({ result: { status: 'ok', data: { deliberation: 'deep', native: { budget: 9 } } } })
  const f = await workflowFixture(false)
  try {
    const definition = { ...f.definition, tasks: [{ ...f.definition.tasks[0]!, driverId: 'acme-driver', configuration: {}, execution: acmeLayers.task }] }
    const snapshot: RunSnapshot = { ...f.snapshot, tasks: [{ taskId: 'a', phase: 'pending', attempt: 0 }] }
    const layers = { defaults: acmeLayers.defaults, profile: acmeLayers.profile, run: acmeLayers.run }
    const result = await admitConfiguredWorkflowRun({ store: f.store, snapshot, definition, drivers: registry, actor: f.principal,
      command: { key: f.key, clientId: 'host', idempotencyKey: 'start', kind: 'start', payload: null },
      hostForTask: () => host, layersForTask: () => layers })
    expect(result.status).toBe('accepted')
    const stored = await f.store.get(f.key)
    expect(stored?.executionConfigurations).toEqual([{ taskId: 'a', driverId: 'acme-driver', driverVersion: '1', configuration: effective }])
  } finally { await f.close() }
})

it('coverage documentation distinguishes unknown support and CLI trust boundaries', async () => {
  const task = { model: 'unknown-model', extensions: [{ id: 'acme:budget', value: 9 }] }
  await expect(resolveExecutionConfiguration({ task }, { contract: acmeContract, resolver: acmeResolver })).rejects.toThrow()
  const permitted = { contract: acmeContract, resolver: acmeResolver, allowUnverified: () => true }
  expect((await resolveExecutionConfiguration({ task }, permitted)).support).toEqual([{ id: 'acme:budget', status: 'unverified', version: 'synthetic-v1' }])
  await expect(resolveExecutionConfiguration({ task: { ...task, extensions: [{ id: 'acme:budget', value: 9, requiredSupport: true }] } }, permitted)).rejects.toThrow()
  await expect(resolveExecutionConfiguration({ task }, { ...permitted, resolver: () => ({ status: 'unsupported', version: 'synthetic-v1' }) })).rejects.toThrow()
  // CLI qualification and OS confinement require native/host evidence; the
  // versioned builder promises only argv and cannot authorize execution policy.
  const cli = await publicPackage('adapter-cli')
  expect(cli.buildCliModelArguments(cli.CODEX_TRAITS, { version: 1, providerId: 'codex', executorVersion: '0.162.1', configuration: {}, extensions: [], support: [] }, '0.162.1'))
    .toEqual(['exec', '--json', '--skip-git-repo-check'])
  expect(() => cli.buildCliModelArguments(cli.CODEX_TRAITS, { version: 1, providerId: 'codex', executorVersion: 'unknown', configuration: {}, extensions: [], support: [] }, 'unknown')).toThrow()
})

it('public model control custom trait preserves native scope and no-shell invocation', async () => {
  const cli = await publicPackage('adapter-cli')
  const contract = { ...acmeContract, controls: [acmeContract.controls[0]!] }
  const traits = { executorId: 'acme-cli', command: 'synthetic.exe', args: ['execute', '--json'], promptDelivery: 'stdin',
    output: { payload: 'single-object', resultPath: ['answer'] }, modelControls: {
      contract, executorVersions: ['synthetic-cli-v1'], modelFlag: '--engine-model', argumentIndex: 0,
      controlArguments: [{ configurationKey: 'deliberation', flag: '--depth' }], conflictingExtraArgs: ['--engine-model', '--depth'],
    } }
  const effective = await resolveExecutionConfiguration({ task: { model: 'custom-model', configuration: { deliberation: 'deep' } } },
    { contract, resolver: acmeResolver, executorVersion: 'synthetic-cli-v1' })
  const calls: { command: string; args: readonly string[]; options: Record<string, unknown>; stdin: string[] }[] = []
  const spawner = { spawn(command: string, args: readonly string[], options: Record<string, unknown>) {
    const stdin: string[] = []; calls.push({ command, args, options, stdin })
    return { pid: undefined, settled: true, done: Promise.resolve({ exitCode: 0, stdout: '{"answer":"synthetic result"}', stderr: '' }),
      writeStdin: (chunk: string) => { stdin.push(chunk) }, endStdin: () => {}, killTree: () => {} }
  } }
  const adapter = cli.createCliExecutorAdapter(traits, { spawner, executorVersion: 'synthetic-cli-v1', inheritEnv: ['PATH'], env: { OPENAI_API_KEY: '' } })
  const request = { prompt: 'synthetic prompt', workspace: { id: 'workspace', rootPath: '/synthetic', capabilities: ['read'] }, executionConfiguration: effective }
  expect(await adapter.run(request)).toMatchObject({ status: 'ok', summary: 'synthetic result' })
  expect(calls).toHaveLength(1)
  expect(calls[0]).toMatchObject({ command: 'synthetic.exe', args: ['--engine-model', 'custom-model', '--depth', 'deep', 'execute', '--json'],
    options: { allowShellFallback: false, inheritEnv: ['PATH'], env: { OPENAI_API_KEY: '' } }, stdin: ['synthetic prompt'] })
  await expect(adapter.run({ ...request, executionConfiguration: { ...effective, executorVersion: 'unknown' } })).rejects.toThrow()
  expect(calls).toHaveLength(1)
})
