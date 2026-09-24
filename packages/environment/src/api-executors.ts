import { BramboError, BRAMBO_ERROR_CODES, validateExecutorSelection } from '@brambodev/contracts'
import type { ExecutorAdapter, ExecutorProviderCreateOptions, ExecutorSelection } from '@brambodev/contracts'
export type { ExecutorProviderCreateOptions } from '@brambodev/contracts'

/** Structural SDK boundary: the environment never imports an API adapter or registry implementation. */
export interface RegisteredApiExecutorRegistry {
  resolve(providerId: string): unknown
  create(selection: ExecutorSelection, options: ExecutorProviderCreateOptions): ExecutorAdapter
}

/** The entire persisted API profile schema. Credentials and provider configuration are host-owned. */
export type ApiExecutorProfile = Pick<ExecutorSelection, 'providerId' | 'model' | 'capabilities'>

export interface ApiExecutorDiagnostic {
  readonly code: string
  readonly providerId?: string
  readonly message: string
  readonly guidance: string
}

export class ApiExecutorSelectionError extends Error {
  readonly code: string
  readonly diagnostic: ApiExecutorDiagnostic

  constructor(diagnostic: ApiExecutorDiagnostic) {
    super(diagnostic.message)
    this.name = 'ApiExecutorSelectionError'
    this.code = diagnostic.code
    this.diagnostic = diagnostic
  }
}

export function validateApiExecutorProfile(value: unknown): ApiExecutorProfile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BramboError(BRAMBO_ERROR_CODES.executorProviderSelectionInvalid, 'API executor profile must be an object')
  }
  const profile = value as Record<string, unknown>
  const unsupported = Object.keys(profile).filter((key) => !['providerId', 'model', 'capabilities'].includes(key))
  if (unsupported.length > 0) {
    // Never print keys or values from an untrusted profile: a key can itself contain a secret.
    throw new BramboError(BRAMBO_ERROR_CODES.executorProviderSelectionInvalid, 'API executor profile contains unsupported fields; only providerId, model, and capabilities are allowed')
  }
  const selection = validateExecutorSelection(profile)
  return Object.freeze({
    providerId: selection.providerId,
    model: selection.model,
    ...(selection.capabilities === undefined ? {} : { capabilities: Object.freeze([...selection.capabilities]) }),
  })
}

/** SDK-first: only a host-registered provider can be selected. */
export function selectRegisteredApiExecutor(
  selection: ApiExecutorProfile,
  registry: RegisteredApiExecutorRegistry | undefined,
  options: ExecutorProviderCreateOptions,
): ExecutorAdapter {
  const profile = validateApiExecutorProfile(selection)
  try {
    if (registry === undefined) throw new BramboError(BRAMBO_ERROR_CODES.executorProviderUnknown, 'provider is not registered')
    registry.resolve(profile.providerId)
  } catch (error) {
    if (!(error instanceof BramboError) || error.code !== BRAMBO_ERROR_CODES.executorProviderUnknown) throw error
    throw new ApiExecutorSelectionError({
      code: BRAMBO_ERROR_CODES.executorProviderUnknown,
      providerId: profile.providerId,
      message: `API executor provider '${profile.providerId}' is not registered`,
      guidance: 'Register an installed provider with the host before selecting this API executor profile.',
    })
  }
  return registry!.create(profile, { ...options, selection: profile })
}
