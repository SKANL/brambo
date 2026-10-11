import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import type {
  DriverFactory,
  DriverServices,
  EffectiveExecutionConfiguration,
  ExecutionControlContract,
  ExecutionControlHost,
  ExecutionConfigurationLayers,
  ExecutorAdapter,
  JsonObject,
  JsonValue,
  RunRequest,
  ArtifactManifest,
  ArtifactProvider,
  ClaimResult,
  DriverManifest,
  DriverOutcome,
  ExecutionDriver,
  Lease,
  RunStore,
  RuntimeRequest,
  WorkspaceHandle,
} from '@brambodev/contracts'
import { defineStandardSchema } from '@brambodev/contracts'
import { describe, expect, it, vi } from 'vitest'
import { createLocalExecutionRuntime } from '../src/runtime.ts'
import type { LeaseScheduler } from '../src/renewal.ts'

function deferred<T>() {
  let resolvePromise!: (value: T) => void
  const promise = new Promise<T>((resolveValue) => { resolvePromise = resolveValue })
  return { promise, resolve: resolvePromise }
}

function makeRequest(options: {
  workspaceId?: string
  taskId?: string
  runId?: string
  signal?: AbortSignal
} = {}): RuntimeRequest {
  const workspaceId = options.workspaceId ?? 'workspace-a'
  const taskId = options.taskId ?? 'task-a'
  return {
    key: { namespace: 'tenant-a', runId: options.runId ?? 'run-a' },
    sessionId: 'session-a',
    taskId,
    prompt: 'Run the task',
    workspace: { namespace: 'tenant-a', workspaceId, revision: 'sha256:source' },
    context: {},
    continuation: 'fresh',
    signal: options.signal ?? new AbortController().signal,
  }
}

function makeLease(request: RuntimeRequest): Lease {
  return {
    namespace: request.key.namespace,
    ownerId: 'child-worker',
    token: `token-${request.taskId}`,
    expiresAt: Date.now() + 60_000,
    epochs: {
      [`task:${request.key.runId}:${request.taskId}`]: 1,
      [`workspace:${request.workspace.workspaceId}`]: 2,
    },
  }
}

function makeStore(options: {
  valid?: RunStore['valid']
  renew?: RunStore['renew']
} = {}) {
  return {
    valid: vi.fn(options.valid ?? (async () => true)),
    renew: vi.fn(options.renew ?? (async (lease) => ({ status: 'acquired' as const, lease }))),
    release: vi.fn(async () => undefined),
  } as unknown as RunStore & {
    valid: ReturnType<typeof vi.fn>
    renew: ReturnType<typeof vi.fn>
    release: ReturnType<typeof vi.fn>
  }
}

function makeDriver(run: ExecutionDriver['run']): ExecutionDriver {
  const manifest: DriverManifest = {
    id: 'runtime-test-driver',
    version: '1.0.0',
    kind: 'custom',
    capabilities: [],
    configurationSchema: {} as DriverManifest['configurationSchema'],
  }
  return { manifest, run }
}

function makeScheduler() {
  let callback: (() => Promise<void>) | undefined
  const cancel = vi.fn()
  const schedule: LeaseScheduler = {
    every: vi.fn((_milliseconds, next) => {
      callback = next
      return cancel
    }),
  }
  return {
    schedule,
    cancel,
    async tick() {
      expect(callback, 'runtime should register lease renewal').toBeDefined()
      await callback?.()
    },
  }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'brambo-runtime-test-'))
  const rootDir = join(root, 'runtime-root')
  const publishedDirectory = join(root, 'published')
  await mkdir(rootDir)
  await mkdir(publishedDirectory)
  await writeFile(join(publishedDirectory, 'keep.txt'), 'caller-owned')

  const materialized: WorkspaceHandle[] = []
  const stagedDirectories: string[] = []
  const artifacts: ArtifactProvider & {
    materialize: ReturnType<typeof vi.fn>
    stage: ReturnType<typeof vi.fn>
    publish: ReturnType<typeof vi.fn>
  } = {
    async manifest(ref) { return { revision: ref.revision, entries: [] } },
    async read() { return new Uint8Array() },
    materialize: vi.fn(async (ref, directory) => {
      await expect(access(directory)).rejects.toMatchObject({ code: 'ENOENT' })
      await mkdir(directory, { mode: 0o700 })
      await writeFile(join(directory, 'seed.txt'), ref.workspaceId)
      const handle = { id: ref.workspaceId, rootPath: directory, capabilities: ['read', 'write'] as const }
      materialized.push(handle)
      return handle
    }),
    stage: vi.fn(async (_namespace, directory) => {
      stagedDirectories.push(directory)
      return { revision: 'sha256:staged', entries: [] } satisfies ArtifactManifest
    }),
    publish: vi.fn(async () => undefined),
  }
  return { root, rootDir, publishedDirectory, materialized, stagedDirectories, artifacts }
}

