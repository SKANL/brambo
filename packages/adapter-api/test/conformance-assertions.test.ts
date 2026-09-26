import { describe, expect, it } from 'vitest'
import { assertCleanup, assertDeniedToolOutcome, assertRedactedFailure, assertToolFailure } from '../src/conformance-assertions.ts'

const toolFailure = { status: 'failed' as const, data: null, summary: 'failed', errors: [{ message: 'duplicate provider call' }] }
const normalizedToolFailure = { providerId: 'fake', category: 'protocol', message: 'duplicate provider call', requestId: 'request-1' }

describe('provider conformance assertions', () => {
  it('rejects cleanup that leaves an adapter-owned resource behind', () => {
    expect(() => assertCleanup({ owned: ['owned'], observed: ['host'], removed: [] })).toThrow()
  })

  it('rejects cleanup that removes a host-observed resource', () => {
    expect(() => assertCleanup({ owned: ['owned'], observed: ['host'], removed: ['owned', 'host'] })).toThrow()
  })

  it('accepts cleanup of exactly the owned resources', () => {
    expect(() => assertCleanup({ owned: ['owned'], observed: ['host'], removed: ['owned'] })).not.toThrow()
  })

  it('detects a secret inside a nested failure cause', () => {
    const failure = new Error('safe', { cause: { nested: { token: 'sk-sentinel' } } })
    expect(() => assertRedactedFailure(failure, 'sk-sentinel')).toThrow()
  })

  it('accepts a sanitized failure', () => {
    expect(() => assertRedactedFailure(new Error('authentication failed: [REDACTED]'), 'sk-sentinel')).not.toThrow()
  })

  it('rejects a missing failure observation', () => {
    expect(() => assertRedactedFailure(undefined, 'sk-sentinel')).toThrow()
  })

  it('requires the expected normalized tool failure category and request correlation', () => {
    expect(() => assertToolFailure(toolFailure, [normalizedToolFailure], 'protocol', 'request-1')).not.toThrow()
    expect(() => assertToolFailure(toolFailure, [{ ...normalizedToolFailure, category: 'tool-failure' }], 'protocol', 'request-1')).toThrow()
    expect(() => assertToolFailure(toolFailure, [{ ...normalizedToolFailure, requestId: 'wrong-request' }], 'protocol', 'request-1')).toThrow()
  })

  it('requires the normalized tool failure to reach the envelope', () => {
    expect(() => assertToolFailure({ ...toolFailure, errors: [{ message: 'unrelated' }] }, [normalizedToolFailure], 'protocol', 'request-1')).toThrow()
    expect(() => assertToolFailure(toolFailure, [], 'protocol', 'request-1')).toThrow()
  })

  it('requires a denied host outcome to reach the matching provider call', () => {
    expect(() => assertDeniedToolOutcome(['error'], [{ callId: 'call-1', kind: 'error' }], 'call-1')).not.toThrow()
    expect(() => assertDeniedToolOutcome(['error'], [], 'call-1')).toThrow()
    expect(() => assertDeniedToolOutcome(['error'], [{ callId: 'other', kind: 'error' }], 'call-1')).toThrow()
  })
})
