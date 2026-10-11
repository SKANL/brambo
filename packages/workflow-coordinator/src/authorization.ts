import type { JsonValue, Principal, WorkflowProtocolOperation } from '@brambodev/contracts'

export type Authorize = (principal: Principal, operation: string, resource: JsonValue) => Promise<boolean>
export type WorkerAllowed = (principal: Principal) => Promise<boolean>

const WORKER_OPERATIONS = new Set<WorkflowProtocolOperation>([
  'commit',
  'claim',
  'renew',
  'release',
  'valid',
  'artifact.publish',
])

export function isWorkerOperation(operation: WorkflowProtocolOperation): boolean {
  return WORKER_OPERATIONS.has(operation)
}

export function isPrincipal(value: unknown): value is Principal {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  try {
    if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const namespace = descriptors['namespace']
    const subject = descriptors['subject']
    if (!namespace || !subject) return false
    const id = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
    return namespace.enumerable === true && 'value' in namespace && typeof namespace.value === 'string' && id.test(namespace.value) &&
      subject.enumerable === true && 'value' in subject && typeof subject.value === 'string' && id.test(subject.value)
  } catch {
    return false
  }
}

export function ownsLease(principal: Principal, lease: { readonly namespace: string; readonly ownerId: string }): boolean {
  return principal.namespace === lease.namespace && principal.subject === lease.ownerId
}

export async function authorizeOperation(
  principal: Principal,
  operation: WorkflowProtocolOperation,
  resource: JsonValue,
  authorize: Authorize,
  workerAllowed: WorkerAllowed,
): Promise<boolean> {
  if (await authorize(principal, operation, resource) !== true) return false
  if (isWorkerOperation(operation) && await workerAllowed(principal) !== true) return false
  return true
}
