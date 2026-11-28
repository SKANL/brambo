export { uniqueBytes } from './measure.ts'
export type { FileMeasure } from './measure.ts'

export { classifyWorktree } from './classify.ts'
export type { ReclaimVerdict, WorktreeState } from './classify.ts'

export { reclaimIdentity } from './identity.ts'
export type { ReclaimTarget } from './identity.ts'

export { scanTree } from './scan.ts'
export type { ScanAbsence, ScanMeasurement, ScanOutcome } from './scan.ts'

export { buildReclaimPlan } from './plan.ts'
export type { ReclaimCandidate, ReclaimPlan, ReclaimTotals } from './plan.ts'
