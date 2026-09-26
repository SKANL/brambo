import type { ApiProviderError, ApiProviderErrorCategory } from '@brambodev/contracts'

const REDACTED = '[REDACTED]'
const PROVIDER_ID = /^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$/
const ERROR_CATEGORIES: ReadonlySet<ApiProviderErrorCategory> = new Set([
  'invalid-request', 'authentication', 'authorization', 'quota', 'rate-limit', 'timeout', 'unavailable', 'protocol', 'tool-failure', 'cancelled', 'unknown',
])

export interface ProviderFailureInput {
  readonly providerId?: string
  readonly category?: ApiProviderErrorCategory
  readonly message?: string
  readonly status?: number
  readonly providerCode?: string
  readonly requestId?: string
  readonly retryAfter?: number
  readonly requestAccepted?: boolean
  readonly headers?: unknown
  readonly body?: unknown
  readonly secrets?: readonly string[]
}

function ownValue(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  return descriptor?.enumerable && 'value' in descriptor ? descriptor.value : undefined
}

function redactText(value: string, secrets: readonly string[]): string {
  return secrets.reduce((result, secret) => secret.length === 0 ? result : result.split(secret).join(REDACTED), value)
}

function secretKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
  return normalized === 'authorization' || normalized === 'xauthorization' ||
    normalized === 'apikey' || normalized === 'xapikey' ||
    normalized === 'accesstoken' || normalized === 'xaccesstoken' ||
    normalized === 'token' || normalized === 'xtoken' ||
    normalized === 'authtoken' || normalized === 'xauthtoken'
}

function redact(value: unknown, secrets: readonly string[], seen: WeakMap<object, unknown>): unknown {
  if (typeof value === 'string') return redactText(value, secrets)
  if (value === null || typeof value !== 'object') return value

  const prior = seen.get(value)
  if (prior !== undefined) return prior

  if (Array.isArray(value)) {
    const copy: unknown[] = []
    seen.set(value, copy)
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      if (descriptor !== undefined && 'value' in descriptor) copy[index] = redact(descriptor.value, secrets, seen)
    }
    return copy
  }

  const copy: Record<string, unknown> = {}
  seen.set(value, copy)
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor === undefined || !('value' in descriptor)) continue
    Object.defineProperty(copy, key, {
      configurable: true,
      enumerable: true,
      value: secretKey(key) ? REDACTED : redact(descriptor.value, secrets, seen),
      writable: true,
    })
  }
  return copy
}

/** Returns a detached diagnostic-safe copy without reading accessors or inheriting prototype values. */
export function redactProviderMetadata(value: unknown, secrets: readonly string[]): unknown {
  const configuredSecrets = secrets.filter((secret): secret is string => typeof secret === 'string' && secret.length > 0)
  return redact(value, configuredSecrets, new WeakMap())
}

function safeText(value: unknown, secrets: readonly string[]): string | undefined {
  return typeof value === 'string' && value.length > 0 ? redactText(value, secrets) : undefined
}

function safeStatus(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599 ? value : undefined
}

function safeRetryAfter(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

/** Produces only contract-approved error fields; provider headers and bodies are deliberately discarded. */
export function normalizeProviderError(input: ProviderFailureInput): ApiProviderError {
  const values = input !== null && typeof input === 'object' ? input : {}
  const secretsValue = ownValue(values, 'secrets')
  const secrets = Array.isArray(secretsValue)
    ? secretsValue.filter((secret): secret is string => typeof secret === 'string' && secret.length > 0)
    : []
  const categoryValue = ownValue(values, 'category')
  const category = typeof categoryValue === 'string' && ERROR_CATEGORIES.has(categoryValue as ApiProviderErrorCategory)
    ? categoryValue as ApiProviderErrorCategory
    : 'unknown'
  const providerId = safeText(ownValue(values, 'providerId'), secrets)
  const message = safeText(ownValue(values, 'message'), secrets)
  const normalized: { -readonly [K in keyof ApiProviderError]: ApiProviderError[K] } = {
    category,
    providerId: providerId === undefined || providerId === REDACTED || !PROVIDER_ID.test(providerId) ? 'unknown' : providerId,
    message: message === undefined || message === REDACTED ? 'Provider request failed' : message,
  }
  const status = safeStatus(ownValue(values, 'status'))
  const providerCode = safeText(ownValue(values, 'providerCode'), secrets)
  const requestId = safeText(ownValue(values, 'requestId'), secrets)
  const retryAfter = safeRetryAfter(ownValue(values, 'retryAfter'))
  const requestAccepted = ownValue(values, 'requestAccepted')
  if (status !== undefined) normalized.status = status
  if (providerCode !== undefined) normalized.providerCode = providerCode
  if (requestId !== undefined) normalized.requestId = requestId
  if (retryAfter !== undefined) normalized.retryAfter = retryAfter
  if (typeof requestAccepted === 'boolean') normalized.requestAccepted = requestAccepted
  return Object.freeze(normalized)
}
