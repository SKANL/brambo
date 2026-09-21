import { BramboError, BRAMBO_ERROR_CODES } from '@brambodev/contracts'
import type { ProvenanceTarget } from './index.ts'
import { hashTarget } from './index.ts'

export type ReviewSeverity = 'blocker' | 'warning' | 'suggestion'
export type ReviewCausality = 'introduced' | 'behavior-activated' | 'worsened' | 'pre-existing' | 'base-only' | 'unknown'
export type ReviewEvidenceKind = 'diff' | 'test' | 'command' | 'manual'

export interface ReviewEvidence {
  readonly kind: ReviewEvidenceKind
  readonly detail: string
}

export interface ReviewFinding {
  readonly id: string
  readonly severity: ReviewSeverity
  readonly causality: ReviewCausality
  readonly summary: string
  readonly paths: readonly string[]
  readonly evidence: readonly ReviewEvidence[]
}

export interface ReviewReport {
  readonly version: 1
  readonly targetHash: string
  readonly findings: readonly ReviewFinding[]
  readonly createdAt: string
}

const invalid = (message: string): BramboError => new BramboError(BRAMBO_ERROR_CODES.provenanceInvalid, message)
const BLOCKING_CAUSALITIES = new Set<ReviewCausality>(['introduced', 'behavior-activated', 'worsened'])

export function validateReviewReport(report: ReviewReport, target: ProvenanceTarget): ReviewReport {
  if (report.version !== 1) throw invalid('unsupported review report version')
  if (report.targetHash !== hashTarget(target)) throw invalid('review report target does not match current content')
  if (!/^\d{4}-\d{2}-\d{2}T/.test(report.createdAt)) throw invalid('review report createdAt must be an ISO timestamp')
  const ids = new Set<string>()
  for (const finding of report.findings) {
    if (!finding.id || ids.has(finding.id)) throw invalid(`review finding id is empty or duplicated: ${finding.id}`)
    if (!finding.summary.trim()) throw invalid(`review finding '${finding.id}' has no summary`)
    if (!Array.isArray(finding.paths)) throw invalid(`review finding '${finding.id}' paths must be an array`)
    if (!Array.isArray(finding.evidence) || finding.evidence.length === 0) throw invalid(`review finding '${finding.id}' requires evidence`)
    ids.add(finding.id)
  }
  return report
}

/** Only causal findings proven against this target can block delivery. */
export function reviewReportAllowsDelivery(report: ReviewReport, target: ProvenanceTarget): boolean {
  validateReviewReport(report, target)
  return !report.findings.some((finding) => finding.severity === 'blocker' && BLOCKING_CAUSALITIES.has(finding.causality))
}
