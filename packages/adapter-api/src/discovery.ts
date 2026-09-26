import { EXECUTOR_CAPABILITIES, validateExecutorManifest } from '@brambodev/contracts'
import type { ExecutorProvider, ExecutorProviderCreateOptions } from '@brambodev/contracts'
import type { ExecutorRegistry } from './types.ts'

export interface ExecutorProviderDiscoveryOptions {
  readonly allowlist: readonly string[]
  readonly candidates: readonly string[]
  /** Host-owned loader for already-installed packages; never sourced from persisted configuration. */
  readonly load: (packageName: string) => Promise<unknown>
  readonly registry: ExecutorRegistry
}

export type ExecutorProviderDiscoveryRejectionReason =
  | 'not-allowlisted'
  | 'load-failed'
  | 'invalid-module'
  | 'invalid-manifest'
  | 'package-mismatch'
  | 'duplicate-provider-id'
  | 'registration-failed'

export type ExecutorProviderDiscoveryDiagnostic =
  | { readonly packageName: string; readonly providerId: string; readonly reason: 'accepted' }
  | { readonly packageName: string; readonly reason: ExecutorProviderDiscoveryRejectionReason }

export interface ExecutorProviderDiscoveryResult {
  readonly diagnostics: readonly ExecutorProviderDiscoveryDiagnostic[]
  readonly accepted: readonly Extract<ExecutorProviderDiscoveryDiagnostic, { reason: 'accepted' }>[]
  readonly rejected: readonly Extract<ExecutorProviderDiscoveryDiagnostic, { reason: ExecutorProviderDiscoveryRejectionReason }>[]
}

function isProvider(value: unknown): value is ExecutorProvider {
  return typeof value === 'object' && value !== null && 'manifest' in value && 'create' in value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const MANIFEST_KEYS = ['id', 'displayName', 'contractVersion', 'packageName', 'capabilities', 'configurationSchema'] as const

/** Read potentially stateful module getters once, before handing a plain snapshot to the registry. */
function snapshotManifest(value: unknown): ExecutorProvider['manifest'] {
  if (!isRecord(value) || Object.keys(value).some((key) => !MANIFEST_KEYS.includes(key as typeof MANIFEST_KEYS[number]))) {
    throw new Error('invalid executor manifest shape')
  }
  const { id, displayName, contractVersion, packageName, capabilities, configurationSchema } = value
  const standard = isRecord(configurationSchema) ? configurationSchema['~standard'] : undefined
  let schema: unknown = configurationSchema
  if (isRecord(standard)) {
    const version = standard.version
    const validate = standard.validate
    schema = { '~standard': { version, validate: typeof validate === 'function' ? validate.bind(standard) : validate } }
  }
  return validateExecutorManifest(Object.freeze({
    id, displayName, contractVersion, packageName,
    capabilities: Array.isArray(capabilities) ? Object.freeze([...capabilities]) : capabilities,
    configurationSchema: schema,
  }))
}

/** Opt-in discovery. Only the host may supply candidate names and the installed-package loader. */
export async function discoverExecutorProviders(options: ExecutorProviderDiscoveryOptions): Promise<ExecutorProviderDiscoveryResult> {
  const allowlist = new Set(options.allowlist)
  const diagnostics: ExecutorProviderDiscoveryDiagnostic[] = []
  const accepted: Extract<ExecutorProviderDiscoveryDiagnostic, { reason: 'accepted' }>[] = []
  const rejected: Extract<ExecutorProviderDiscoveryDiagnostic, { reason: ExecutorProviderDiscoveryRejectionReason }>[] = []
  const reject = (packageName: string, reason: ExecutorProviderDiscoveryRejectionReason): void => {
    const diagnostic = { packageName, reason }
    rejected.push(diagnostic)
    diagnostics.push(diagnostic)
  }

  for (const packageName of options.candidates) {
    // No callback or module code runs before this exact host-allowlist comparison.
    if (!allowlist.has(packageName)) {
      reject(packageName, 'not-allowlisted')
      continue
    }

    let loaded: unknown
    try {
      loaded = await options.load(packageName)
    } catch {
      reject(packageName, 'load-failed')
      continue
    }

    let provider: ExecutorProvider
    let packageJson: Record<string, unknown>
    try {
      if (!isRecord(loaded)) {
        reject(packageName, 'invalid-module')
        continue
      }
      const candidatePackageJson = loaded.packageJson
      const candidateProvider = loaded.provider
      if (!isRecord(candidatePackageJson) || !isProvider(candidateProvider)) {
        reject(packageName, 'invalid-module')
        continue
      }
      packageJson = candidatePackageJson
      provider = candidateProvider
    } catch {
      reject(packageName, 'invalid-module')
      continue
    }

    let manifest: ExecutorProvider['manifest']
    let metadata: { readonly name: unknown; readonly executor: Record<string, unknown> }
    let create: ExecutorProvider['create']
    try {
      const brambo = packageJson.brambo
      if (!isRecord(brambo) || !isRecord(brambo.executor)) throw new Error('missing executor metadata')
      const executor = brambo.executor
      metadata = { name: packageJson.name, executor: {
        id: executor.id, contractVersion: executor.contractVersion, packageName: executor.packageName,
        capabilities: Array.isArray(executor.capabilities) ? [...executor.capabilities] : executor.capabilities,
      } }
      manifest = snapshotManifest(provider.manifest)
      create = provider.create
      if (typeof create !== 'function') throw new Error('invalid provider factory')
    } catch {
      reject(packageName, 'invalid-manifest')
      continue
    }

    if (metadata.name !== packageName || metadata.executor.packageName !== packageName || manifest.packageName !== packageName) {
      reject(packageName, 'package-mismatch')
      continue
    }

    const declaredCapabilities = metadata.executor.capabilities
    if (metadata.executor.id !== manifest.id || metadata.executor.contractVersion !== manifest.contractVersion ||
      !Array.isArray(declaredCapabilities) || declaredCapabilities.length !== manifest.capabilities.length ||
      new Set(declaredCapabilities).size !== declaredCapabilities.length ||
      !declaredCapabilities.every((capability) => typeof capability === 'string' &&
        (EXECUTOR_CAPABILITIES as readonly string[]).includes(capability) &&
        (manifest.capabilities as readonly string[]).includes(capability))) {
      reject(packageName, 'invalid-manifest')
      continue
    }

    try {
      if (options.registry.list().some((registered) => registered.id === manifest.id)) {
        reject(packageName, 'duplicate-provider-id')
        continue
      }
      options.registry.register(Object.freeze({ manifest, create: (createOptions: ExecutorProviderCreateOptions) => create.call(provider, createOptions) }))
    } catch {
      reject(packageName, 'registration-failed')
      continue
    }

    const diagnostic = { packageName, providerId: manifest.id, reason: 'accepted' as const }
    accepted.push(diagnostic)
    diagnostics.push(diagnostic)
  }

  return { diagnostics, accepted, rejected }
}
