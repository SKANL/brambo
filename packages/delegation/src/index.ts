import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { BramboError, BRAMBO_ERROR_CODES } from '@brambodev/contracts'
import type { DelegationHandler, DelegationRecord, DelegationRequest, DelegationStateStore } from '@brambodev/contracts'

export interface DelegationRegistry<T = unknown, R = unknown> {
  delegate(request: DelegationRequest<T>, handler: DelegationHandler<T, R>, signal?: AbortSignal): Promise<DelegationRecord<T, R>>
  get(id: string): DelegationRecord<T, R> | undefined
}

export interface DelegationRegistryOptions {
  readonly stateStore?: DelegationStateStore
}

export function createDelegationRegistry<T = unknown, R = unknown>(options: DelegationRegistryOptions = {}): DelegationRegistry<T, R> {
  const records = new Map<string, DelegationRecord<T, R>>()
  for (const record of options.stateStore?.load() ?? []) records.set(record.id, record as DelegationRecord<T, R>)
  const persist = () => options.stateStore?.save([...records.values()])
  return {
    get: (id) => records.get(id),
    async delegate(request, handler, signal) {
      if (!request.id.trim() || records.has(request.id)) throw new BramboError(BRAMBO_ERROR_CODES.orchestrationInvalid, `delegation id is empty or already exists: ${request.id}`)
      records.set(request.id, { ...request, status: 'running' })
      persist()
      try {
        const result = await handler.execute(request, signal ?? new AbortController().signal)
        const record = { ...request, status: 'succeeded' as const, result }
        records.set(request.id, record)
        persist()
        return record
      } catch (error) {
        const record = { ...request, status: signal?.aborted ? 'cancelled' as const : 'failed' as const, error }
        records.set(request.id, record)
        persist()
        return record
      }
    },
  }
}

export function createJsonlDelegationStateStore(filePath: string): DelegationStateStore & { readonly filePath: string } {
  return {
    filePath,
    load() {
      let source: string
      try { source = readFileSync(filePath, 'utf8') } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
        throw error
      }
      let latest: DelegationRecord[] = []
      for (const [index, line] of source.split(/\r?\n/).filter(Boolean).entries()) {
        try {
          const parsed: unknown = JSON.parse(line)
          if (!Array.isArray(parsed)) throw new Error('snapshot must be an array')
          latest = parsed as DelegationRecord[]
        } catch (error) {
          throw new Error(`invalid delegation snapshot at line ${index + 1}`, { cause: error })
        }
      }
      return latest
    },
    save(records) {
      mkdirSync(dirname(filePath), { recursive: true })
      appendFileSync(filePath, `${JSON.stringify(records)}\n`, 'utf8')
    },
  }
}
