import { createReceipt } from '@brambodev/provenance'
import type { ProvenanceTarget, ReviewReceipt } from '@brambodev/provenance'
import type { ResultEnvelope, SessionEventLog } from '@brambodev/contracts'

export interface SessionReceiptOptions {
  readonly target: ProvenanceTarget
  readonly sessionId: string
  readonly eventLog: SessionEventLog
  readonly result: ReviewReceipt['result']
  readonly issuedAt?: string
}

/** Creates a receipt from the exact event stream owned by the session log. */
export function createSessionReceipt(options: SessionReceiptOptions): ReviewReceipt {
  const events = options.eventLog.read(options.sessionId)
  return createReceipt(options.target, options.result, options.issuedAt, events)
}

/** Convenience predicate for wiring a successful envelope to an allow receipt. */
export function receiptResultForEnvelope(envelope: ResultEnvelope): ReviewReceipt['result'] {
  return envelope.status === 'ok' ? 'allow' : 'deny'
}
