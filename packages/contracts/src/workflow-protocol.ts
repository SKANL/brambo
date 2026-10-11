import { BramboError, BRAMBO_ERROR_CODES } from './errors.ts'
import type { JsonValue } from './tool-execution.ts'

export const WORKFLOW_PROTOCOL_VERSION = 1 as const

export const WORKFLOW_PROTOCOL_OPERATIONS = [
  'create',
  'admit',
  'get',
  'receipt',
  'pending',
  'commit',
  'events',
  'claim',
  'renew',
  'release',
  'valid',
  'artifact.manifest',
  'artifact.read',
  'artifact.stage',
  'artifact.publish',
] as const

export type WorkflowProtocolOperation = (typeof WORKFLOW_PROTOCOL_OPERATIONS)[number]
export type ProtocolRequest = {
  readonly version: typeof WORKFLOW_PROTOCOL_VERSION
  readonly operation: WorkflowProtocolOperation
  readonly payload: JsonValue
}
export type ProtocolResponse = {
  readonly version: typeof WORKFLOW_PROTOCOL_VERSION
  readonly status: 'ok' | 'denied' | 'invalid' | 'unavailable'
  readonly payload?: JsonValue
  readonly code?: string
}

const RESPONSE_STATUSES = ['ok', 'denied', 'invalid', 'unavailable'] as const
const operationSet = new Set<string>(WORKFLOW_PROTOCOL_OPERATIONS)

function invalid(message: string): never {
  throw new BramboError(BRAMBO_ERROR_CODES.contractWorkflowProtocolInvalid, `Invalid workflow protocol envelope: ${message}`)
}

function record(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid('expected a plain object')
  const allowed = new Set([...required, ...optional])
  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) invalid('unexpected object field')
    const descriptor = descriptors[key]
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) invalid('fields must be enumerable data properties')
  }
  for (const key of required) if (!Object.hasOwn(value, key)) invalid(`missing ${key}`)
  return value as Record<string, unknown>
}

function json(value: unknown): asserts value is JsonValue {
  const active = new Set<object>()
  const stack: { value: unknown; leave?: boolean }[] = [{ value }]
  while (stack.length > 0) {
    const item = stack.pop()!
    const current = item.value
    if (item.leave) {
      active.delete(current as object)
      continue
    }
    if (current === null || typeof current === 'string' || typeof current === 'boolean') continue
    if (typeof current === 'number') {
      if (!Number.isFinite(current) || Object.is(current, -0)) invalid('number is not lossless JSON')
      continue
    }
    if (typeof current !== 'object') invalid('payload is not JSON')
    if (active.has(current)) invalid('cyclic value')
    const array = Array.isArray(current)
    if (array ? Object.getPrototypeOf(current) !== Array.prototype :
        ![Object.prototype, null].includes(Object.getPrototypeOf(current))) invalid('prototype-bearing value')
    active.add(current)
    stack.push({ value: current, leave: true })
    const descriptors = Object.getOwnPropertyDescriptors(current)
    const keys = Reflect.ownKeys(current)
    if (array && keys.length !== current.length + 1) invalid('sparse or decorated array')
    for (const key of keys) {
      if (array && key === 'length') continue
      if (typeof key !== 'string') invalid('symbol keys are not JSON')
      if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= current.length)) invalid('decorated array')
      const descriptor = descriptors[key]
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) invalid('fields must be enumerable data properties')
      stack.push({ value: descriptor.value })
    }
  }
}

export function validateProtocolRequest(value: unknown): ProtocolRequest {
  const envelope = record(value, ['version', 'operation', 'payload'])
  if (envelope['version'] !== WORKFLOW_PROTOCOL_VERSION) invalid('unsupported version')
  if (typeof envelope['operation'] !== 'string' || !operationSet.has(envelope['operation'])) invalid('unsupported operation')
  json(envelope['payload'])
  return value as ProtocolRequest
}

export function validateProtocolResponse(value: unknown): ProtocolResponse {
  const envelope = record(value, ['version', 'status'], ['payload', 'code'])
  if (envelope['version'] !== WORKFLOW_PROTOCOL_VERSION) invalid('unsupported version')
  if (typeof envelope['status'] !== 'string' || !(RESPONSE_STATUSES as readonly string[]).includes(envelope['status'])) {
    invalid('unsupported status')
  }
  if (Object.hasOwn(envelope, 'payload')) json(envelope['payload'])
  if (Object.hasOwn(envelope, 'code') &&
      (typeof envelope['code'] !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(envelope['code']))) {
    invalid('code must be a bounded lowercase identifier')
  }
  return value as ProtocolResponse
}
