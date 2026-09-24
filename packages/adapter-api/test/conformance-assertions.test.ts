import { describe, expect, it } from 'vitest'
import { assertCleanup, assertRedactedFailure } from '../src/conformance-assertions.ts'

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
})
