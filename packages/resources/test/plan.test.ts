import { describe, expect, it } from 'vitest'
import { buildReclaimPlan } from '../src/index.ts'
import type { ReclaimCandidate } from '../src/index.ts'

function candidate(overrides: Partial<ReclaimCandidate> & { identity: string }): ReclaimCandidate {
  return {
    verdict: 'reclaimable',
    logicalBytes: 0,
    uniqueBytes: 0,
    ...overrides,
  }
}

describe('buildReclaimPlan', () => {
  it('returns empty totals for no candidates', () => {
    expect(buildReclaimPlan([])).toEqual({
      reclaimable: [],
      needsReview: [],
      totals: {
        logicalBytes: 0,
        uniqueBytes: 0,
        reclaimableUniqueBytes: 0,
        needsReviewUniqueBytes: 0,
      },
    })
  })

  it('separates reclaimable worktrees from those a human must decide', () => {
    const plan = buildReclaimPlan([
      candidate({ identity: 'a::w-1', verdict: 'reclaimable', uniqueBytes: 10 }),
      candidate({ identity: 'b::w-2', verdict: 'needs-review', uniqueBytes: 20 }),
    ])
    expect(plan.reclaimable.map((entry) => entry.identity)).toEqual(['a::w-1'])
    expect(plan.needsReview.map((entry) => entry.identity)).toEqual(['b::w-2'])
  })

  it('orders each group by unique bytes, largest first', () => {
    const plan = buildReclaimPlan([
      candidate({ identity: 'a::w-1', uniqueBytes: 5 }),
      candidate({ identity: 'a::w-2', uniqueBytes: 50 }),
      candidate({ identity: 'a::w-3', uniqueBytes: 25 }),
    ])
    expect(plan.reclaimable.map((entry) => entry.uniqueBytes)).toEqual([50, 25, 5])
  })

  it('breaks ties on identity so the plan is deterministic', () => {
    const first = buildReclaimPlan([
      candidate({ identity: 'a::w-2', uniqueBytes: 7 }),
      candidate({ identity: 'a::w-1', uniqueBytes: 7 }),
    ])
    const second = buildReclaimPlan([
      candidate({ identity: 'a::w-1', uniqueBytes: 7 }),
      candidate({ identity: 'a::w-2', uniqueBytes: 7 }),
    ])
    expect(first.reclaimable.map((entry) => entry.identity)).toEqual(['a::w-1', 'a::w-2'])
    expect(second.reclaimable.map((entry) => entry.identity)).toEqual(['a::w-1', 'a::w-2'])
  })

  it('totals logical and unique bytes across every candidate', () => {
    const plan = buildReclaimPlan([
      candidate({ identity: 'a::w-1', verdict: 'reclaimable', logicalBytes: 100, uniqueBytes: 10 }),
      candidate({ identity: 'b::w-2', verdict: 'needs-review', logicalBytes: 200, uniqueBytes: 20 }),
    ])
    expect(plan.totals).toEqual({
      logicalBytes: 300,
      uniqueBytes: 30,
      reclaimableUniqueBytes: 10,
      needsReviewUniqueBytes: 20,
    })
  })

  it('refuses two candidates sharing an identity, because one backup would overwrite the other', () => {
    // Regression for the 2026-11 incident: two worktrees named
    // `v040-integraciones` in different repositories shared a backup key and one
    // working diff was destroyed. A plan that accepts the collision would repeat it.
    expect(() =>
      buildReclaimPlan([
        candidate({ identity: 'a::v040-integraciones' }),
        candidate({ identity: 'a::v040-integraciones' }),
      ]),
    ).toThrow(/share the identity/)
  })

  it('rejects negative or non-finite byte counts instead of reporting less than reality', () => {
    expect(() => buildReclaimPlan([candidate({ identity: 'a::w-1', uniqueBytes: -1 })])).toThrow(
      RangeError,
    )
    expect(() => buildReclaimPlan([candidate({ identity: 'a::w-1', logicalBytes: Number.NaN })])).toThrow(
      RangeError,
    )
  })
})
