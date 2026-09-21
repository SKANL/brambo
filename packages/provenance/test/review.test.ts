import { describe, expect, it } from 'vitest'
import { createReceipt, hashTarget, reviewReportAllowsDelivery, validateReviewReport, type ProvenanceTarget, type ReviewReport } from '../src/index.ts'

const target: ProvenanceTarget = { baseRef: 'main', paths: [{ path: 'src/a.ts', mode: '100644', sha256: 'a'.repeat(64) }] }
const report = (causality: ReviewReport['findings'][number]['causality']): ReviewReport => ({
  version: 1,
  targetHash: hashTarget(target),
  createdAt: '2026-09-20T00:00:00Z',
  findings: [{ id: 'f1', severity: 'blocker', causality, summary: 'finding', paths: ['src/a.ts'], evidence: [{ kind: 'test', detail: 'test failure' }] }],
})

describe('review reports', () => {
  it('blocks only findings causally attributable to the reviewed target', () => {
    expect(reviewReportAllowsDelivery(report('introduced'), target)).toBe(false)
    expect(reviewReportAllowsDelivery(report('pre-existing'), target)).toBe(true)
    expect(reviewReportAllowsDelivery(report('base-only'), target)).toBe(true)
  })

  it('rejects reports bound to another target or without evidence', () => {
    expect(() => validateReviewReport({ ...report('introduced'), targetHash: createReceipt(target, 'allow').targetHash.replace(/^./, 'b') }, target)).toThrow(/target does not match/)
    expect(() => validateReviewReport({ ...report('introduced'), findings: [{ ...report('introduced').findings[0]!, evidence: [] }] }, target)).toThrow(/requires evidence/)
  })
})
