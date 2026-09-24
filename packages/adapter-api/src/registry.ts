import { BramboError, BRAMBO_ERROR_CODES, validateExecutorManifest, validateExecutorSelection } from '@brambodev/contracts'
import type { StandardSchemaResult } from '@brambodev/contracts'
import type { ExecutorManifest, ExecutorProvider, ExecutorProviderCreateOptions, ExecutorRegistry, ExecutorSelection } from './types.ts'
import type { ExecutorAdapter } from '@brambodev/contracts'

function selectionInvalid(message: string): never {
  throw new BramboError(BRAMBO_ERROR_CODES.executorProviderSelectionInvalid, message)
}

function snapshotManifest(manifest: ExecutorManifest): ExecutorManifest {
  const validate = manifest.configurationSchema['~standard'].validate
  const configurationSchema = Object.freeze({
    '~standard': Object.freeze({ version: 1 as const, validate: validate.bind(manifest.configurationSchema['~standard']) }),
  })

  return Object.freeze({
    id: manifest.id,
    displayName: manifest.displayName,
    contractVersion: manifest.contractVersion,
    packageName: manifest.packageName,
    capabilities: Object.freeze([...manifest.capabilities]),
    configurationSchema,
  })
}

function snapshotProvider(provider: ExecutorProvider, manifest: ExecutorManifest): ExecutorProvider {
  const create = provider.create.bind(provider)
  return Object.freeze({ manifest, create })
}

function validateConfiguration(manifest: ExecutorManifest, configuration: unknown): unknown {
  let result: StandardSchemaResult<unknown> | Promise<StandardSchemaResult<unknown>>
  try {
    result = manifest.configurationSchema['~standard'].validate(configuration)
  } catch {
    selectionInvalid(`executor provider configuration for '${manifest.id}' is invalid`)
  }

  let asynchronous: boolean
  try {
    asynchronous = typeof (result as Promise<StandardSchemaResult<unknown>>).then === 'function'
    if (!asynchronous && (typeof result !== 'object' || result === null || ('issues' in result && result.issues !== undefined) || !('value' in result))) {
      selectionInvalid(`executor provider configuration for '${manifest.id}' is invalid`)
    }
    if (!asynchronous) return (result as { readonly value: unknown }).value
  } catch {
    selectionInvalid(`executor provider configuration for '${manifest.id}' is invalid`)
  }

  void Promise.resolve(result).catch(() => undefined)
  selectionInvalid(`executor provider configuration schema for '${manifest.id}' must validate synchronously`)
}

export function createExecutorRegistry(): ExecutorRegistry {
  const providers = new Map<string, ExecutorProvider>()

  return {
    register(provider: ExecutorProvider): void {
      const manifest = snapshotManifest(validateExecutorManifest(provider?.manifest))
      if (providers.has(manifest.id)) {
        throw new BramboError(
          BRAMBO_ERROR_CODES.executorProviderDuplicateRegistration,
          `executor provider '${manifest.id}' is already registered`,
        )
      }
      providers.set(manifest.id, snapshotProvider(provider, manifest))
    },

    resolve(providerId: string): ExecutorProvider {
      const provider = providers.get(providerId)
      if (provider === undefined) {
        throw new BramboError(BRAMBO_ERROR_CODES.executorProviderUnknown, `executor provider '${providerId}' is unknown`)
      }
      return provider
    },

    create(selection: ExecutorSelection, options: ExecutorProviderCreateOptions): ExecutorAdapter {
      const validatedSelection = validateExecutorSelection(selection)
      const provider = this.resolve(validatedSelection.providerId)
      const manifest = validateExecutorManifest(provider.manifest)
      const offeredCapabilities = new Set(manifest.capabilities)
      for (const capability of validatedSelection.capabilities ?? []) {
        if (!offeredCapabilities.has(capability)) {
          selectionInvalid(`executor provider '${manifest.id}' does not support requested capability '${capability}'`)
        }
      }
      const configuration = validateConfiguration(manifest, validatedSelection.configuration)
      return provider.create({ ...options, selection: { ...validatedSelection, configuration } })
    },

    list(): readonly ExecutorManifest[] {
      return [...providers.values()].map((provider) => provider.manifest)
    },
  }
}
