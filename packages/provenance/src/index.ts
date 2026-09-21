import { createHash } from 'node:crypto'
import { BramboError, BRAMBO_ERROR_CODES } from '@brambodev/contracts'

export interface ProvenancePath {
  readonly path: string
  readonly mode: string
  readonly sha256: string
}

export interface ProvenanceTarget {
  readonly baseRef: string
  readonly paths: readonly ProvenancePath[]
}

export interface ReviewReceipt {
  readonly version: 1
  readonly target: ProvenanceTarget
  readonly targetHash: string
  readonly result: 'allow' | 'deny'
  readonly issuedAt: string
}

const receiptError = (message: string): BramboError => new BramboError(BRAMBO_ERROR_CODES.provenanceInvalid, message)

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
}

function validateTarget(target: ProvenanceTarget): void {
  if (!target.baseRef.trim()) throw receiptError('target baseRef must be non-empty')
  const seen = new Set<string>()
  for (const entry of target.paths) {
    if (!entry.path || seen.has(entry.path)) throw receiptError(`target path is empty or duplicated: ${entry.path}`)
    if (!/^[0-9a-f]{64}$/.test(entry.sha256)) throw receiptError(`invalid sha256 for ${entry.path}`)
    if (!entry.mode) throw receiptError(`mode is required for ${entry.path}`)
    seen.add(entry.path)
  }
}

export function hashTarget(target: ProvenanceTarget): string {
  validateTarget(target)
  return createHash('sha256').update(canonical(target)).digest('hex')
}

export function createReceipt(
  target: ProvenanceTarget,
  result: ReviewReceipt['result'],
  issuedAt = new Date().toISOString(),
): ReviewReceipt {
  const targetHash = hashTarget(target)
  return { version: 1, target, targetHash, result, issuedAt }
}

export function validateReceipt(receipt: ReviewReceipt, currentTarget: ProvenanceTarget): ReviewReceipt {
  if (receipt.version !== 1) throw receiptError('unsupported receipt version')
  if (receipt.result !== 'allow' && receipt.result !== 'deny') throw receiptError('receipt result must be allow or deny')
  if (!/^\d{4}-\d{2}-\d{2}T/.test(receipt.issuedAt)) throw receiptError('receipt issuedAt must be an ISO timestamp')
  const currentHash = hashTarget(currentTarget)
  if (receipt.targetHash !== hashTarget(receipt.target)) throw receiptError('receipt target hash is internally inconsistent')
  if (receipt.targetHash !== currentHash) throw receiptError('receipt target does not match current content')
  return receipt
}
