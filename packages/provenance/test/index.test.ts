import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createReceipt, hashSessionEvents, hashTarget, validateReceipt } from '../src/index.ts'

const target = {
  baseRef: 'main',
  paths: [{ path: 'src/index.ts', mode: '100644', sha256: createHash('sha256').update('content').digest('hex') }],
} as const

describe('content-bound receipts', () => {
  it('is stable regardless of object key order', () => {
    expect(hashTarget(target)).toBe(hashTarget({ paths: target.paths, baseRef: target.baseRef }))
  })

  it('validates an unchanged target', () => {
    const receipt = createReceipt(target, 'allow', '2026-09-20T00:00:00.000Z')
    expect(validateReceipt(receipt, target)).toEqual(receipt)
  })

  it('rejects changed bytes and duplicate paths', () => {
    const receipt = createReceipt(target, 'allow')
    expect(() => validateReceipt(receipt, { ...target, paths: [{ ...target.paths[0], sha256: '0'.repeat(64) }] })).toThrow('does not match')
    expect(() => hashTarget({ ...target, paths: [target.paths[0], target.paths[0]] })).toThrow('duplicated')
  })

  it('binds a receipt to the ordered session evidence when supplied', () => {
    const events = [
      { sessionId: 's', sequence: 0, kind: 'session.started' as const, occurredAt: '2026-09-20T00:00:00Z', payload: null },
      { sessionId: 's', sequence: 1, kind: 'session.completed' as const, occurredAt: '2026-09-20T00:00:01Z', payload: null },
    ]
    const receipt = createReceipt(target, 'allow', undefined, events)
    expect(receipt.eventHash).toBe(hashSessionEvents(events))
    expect(validateReceipt(receipt, target, events)).toEqual(receipt)
    expect(() => validateReceipt(receipt, target, [events[0]!, { ...events[1]!, payload: 'changed' }])).toThrow('events do not match')
  })
})
