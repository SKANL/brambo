import { BramboError, BRAMBO_ERROR_CODES } from './errors.ts'
import { defineStandardSchema } from './standard-schema.ts'
import type { StandardSchemaIssue, StandardSchemaResult, StandardSchemaV1 } from './standard-schema.ts'
import { isNonEmptyString, isRecord, issue } from './validation.ts'
import type { ExecutorAdapter } from './executor.ts'

export const EXECUTOR_CAPABILITIES = [
  'streaming',
  'local-tools',
  'conversation-state',
  'prompt-caching',
  'extended-thinking',
  'provider-files',
  'remote-mcp',
  'hosted-web-search',
] as const
export type ExecutorCapability = (typeof EXECUTOR_CAPABILITIES)[number]
export interface ExecutorManifest { readonly id: string; readonly displayName: string; readonly contractVersion: '1'; readonly packageName: string; readonly capabilities: readonly ExecutorCapability[]; readonly configurationSchema: StandardSchemaV1<unknown> }
export interface ExecutorSelection { readonly providerId: string; readonly model: string; readonly capabilities?: readonly ExecutorCapability[]; readonly configuration?: unknown }
/** Credentials remain opaque: this contract never reads, validates, or serializes them. */
export interface ExecutorProviderCreateOptions { readonly selection: ExecutorSelection; readonly credential: unknown; readonly toolLoop?: unknown; readonly transport?: unknown; readonly now?: () => number }
export interface ExecutorProvider { readonly manifest: ExecutorManifest; create(options: ExecutorProviderCreateOptions): ExecutorAdapter }
export const API_PROVIDER_ERROR_CATEGORIES = ['invalid-request', 'authentication', 'authorization', 'quota', 'rate-limit', 'timeout', 'unavailable', 'protocol', 'tool-failure', 'cancelled', 'unknown'] as const
export type ApiProviderErrorCategory = (typeof API_PROVIDER_ERROR_CATEGORIES)[number]
/** Safe normalized metadata only; credentials, headers, and payload bodies never belong here. */
export interface ApiProviderError { readonly category: ApiProviderErrorCategory; readonly providerId: string; readonly message: string; readonly status?: number; readonly providerCode?: string; readonly requestId?: string; readonly retryAfter?: number; readonly requestAccepted?: boolean }
/** Provider-reported usage only; no cost or synthetic token values are inferred. */
export interface ApiUsageObservation { readonly providerId: string; readonly model: string; readonly observedAt: string; readonly requestId?: string; readonly inputTokens?: number; readonly outputTokens?: number; readonly cachedInputTokens?: number; readonly reasoningTokens?: number; readonly totalTokens?: number; readonly raw?: Readonly<Record<string, unknown>> }

const ID = /^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$/
const PACKAGE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/
const ISO_TIMESTAMP = /^(\d{4,})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

const caps = (value: unknown, name: string, issues: StandardSchemaIssue[]) => {
  if (!Array.isArray(value) || !value.every((cap) => typeof cap === 'string' && (EXECUTOR_CAPABILITIES as readonly string[]).includes(cap))) issues.push(issue(`'${name}' must be an array of supported executor capabilities`))
  else if (new Set(value).size !== value.length) issues.push(issue(`'${name}' must not contain duplicate capabilities`))
}
const keys = (value: Record<string, unknown>, allowed: readonly string[], issues: StandardSchemaIssue[]) => Object.keys(value).filter((key) => !allowed.includes(key)).forEach((key) => issues.push(issue(`'${key}' is not allowed`)))
const schema = (value: unknown): value is StandardSchemaV1<unknown> => isRecord(value) && isRecord(value['~standard']) && value['~standard']['version'] === 1 && typeof value['~standard']['validate'] === 'function'
const isIsoTimestamp = (value: string) => {
  const match = ISO_TIMESTAMP.exec(value)
  if (!match) return false
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const date = new Date(Date.UTC(year, month - 1, day))
  return Number(hourText) <= 23 && Number(minuteText) <= 59 && Number(secondText) <= 59 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && !Number.isNaN(Date.parse(value))
}
const throwInvalid = (code: typeof BRAMBO_ERROR_CODES.executorProviderManifestInvalid | typeof BRAMBO_ERROR_CODES.executorProviderSelectionInvalid | typeof BRAMBO_ERROR_CODES.executorProviderUsageObservationInvalid | typeof BRAMBO_ERROR_CODES.executorProviderErrorInvalid, label: string, issues: readonly StandardSchemaIssue[]): never => {
  throw new BramboError(code, `${label} is invalid: ${issues.map((entry) => entry.message).join('; ')}`)
}

