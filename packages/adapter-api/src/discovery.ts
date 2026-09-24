import { validateExecutorManifest } from '@brambodev/contracts'
import type { ExecutorProvider } from '@brambodev/contracts'
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
  return typeof value === 'object' && value !== null && 'manifest' in value && 'create' in value && typeof value.create === 'function'
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
    try {
      if (!isProvider(loaded)) {
        reject(packageName, 'invalid-module')
        continue
      }
      provider = loaded
    } catch {
      reject(packageName, 'invalid-module')
      continue
    }

    let manifest: ExecutorProvider['manifest']
    try {
      manifest = validateExecutorManifest(provider.manifest)
    } catch {
      reject(packageName, 'invalid-manifest')
      continue
    }

    if (manifest.packageName !== packageName) {
      reject(packageName, 'package-mismatch')
      continue
    }

    try {
      if (options.registry.list().some((registered) => registered.id === manifest.id)) {
        reject(packageName, 'duplicate-provider-id')
        continue
      }
      options.registry.register(provider)
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
