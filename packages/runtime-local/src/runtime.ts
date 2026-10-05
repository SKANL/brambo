import { chmod, lstat, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { BramboError, BRAMBO_ERROR_CODES, validateLease, validateRuntimeOutcome, validateWorkspaceHandle } from '@brambodev/contracts'
import type { ArtifactProvider, ExecutionDriver, ExecutionRuntime, Lease, RunStore, RuntimeOutcome, RuntimeRequest, WorkspaceHandle } from '@brambodev/contracts'
import { createLeaseRenewalController, intervalLeaseScheduler } from './renewal.ts'
import type { LeaseScheduler } from './renewal.ts'

const DEFAULT_TTL_MS = 30_000
const DEFAULT_RENEWAL_MS = 10_000

export interface LocalExecutionRuntimeOptions {
  /** Caller-owned parent. The runtime creates and removes only private children. */
  readonly rootDir: string
  readonly artifacts: ArtifactProvider
  readonly store: RunStore
  readonly ttlMs?: number
  readonly renewalMs?: number
  readonly schedule?: LeaseScheduler
}

interface DirectoryIdentity {
  readonly dev: number
  readonly ino: number
}

function within(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path === '' || (!path.startsWith('..' + sep) && path !== '..' && !isAbsolute(path))
}

function scopeError(): BramboError {
  return new BramboError(
    BRAMBO_ERROR_CODES.contractLeaseScopeInvalid,
    'execution lease scope does not cover exactly this task and workspace',
  )
}

function assertChildLease(request: RuntimeRequest, lease: Lease): Lease {
  const validated = validateLease(lease)
  const expected = [
    `task:${request.key.runId}:${request.taskId}`,
    `workspace:${request.workspace.workspaceId}`,
  ]
  const actual = Object.keys(validated.epochs)
  if (validated.namespace !== request.key.namespace || request.workspace.namespace !== request.key.namespace ||
      actual.length !== expected.length || expected.some((resource) => !Object.hasOwn(validated.epochs, resource))) {
    throw scopeError()
  }
  return Object.freeze({
    namespace: validated.namespace,
    ownerId: validated.ownerId,
    token: validated.token,
    expiresAt: validated.expiresAt,
    epochs: Object.freeze({ ...validated.epochs }),
  })
}

function abortError(signal: AbortSignal, lost: boolean): Error {
  if (lost) return new Error('lease ownership lost; execution result cannot be published')
  return new Error('execution cancelled; execution result cannot be published', { cause: signal.reason })
}

async function privateContainer(rootDir: string): Promise<{ path: string; identity: DirectoryIdentity }> {
  await mkdir(rootDir, { recursive: true, mode: 0o700 })
  const root = await realpath(rootDir)
  const rootInfo = await lstat(root)
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new Error('runtime root must resolve to a directory')

  const path = await mkdtemp(join(root, '.brambo-runtime-'))
  let identity: DirectoryIdentity | undefined
  try {
    const createdInfo = await lstat(path)
    if (createdInfo.isSymbolicLink() || !createdInfo.isDirectory()) {
      throw new Error('runtime private container was not created as a directory')
    }
    identity = { dev: createdInfo.dev, ino: createdInfo.ino }
    await chmod(path, 0o700)
    const info = await lstat(path)
    const actual = await realpath(path)
    if (info.isSymbolicLink() || !info.isDirectory() || info.dev !== identity.dev || info.ino !== identity.ino || !within(root, actual)) {
      throw new Error('runtime private container failed path verification')
    }
    return { path: actual, identity }
  } catch (error) {
    if (identity !== undefined) await cleanContainer(path, identity, root)
    throw error
  }
}

async function cleanContainer(path: string, identity: DirectoryIdentity, rootDir: string): Promise<void> {
  try {
    const root = await realpath(rootDir)
    const info = await lstat(path)
    const actual = await realpath(path)
    if (info.isSymbolicLink() || !info.isDirectory() || info.dev !== identity.dev || info.ino !== identity.ino ||
        !within(root, actual)) return
    await rm(path, { recursive: true, force: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

async function materializeWorkspace(
  artifacts: ArtifactProvider,
  source: RuntimeRequest['workspace'],
  container: string,
): Promise<WorkspaceHandle> {
  const child = join(container, 'workspace')
  try {
    await lstat(child)
    throw new Error('runtime workspace destination must be absent before materialization')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  const handle = validateWorkspaceHandle(await artifacts.materialize(source, child))
  const info = await lstat(child)
  const actualChild = await realpath(child)
  const actualHandle = await realpath(handle.rootPath)
  if (info.isSymbolicLink() || !info.isDirectory() || resolve(handle.rootPath) !== child ||
      actualChild !== child || actualHandle !== child || !within(container, actualHandle) ||
      handle.id !== source.workspaceId || !handle.capabilities.includes('read') || !handle.capabilities.includes('write')) {
    throw new Error('artifact provider returned a workspace outside the runtime-created destination')
  }
  return handle
}

/**
 * Executes an injected driver against a fresh materialized workspace. Driver
 * settlement is a trusted handback, not OS/process-tree termination evidence;
 * custom same-user drivers are not sandboxed by this runtime.
 */
export function createLocalExecutionRuntime(options: LocalExecutionRuntimeOptions): ExecutionRuntime {
  const rootDir = resolve(options.rootDir)
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
  const renewalMs = options.renewalMs ?? DEFAULT_RENEWAL_MS
  const schedule = options.schedule ?? intervalLeaseScheduler
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || !Number.isFinite(renewalMs) || renewalMs <= 0 || renewalMs >= ttlMs) {
    throw new RangeError('lease renewal interval must be positive and shorter than its TTL')
  }

  return {
    // Generic request transport only, not evidence of provider resumability.
    // The host still negotiates driver/policy support and current native binding.
    capabilities: Object.freeze(['native-continuation', 'context-reconstruction']),
    async execute(driver: ExecutionDriver, request: RuntimeRequest, inputLease: Lease): Promise<RuntimeOutcome> {
      const capturedRequest: RuntimeRequest = {
        ...request,
        key: Object.freeze({ ...request.key }),
        workspace: Object.freeze({ ...request.workspace }),
        signal: request.signal,
      }
      const lease = assertChildLease(capturedRequest, inputLease)
      if (capturedRequest.signal.aborted) throw abortError(capturedRequest.signal, false)
      if (!await options.store.valid(lease)) throw new Error('execution lease is not currently valid')

      const abortController = new AbortController()
      const abortForCaller = (): void => abortController.abort(capturedRequest.signal.reason)
      const renewal = createLeaseRenewalController({
        store: options.store,
        lease,
        ttlMs,
        renewalMs,
        schedule,
        onOwnershipLost: () => abortController.abort(new Error('lease ownership lost')),
      })
      capturedRequest.signal.addEventListener('abort', abortForCaller, { once: true })
      if (capturedRequest.signal.aborted) abortForCaller()

      let container: string | undefined
      let containerIdentity: DirectoryIdentity | undefined
      try {
        const ensureActive = (): void => {
          if (renewal.lost || abortController.signal.aborted) throw abortError(abortController.signal, renewal.lost)
        }

        ensureActive()
        const created = await privateContainer(rootDir)
        container = created.path
        containerIdentity = created.identity
        ensureActive()
        if (!await renewal.validate()) throw abortError(abortController.signal, renewal.lost)
        ensureActive()
        const workspace = await materializeWorkspace(options.artifacts, capturedRequest.workspace, container)
        ensureActive()
        if (!await renewal.validate()) throw abortError(abortController.signal, renewal.lost)
        ensureActive()

        // Never race cancellation against run(): the injected driver must hand
        // back before its runtime-created workspace can be safely removed.
        const outcome = await driver.run({ ...capturedRequest, workspace, signal: abortController.signal })
        ensureActive()
        if (outcome.result.status !== 'ok') throw new Error('driver result is not publishable; expected an ok result')

        // Validate the complete handback before the artifact provider reads it.
        validateRuntimeOutcome({
          outcome,
          staged: { revision: capturedRequest.workspace.revision, entries: [] },
          workspace: capturedRequest.workspace,
          publicationLease: renewal.lease,
        })
        const publicationLease = await renewal.stop()
        await ensureActiveAfterStop(renewal, abortController.signal)
        const staged = await options.artifacts.stage(capturedRequest.workspace.namespace, workspace.rootPath)
        await ensureActiveAfterStop(renewal, abortController.signal)
        const result: RuntimeOutcome = {
          outcome,
          staged,
          workspace: { ...capturedRequest.workspace, revision: staged.revision },
          publicationLease,
        }
        return validateRuntimeOutcome(result)
      } finally {
        await renewal.stop()
        capturedRequest.signal.removeEventListener('abort', abortForCaller)
        if (container !== undefined && containerIdentity !== undefined) {
          await cleanContainer(container, containerIdentity, rootDir)
        }
      }
    },
  }
}

async function ensureActiveAfterStop(
  renewal: ReturnType<typeof createLeaseRenewalController>,
  signal: AbortSignal,
): Promise<void> {
  if (renewal.lost || signal.aborted) throw abortError(signal, renewal.lost)
  const valid = await renewal.validate()
  if (!valid) renewal.markLost()
  if (renewal.lost || signal.aborted) throw abortError(signal, renewal.lost)
}
