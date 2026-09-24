import { BramboError, BRAMBO_ERROR_CODES, validateExecutorManifest, validateExecutorSelection } from '@brambodev/contracts'
import type { StandardSchemaResult } from '@brambodev/contracts'
import type { ExecutorManifest, ExecutorProvider, ExecutorProviderCreateOptions, ExecutorRegistry, ExecutorSelection } from './types.ts'
import type { ExecutorAdapter } from '@brambodev/contracts'

function selectionInvalid(message: string): never {
  throw new BramboError(BRAMBO_ERROR_CODES.executorProviderSelectionInvalid, message)
}

function validateConfiguration(manifest: ExecutorManifest, configuration: unknown): void {
  let result: StandardSchemaResult<unknown> | Promise<StandardSchemaResult<unknown>>
  try {
    result = manifest.configurationSchema['~standard'].validate(configuration)
  } catch (error) {
    selectionInvalid(`executor provider configuration for '${manifest.id}' is invalid: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (typeof (result as Promise<StandardSchemaResult<unknown>>).then === 'function') {
    selectionInvalid(`executor provider configuration schema for '${manifest.id}' must validate synchronously`)
  }
  if ('issues' in result) {
    const issues = result.issues ?? []
    selectionInvalid('executor provider configuration for ' + manifest.id + ' is invalid: ' + issues.map((entry) => entry.message).join('; '))
  }
}

export function createExecutorRegistry(): ExecutorRegistry {
  const providers = new Map<string, ExecutorProvider>()

  return {
    register(provider: ExecutorProvider): void {
      const manifest = validateExecutorManifest(provider?.manifest)
      if (providers.has(manifest.id)) {
        throw new BramboError(
          BRAMBO_ERROR_CODES.executorProviderDuplicateRegistration,
          `executor provider '${manifest.id}' is already registered`,
        )
      }
      providers.set(manifest.id, provider)
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
      validateConfiguration(manifest, validatedSelection.configuration)
      return provider.create({ ...options, selection: validatedSelection })
    },

    list(): readonly ExecutorManifest[] {
      return [...providers.values()].map((provider) => provider.manifest)
    },
  }
}