export function executorManifestIssues(value: unknown): StandardSchemaIssue[] { if (!isRecord(value)) return [issue('executor manifest must be an object')]; const issues: StandardSchemaIssue[] = []; keys(value, ['id', 'displayName', 'contractVersion', 'packageName', 'capabilities', 'configurationSchema'], issues); if (!isNonEmptyString(value.id) || !ID.test(value.id)) issues.push(issue("'id' must be a stable lowercase provider ID")); if (!isNonEmptyString(value.displayName)) issues.push(issue("'displayName' must be a non-empty string")); if (value.contractVersion !== '1') issues.push(issue("'contractVersion' must be '1'")); if (!isNonEmptyString(value.packageName) || !PACKAGE.test(value.packageName)) issues.push(issue("'packageName' must be an npm package name")); caps(value.capabilities, 'capabilities', issues); if (!schema(value.configurationSchema)) issues.push(issue("'configurationSchema' must be a Standard Schema v1 schema")); return issues }
export function executorSelectionIssues(value: unknown): StandardSchemaIssue[] { if (!isRecord(value)) return [issue('executor selection must be an object')]; const issues: StandardSchemaIssue[] = []; keys(value, ['providerId', 'model', 'capabilities', 'configuration'], issues); if (!isNonEmptyString(value.providerId) || !ID.test(value.providerId)) issues.push(issue("'providerId' must be a stable lowercase provider ID")); if (!isNonEmptyString(value.model)) issues.push(issue("'model' must be a non-empty string")); if (value.capabilities !== undefined) caps(value.capabilities, 'capabilities', issues); return issues }
export function validateExecutorManifest(value: unknown): ExecutorManifest { const issues = executorManifestIssues(value); if (issues.length) throwInvalid(BRAMBO_ERROR_CODES.executorProviderManifestInvalid, 'executor provider manifest', issues); return value as ExecutorManifest }
export function validateExecutorSelection(value: unknown): ExecutorSelection { const issues = executorSelectionIssues(value); if (issues.length) throwInvalid(BRAMBO_ERROR_CODES.executorProviderSelectionInvalid, 'executor provider selection', issues); return value as ExecutorSelection }
export function apiUsageObservationIssues(value: unknown): StandardSchemaIssue[] { if (!isRecord(value)) return [issue('API usage observation must be an object')]; const issues: StandardSchemaIssue[] = []; keys(value, ['providerId', 'model', 'observedAt', 'requestId', 'inputTokens', 'outputTokens', 'cachedInputTokens', 'reasoningTokens', 'totalTokens', 'raw'], issues); if (!isNonEmptyString(value.providerId) || !ID.test(value.providerId)) issues.push(issue("'providerId' must be a stable lowercase provider ID")); if (!isNonEmptyString(value.model)) issues.push(issue("'model' must be a non-empty string")); if (!isNonEmptyString(value.observedAt) || !isIsoTimestamp(value.observedAt)) issues.push(issue("'observedAt' must be an ISO timestamp")); for (const key of ['inputTokens', 'outputTokens', 'cachedInputTokens', 'reasoningTokens', 'totalTokens'] as const) if (value[key] !== undefined && (!(typeof value[key] === 'number') || !Number.isFinite(value[key]) || value[key] < 0)) issues.push(issue(`'${key}' must be a non-negative finite number when present`)); if (value.requestId !== undefined && !isNonEmptyString(value.requestId)) issues.push(issue("'requestId' must be a non-empty string when present")); if (value.raw !== undefined && !isRecord(value.raw)) issues.push(issue("'raw' must be an object when present")); return issues }
export function validateApiUsageObservation(value: unknown): ApiUsageObservation { const issues = apiUsageObservationIssues(value); if (issues.length) throwInvalid(BRAMBO_ERROR_CODES.executorProviderUsageObservationInvalid, 'API usage observation', issues); return value as ApiUsageObservation }
export function apiProviderErrorIssues(value: unknown): StandardSchemaIssue[] { if (!isRecord(value)) return [issue('API provider error must be an object')]; const issues: StandardSchemaIssue[] = []; keys(value, ['category', 'providerId', 'message', 'status', 'providerCode', 'requestId', 'retryAfter', 'requestAccepted'], issues); if (typeof value.category !== 'string' || !(API_PROVIDER_ERROR_CATEGORIES as readonly string[]).includes(value.category)) issues.push(issue("'category' must be a supported API provider error category")); if (!isNonEmptyString(value.providerId) || !ID.test(value.providerId)) issues.push(issue("'providerId' must be a stable lowercase provider ID")); if (!isNonEmptyString(value.message)) issues.push(issue("'message' must be a non-empty string")); if (value.status !== undefined && (!(typeof value.status === 'number') || !Number.isInteger(value.status) || value.status < 100 || value.status > 599)) issues.push(issue("'status' must be an HTTP status code when present")); if (value.providerCode !== undefined && !isNonEmptyString(value.providerCode)) issues.push(issue("'providerCode' must be a non-empty string when present")); if (value.requestId !== undefined && !isNonEmptyString(value.requestId)) issues.push(issue("'requestId' must be a non-empty string when present")); if (value.retryAfter !== undefined && (!(typeof value.retryAfter === 'number') || !Number.isFinite(value.retryAfter) || value.retryAfter < 0)) issues.push(issue("'retryAfter' must be a non-negative finite number when present")); if (value.requestAccepted !== undefined && typeof value.requestAccepted !== 'boolean') issues.push(issue("'requestAccepted' must be a boolean when present")); return issues }
export function validateApiProviderError(value: unknown): ApiProviderError { const issues = apiProviderErrorIssues(value); if (issues.length) throwInvalid(BRAMBO_ERROR_CODES.executorProviderErrorInvalid, 'API provider error', issues); return value as ApiProviderError }
export const EXECUTOR_MANIFEST_SCHEMA: StandardSchemaV1<ExecutorManifest> = defineStandardSchema((value): StandardSchemaResult<ExecutorManifest> => { const issues = executorManifestIssues(value); return issues.length ? { issues } : { value: value as ExecutorManifest } })
export const EXECUTOR_SELECTION_SCHEMA: StandardSchemaV1<ExecutorSelection> = defineStandardSchema((value): StandardSchemaResult<ExecutorSelection> => { const issues = executorSelectionIssues(value); return issues.length ? { issues } : { value: value as ExecutorSelection } })
