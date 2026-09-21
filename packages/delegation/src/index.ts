import { BramboError, BRAMBO_ERROR_CODES } from '@brambodev/contracts'
import type { DelegationHandler, DelegationRecord, DelegationRequest } from '@brambodev/contracts'

export interface DelegationRegistry<T = unknown, R = unknown> {
  delegate(request: DelegationRequest<T>, handler: DelegationHandler<T, R>, signal?: AbortSignal): Promise<DelegationRecord<T, R>>
  get(id: string): DelegationRecord<T, R> | undefined
}

export function createDelegationRegistry<T = unknown, R = unknown>(): DelegationRegistry<T, R> {
  const records = new Map<string, DelegationRecord<T, R>>()
  return {
    get: (id) => records.get(id),
    async delegate(request, handler, signal) {
      if (!request.id.trim() || records.has(request.id)) throw new BramboError(BRAMBO_ERROR_CODES.orchestrationInvalid, `delegation id is empty or already exists: ${request.id}`)
      records.set(request.id, { ...request, status: 'running' })
      try {
        const result = await handler.execute(request, signal ?? new AbortController().signal)
        const record = { ...request, status: 'succeeded' as const, result }
        records.set(request.id, record)
        return record
      } catch (error) {
        const record = { ...request, status: signal?.aborted ? 'cancelled' as const : 'failed' as const, error }
        records.set(request.id, record)
        return record
      }
    },
  }
}