const success = (): DriverOutcome => ({ result: { status: 'ok', data: { completed: true }, summary: 'done' } })

describe('createLocalExecutionRuntime', () => {
  it('executes in a fresh private materialization, stages only after success, and leaves publication to its caller', async () => {
    const f = await fixture()
    try {
      const request = makeRequest()
      const store = makeStore()
      const scheduler = makeScheduler()
      let executionRoot = ''
      const driver = makeDriver(async (driverRequest) => {
        executionRoot = driverRequest.workspace.rootPath
        await writeFile(join(executionRoot, 'result.txt'), 'task-output')
        return success()
      })

      const runtime = createLocalExecutionRuntime({
        rootDir: f.rootDir,
        artifacts: f.artifacts,
        store,
        schedule: scheduler.schedule,
      })
      const inputLease = makeLease(request)
      const result = await runtime.execute(driver, request, inputLease)

      expect(executionRoot).not.toBe(f.publishedDirectory)
      expect(executionRoot).not.toBe(f.rootDir)
      expect(dirname(executionRoot)).not.toBe(f.rootDir)
      expect(basename(dirname(executionRoot))).toMatch(/^\.brambo-runtime-/)
      expect(relative(resolve(f.rootDir), resolve(executionRoot)).startsWith('..')).toBe(false)
      expect(f.artifacts.materialize).toHaveBeenCalledWith(request.workspace, executionRoot)
      expect(f.artifacts.stage).toHaveBeenCalledWith(request.workspace.namespace, executionRoot)
      expect(result.workspace).toEqual({ ...request.workspace, revision: result.staged.revision })
      expect(result.publicationLease).toEqual(inputLease)
      expect(f.artifacts.publish).not.toHaveBeenCalled()
      expect(store.release).not.toHaveBeenCalled()
      await expect(access(executionRoot)).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(readFile(join(f.publishedDirectory, 'keep.txt'), 'utf8')).resolves.toBe('caller-owned')
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  it('rejects a child lease scoped to another workspace before materializing or dispatching', async () => {
    const f = await fixture()
    try {
      const request = makeRequest()
      const store = makeStore()
      const driver = makeDriver(vi.fn(async () => success()))
      const runtime = createLocalExecutionRuntime({ rootDir: f.rootDir, artifacts: f.artifacts, store })
      const wrongLease = {
        ...makeLease(request),
        epochs: {
          [`task:${request.key.runId}:${request.taskId}`]: 1,
          'workspace:someone-else': 2,
        },
      }

      await expect(runtime.execute(driver, request, wrongLease)).rejects.toThrow(/lease.*scope/i)
      expect(store.valid).not.toHaveBeenCalled()
      expect(f.artifacts.materialize).not.toHaveBeenCalled()
      expect(driver.run).not.toHaveBeenCalled()
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  it('revalidates lease ownership after materialization before dispatching the driver', async () => {
    const f = await fixture()
    const finishMaterialization = deferred<void>()
    try {
      const request = makeRequest()
      const materializationStarted = deferred<void>()
      const originalMaterialize = f.artifacts.materialize.getMockImplementation() as ArtifactProvider['materialize'] | undefined
      const materialize = f.artifacts.materialize
      materialize.mockImplementation(async (ref, directory) => {
        materializationStarted.resolve()
        await finishMaterialization.promise
        return originalMaterialize!(ref, directory)
      })
      const valid = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(false)
      const store = makeStore({ valid })
      const scheduler = makeScheduler()
      const driver = makeDriver(vi.fn(async () => success()))
      const runtime = createLocalExecutionRuntime({
        rootDir: f.rootDir,
        artifacts: f.artifacts,
        store,
        schedule: scheduler.schedule,
      })
      const execution = runtime.execute(driver, request, makeLease(request))
      const firstBoundary = await Promise.race([
        materializationStarted.promise.then(() => 'materialization-started' as const),
        execution.then(() => 'execution-finished' as const, (error: unknown) => { throw error }),
      ])
      expect(firstBoundary).toBe('materialization-started')
      finishMaterialization.resolve()

      await expect(execution).rejects.toThrow(/lease/i)
      expect(valid).toHaveBeenCalledTimes(3)
      expect(driver.run).not.toHaveBeenCalled()
      expect(f.artifacts.stage).not.toHaveBeenCalled()
      expect(f.artifacts.publish).not.toHaveBeenCalled()
    } finally {
      finishMaterialization.resolve()
      await rm(f.root, { recursive: true, force: true })
    }
  })

  it('withholds the staged result if the lease becomes invalid during staging', async () => {
    const f = await fixture()
    const finishStaging = deferred<void>()
    try {
      const request = makeRequest()
      const stagingStarted = deferred<void>()
      const originalStage = f.artifacts.stage.getMockImplementation() as ArtifactProvider['stage'] | undefined
      f.artifacts.stage.mockImplementation(async (namespace, directory) => {
        stagingStarted.resolve()
        await finishStaging.promise
        return originalStage!(namespace, directory)
      })
      const valid = vi.fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
      const store = makeStore({ valid })
      const driver = makeDriver(async () => success())
      const runtime = createLocalExecutionRuntime({ rootDir: f.rootDir, artifacts: f.artifacts, store })
      const execution = runtime.execute(driver, request, makeLease(request))

      await stagingStarted.promise
      finishStaging.resolve()
      await expect(execution).rejects.toThrow(/lease/i)
      expect(valid).toHaveBeenCalledTimes(5)
      expect(f.artifacts.stage).toHaveBeenCalledTimes(1)
      expect(f.artifacts.publish).not.toHaveBeenCalled()
    } finally {
      finishStaging.resolve()
      await rm(f.root, { recursive: true, force: true })
    }
  })

  it('aborts the driver on irreversible lease loss and does not stage or publish', async () => {
    const f = await fixture()
    try {
      const request = makeRequest()
      const store = makeStore({ renew: async () => ({ status: 'contended' }) })
      const scheduler = makeScheduler()
      const started = deferred<AbortSignal>()
      const finish = deferred<DriverOutcome>()
      const driver = makeDriver(async (driverRequest) => {
        started.resolve(driverRequest.signal)
        return finish.promise
      })
      const runtime = createLocalExecutionRuntime({
        rootDir: f.rootDir,
        artifacts: f.artifacts,
        store,
        schedule: scheduler.schedule,
      })
      const execution = runtime.execute(driver, request, makeLease(request))
      const signal = await started.promise

      try {
        await scheduler.tick()
        expect(signal.aborted).toBe(true)
      } finally {
        finish.resolve({ result: { status: 'cancelled', data: null, summary: 'stopped', errors: [{ message: 'lease lost' }] } })
      }

      await expect(execution).rejects.toThrow(/lease|cancel/i)
      expect(f.artifacts.stage).not.toHaveBeenCalled()
      expect(f.artifacts.publish).not.toHaveBeenCalled()
      expect(store.release).not.toHaveBeenCalled()
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  it('drains an in-flight renewal and returns its latest child lease after staging', async () => {
    const f = await fixture()
    try {
      const request = makeRequest()
      const initial = makeLease(request)
      const renewed = { ...initial, token: 'token-renewed', expiresAt: Date.now() + 120_000, epochs: { ...initial.epochs } }
      const renewalResult = deferred<ClaimResult>()
      const renewalStarted = deferred<void>()
      const driverStarted = deferred<void>()
      const finishDriver = deferred<void>()
      const store = makeStore({ renew: async () => { renewalStarted.resolve(); return renewalResult.promise } })
      const scheduler = makeScheduler()
      const driver = makeDriver(async () => {
        driverStarted.resolve()
        await finishDriver.promise
        return success()
      })
      const runtime = createLocalExecutionRuntime({
        rootDir: f.rootDir,
        artifacts: f.artifacts,
        store,
        schedule: scheduler.schedule,
      })
      const execution = runtime.execute(driver, request, initial)
      await driverStarted.promise
      const tick = scheduler.tick()
      await renewalStarted.promise

      let settled = false
      void execution.then(() => { settled = true }, () => { settled = true })
      finishDriver.resolve()
      await Promise.resolve()
      expect(settled).toBe(false)
      renewalResult.resolve({ status: 'acquired', lease: renewed })
      await tick

      const result = await execution
      expect(result.publicationLease).toMatchObject({ token: 'token-renewed' })
      expect(result.publicationLease.epochs).toEqual(initial.epochs)
      expect(store.release).not.toHaveBeenCalled()
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  it('keeps the workspace until driver handback after cancellation, then cleans it without staging', async () => {
    const f = await fixture()
    try {
      const controller = new AbortController()
      const request = makeRequest({ signal: controller.signal })
      const store = makeStore()
      const started = deferred<WorkspaceHandle>()
      const aborted = deferred<void>()
      const finish = deferred<DriverOutcome>()
      const driver = makeDriver(async (driverRequest) => {
        started.resolve(driverRequest.workspace)
        driverRequest.signal.addEventListener('abort', () => aborted.resolve(), { once: true })
        if (driverRequest.signal.aborted) aborted.resolve()
        return finish.promise
      })
      const runtime = createLocalExecutionRuntime({ rootDir: f.rootDir, artifacts: f.artifacts, store })
      const execution = runtime.execute(driver, request, makeLease(request))
      const workspace = await started.promise
      let settled = false
      void execution.then(() => { settled = true }, () => { settled = true })

      controller.abort(new Error('caller requested cancellation'))
      await aborted.promise
      await Promise.resolve()
      expect(settled).toBe(false)
      await expect(readFile(join(workspace.rootPath, 'seed.txt'), 'utf8')).resolves.toBe(request.workspace.workspaceId)

      finish.resolve({ result: { status: 'cancelled', data: null, summary: 'cancelled', errors: [{ message: 'aborted' }] } })
      await expect(execution).resolves.toMatchObject({
        outcome: { result: { status: 'cancelled' } },
        workspace: request.workspace, staged: { revision: request.workspace.revision, entries: [] },
        publicationLease: { token: `token-${request.taskId}` },
      })
      await expect(access(workspace.rootPath)).rejects.toMatchObject({ code: 'ENOENT' })
      expect(f.artifacts.stage).not.toHaveBeenCalled()
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  it.each(['failed', 'cancelled'] as const)('does not stage a %s driver result', async (status) => {
    const f = await fixture()
    try {
      const request = makeRequest()
      const runtime = createLocalExecutionRuntime({ rootDir: f.rootDir, artifacts: f.artifacts, store: makeStore() })
      const providerError = { category: 'protocol', providerId: 'openai', message: 'not-for-persistence',
        failurePhase: 'provider-response', status: 200, requestAccepted: true }
      const driver = makeDriver(async () => ({ result: { status,
        data: status === 'failed' ? { providerError } : null, summary: status, errors: [{ message: status }] } }))

      const execution = runtime.execute(driver, request, makeLease(request))
      if (status === 'cancelled') {
        await expect(execution).resolves.toMatchObject({ outcome: { result: { status: 'cancelled' } }, workspace: request.workspace })
      } else {
        await expect(execution).resolves.toMatchObject({
          outcome: { result: { status: 'failed', data: { providerError } } },
          workspace: request.workspace,
          staged: { revision: request.workspace.revision, entries: [] },
          publicationLease: { token: `token-${request.taskId}` },
        })
      }
      expect(f.artifacts.stage).not.toHaveBeenCalled()
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  it('gives independent runtime executions different paths while both drivers are active', async () => {
    const f = await fixture()
    try {
      const firstRequest = makeRequest({ workspaceId: 'workspace-a', taskId: 'task-a' })
      const secondRequest = makeRequest({ workspaceId: 'workspace-b', taskId: 'task-b' })
      const bothStarted = deferred<void>()
      const finish = deferred<void>()
      const paths: string[] = []
      const driver = makeDriver(async (driverRequest) => {
        paths.push(driverRequest.workspace.rootPath)
        if (paths.length === 2) bothStarted.resolve()
        await finish.promise
        await writeFile(join(driverRequest.workspace.rootPath, 'result.txt'), driverRequest.taskId)
        return success()
      })
      const store = makeStore()
      const options = { rootDir: f.rootDir, artifacts: f.artifacts, store }
      const firstRuntime = createLocalExecutionRuntime(options)
      const secondRuntime = createLocalExecutionRuntime(options)
      const first = firstRuntime.execute(driver, firstRequest, makeLease(firstRequest))
      const second = secondRuntime.execute(driver, secondRequest, makeLease(secondRequest))

      try {
        await bothStarted.promise
        expect(paths).toHaveLength(2)
        expect(new Set(paths).size).toBe(2)
        expect(new Set(await Promise.all(paths.map((path) => readFile(join(path, 'seed.txt'), 'utf8'))))).toEqual(new Set([
          firstRequest.workspace.workspaceId,
          secondRequest.workspace.workspaceId,
        ]))
      } finally {
        finish.resolve()
      }
      await Promise.all([first, second])
      expect(new Set(f.stagedDirectories).size).toBe(2)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })
})

it.each(['native', 'reconstructed'] as const)('offers %s continuation transport to negotiation and preserves its context and binding', async (mode) => {
  const f = await fixture()
  try {
    const scheduler = makeScheduler()
    const runtime = createLocalExecutionRuntime({ rootDir: f.rootDir, artifacts: f.artifacts, store: makeStore(), schedule: scheduler.schedule })
    const capability = mode === 'native' ? 'native-continuation' : 'context-reconstruction'
    const request: RuntimeRequest = { ...makeRequest(), continuation: mode, context: { events: [{ cursor: 1, payload: 'authorized-evidence' }], artifacts: [{ revision: 'sha256:source' }] }, ...(mode === 'native' ? { binding: { driverId: 'runtime-test-driver', driverVersion: '1.0.0', providerId: 'vendor', accountRef: 'account-ref', nativeSessionId: 'native-session', compatibility: { format: 'v1' } } } : {}) }
    let invoked = false
    const driver = makeDriver(async received => {
      invoked = true
      expect(received.key).toEqual(request.key)
      expect(received.sessionId).toBe(request.sessionId)
      expect(received.context).toEqual(request.context)
      expect(received.binding).toEqual(request.binding)
      expect(received.continuation).toBe(mode)
      return success()
    })
    await runtime.execute(driver, request, makeLease(request))
    expect(invoked).toBe(true)
    expect(runtime.capabilities).toContain(capability)
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

// Resolve each public package root from its own manifest; do not import private
// source paths or add production dependencies for this workspace-only proof.
async function publicPackage(name: string) {
  const packageRoot = resolve(import.meta.dirname, '../../', name)
  const metadata = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  const entry = createRequire(join(packageRoot, 'package.json')).resolve(metadata.name)
  const source = resolve(dirname(dirname(entry)), metadata.exports['.']['brambo-source'])
  return import(pathToFileURL(source).href)
}
const configurationControls: ExecutionControlContract = { providerId: 'acme-api', requiresModel: true,
  configurationSchema: defineStandardSchema<JsonObject>(value => ({ value: value as JsonObject })),
  controls: [{ id: 'acme:deliberation', configurationKey: 'deliberation', schema: defineStandardSchema<JsonValue>(value => ({ value: value as JsonValue })) }],
}
function configuration(): EffectiveExecutionConfiguration {
  return { version: 1, providerId: 'acme-api', model: 'fixture-model', configuration: { deliberation: 'deep' }, extensions: [], support: [{ id: 'acme:deliberation', status: 'supported', version: 'fixture-v1' }] }
}

it('runtime configuration resists caller mutation before workspace materialization', async () => {
  const f = await fixture()
  try {
    const entered = deferred<void>(), release = deferred<void>()
    const materialize = f.artifacts.materialize.getMockImplementation()! as ArtifactProvider['materialize']
    f.artifacts.materialize.mockImplementation(async (ref, directory) => { entered.resolve(); await release.promise; return materialize(ref, directory) })
    const effective: EffectiveExecutionConfiguration = { ...configuration(), extensions: [{ id: 'fixture:nested', value: { levels: ['initial'] } }], support: [...configuration().support, { id: 'fixture:nested', status: 'supported', version: 'fixture-v1' }] }
    let received: EffectiveExecutionConfiguration | undefined
    const runtime = createLocalExecutionRuntime({ rootDir: f.rootDir, artifacts: f.artifacts, store: makeStore(), schedule: makeScheduler().schedule })
    const request = { ...makeRequest(), executionConfiguration: effective }
    const pending = runtime.execute(makeDriver(async input => { received = input.executionConfiguration; return success() }), request, makeLease(request))
    await entered.promise
    ;(effective.configuration as Record<string, JsonValue>).deliberation = 'mutated'
    ;((effective.extensions[0]!.value as JsonObject).levels as JsonValue[])[0] = 'mutated'
    release.resolve()
    await pending
    expect(received?.configuration).toEqual({ deliberation: 'deep' })
    expect(Object.isFrozen(received)).toBe(true)
    expect(Object.isFrozen(received?.configuration)).toBe(true)
    expect(received?.extensions[0]?.value).toEqual({ levels: ['initial'] })
    expect(Object.isFrozen((received?.extensions[0]?.value as JsonObject).levels)).toBe(true)
    expect(runtime.capabilities).toEqual(['native-continuation', 'context-reconstruction'])
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

it('configured custom driver forwards resolved controls through actual runtime configuration', async () => {
  const f = await fixture()
  try {
    const { createApiDriverFactory } = await publicPackage('adapter-api') as { createApiDriverFactory(options: { manifest: DriverManifest; createAdapter: () => ExecutorAdapter; configurationControls: ExecutionControlContract; createConfiguredAdapter: (legacy: unknown, effective: EffectiveExecutionConfiguration, services: DriverServices) => ExecutorAdapter }): DriverFactory }
    const { createDriverRegistry, resolveExecutionConfiguration } = await publicPackage('orchestration') as { createDriverRegistry(): { register(factory: DriverFactory): void; resolve(id: string): DriverFactory }; resolveExecutionConfiguration(layers: ExecutionConfigurationLayers, host: ExecutionControlHost): Promise<EffectiveExecutionConfiguration> }
    const resolver = vi.fn(async () => ({ status: 'supported' as const, version: 'fixture-v1' }))
    const effective = await resolveExecutionConfiguration({ task: { model: 'fixture-model', configuration: { deliberation: 'deep' } } }, { contract: configurationControls, resolver })
    let received: RunRequest | undefined
    const run = vi.fn(async (input: RunRequest) => { received = input; return { status: 'ok' as const, data: null, summary: 'ok' } })
    const createConfiguredAdapter = vi.fn<(legacy: unknown, effective: EffectiveExecutionConfiguration, services: DriverServices) => ExecutorAdapter>(() => ({ run }))
    const registry = createDriverRegistry()
    registry.register(createApiDriverFactory({ manifest: { id: 'acme-driver', version: '1', kind: 'api', capabilities: [], configurationSchema: defineStandardSchema(() => ({ value: { normalized: true } })) }, createAdapter: () => ({ run }), configurationControls, createConfiguredAdapter }))
    const services: DriverServices = { dispatchTool: async () => null, resolveSecret: async () => 'fixture' }
    const factory = registry.resolve('acme-driver')
    expect(factory.createConfigured).toBeTypeOf('function')
    const driver = await factory.createConfigured!({ raw: true }, effective, services)
    const runtime = createLocalExecutionRuntime({ rootDir: f.rootDir, artifacts: f.artifacts, store: makeStore(), schedule: makeScheduler().schedule })
    const request = { ...makeRequest(), executionConfiguration: effective }
    await runtime.execute(driver, request, makeLease(request))
    expect(received?.executionConfiguration?.configuration).toEqual({ deliberation: 'deep' })
    expect(Object.isFrozen(received?.executionConfiguration)).toBe(true)
    expect(createConfiguredAdapter).toHaveBeenCalledWith({ normalized: true }, effective, services)
    expect(resolver).toHaveBeenCalledTimes(1)
    run.mockClear()
    const mismatch = { ...request, executionConfiguration: { ...effective, model: 'different' } }
    await expect(runtime.execute(driver, mismatch, makeLease(mismatch))).rejects.toThrow()
    expect(run).not.toHaveBeenCalled()
    expect(resolver).toHaveBeenCalledTimes(1)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

it('runtime configuration rejects malformed controls before store or artifact I/O', async () => {
  const f = await fixture()
  try {
    const store = makeStore(), run = vi.fn(async () => success())
    const runtime = createLocalExecutionRuntime({ rootDir: f.rootDir, artifacts: f.artifacts, store, schedule: makeScheduler().schedule })
    const invalid = { ...makeRequest(), executionConfiguration: { ...configuration(), configuration: { deliberation: () => 'invalid' } } } as unknown as RuntimeRequest
    await expect(runtime.execute(makeDriver(run), invalid, makeLease(invalid))).rejects.toThrow()
    const getter = vi.fn(() => { throw new Error('synthetic-secret') })
    const accessor = Object.defineProperty(makeRequest(), 'executionConfiguration', { enumerable: true, get: getter })
    await expect(runtime.execute(makeDriver(run), accessor, makeLease(accessor))).rejects.toThrow()
    expect(getter).not.toHaveBeenCalled()
    expect(store.valid).not.toHaveBeenCalled()
    expect(f.artifacts.materialize).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

it.each(['openai', 'anthropic'] as const)('configured %s API composition reaches native fake transport through resolver and runtime configuration', async name => {
  const f = await fixture()
  try {
    const api = await publicPackage('adapter-api')
    const orchestration = await publicPackage('orchestration')
    const native = await publicPackage(`adapter-${name}`)
    const contract: ExecutionControlContract = name === 'openai' ? native.OPENAI_CONTROL_CONTRACT : native.ANTHROPIC_CONTROL_CONTRACT
    const bodies: JsonObject[] = []
    const transport = vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify(name === 'openai'
        ? { id: 'fixture-response', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }] }
        : { id: 'fixture-message', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }))
    })
    const provider = (name === 'openai' ? native.createOpenAIProvider : native.createAnthropicProvider)({ credential: () => 'fixture-credential', transport })
    const resolver = vi.fn(async () => ({ status: 'supported', version: 'fixture-v1' }))
    const effective = await orchestration.resolveExecutionConfiguration({ task: { model: 'fixture-model', configuration: name === 'openai' ? { reasoningEffort: 'high' } : { effort: 'high' } } }, { contract, resolver })
    const construct = () => provider.create({ selection: { providerId: name, model: 'legacy-model', configuration: {} }, credential: undefined })
    const registry = orchestration.createDriverRegistry()
    registry.register(api.createApiDriverFactory({ manifest: { id: `fixture-${name}`, version: '1', kind: 'api', capabilities: [], configurationSchema: defineStandardSchema(value => ({ value })) }, createAdapter: construct, configurationControls: contract, createConfiguredAdapter: construct }))
    const driver = await registry.resolve(`fixture-${name}`).createConfigured({}, effective, { dispatchTool: async () => null, resolveSecret: async () => 'fixture' })
    const runtime = createLocalExecutionRuntime({ rootDir: f.rootDir, artifacts: f.artifacts, store: makeStore(), schedule: makeScheduler().schedule })
    const request = { ...makeRequest(), executionConfiguration: effective }
    const result = await runtime.execute(driver, request, makeLease(request))
    expect(result.outcome.result.status).toBe('ok')
    expect(bodies[0]?.model).toBe('fixture-model')
    expect(name === 'openai' ? bodies[0]?.reasoning : bodies[0]?.output_config).toEqual({ effort: 'high' })
    expect(transport).toHaveBeenCalledTimes(1)
    expect(resolver).toHaveBeenCalledTimes(1)
    const mismatch = { ...request, executionConfiguration: { ...effective, model: 'different' } }
    await expect(runtime.execute(driver, mismatch, makeLease(mismatch))).rejects.toThrow()
    expect(transport).toHaveBeenCalledTimes(1)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})
