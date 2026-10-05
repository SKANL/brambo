import { describe, expect, it } from 'vitest'
import { validateProtocolRequest, validateProtocolResponse } from '../src/index.ts'

describe('workflow protocol contracts', () => {
  it('accepts every declared operation with a versioned JSON payload', () => {
    const operations = [
      'create',
      'admit',
      'get',
      'receipt',
      'pending',
      'commit',
      'events',
      'claim',
      'renew',
      'release',
      'valid',
      'artifact.manifest',
      'artifact.read',
      'artifact.stage',
      'artifact.publish',
    ] as const

    for (const operation of operations) {
      const request = { version: 1, operation, payload: { key: { namespace: 'tenant-a', runId: 'run-1' } } }
      expect(validateProtocolRequest(request)).toEqual(request)
    }
  })

  it('rejects unsupported versions, unknown operations, and non-JSON payloads', () => {
    expect(() => validateProtocolRequest({ version: 2, operation: 'get', payload: null })).toThrow()
    expect(() => validateProtocolRequest({ version: 1, operation: 'execute', payload: null })).toThrow()
    expect(() => validateProtocolRequest({ version: 1, operation: 'get', payload: undefined })).toThrow()
  })

  it('rejects extra protocol fields rather than silently accepting caller authority', () => {
    expect(() =>
      validateProtocolRequest({
        version: 1,
        operation: 'claim',
        payload: { resources: ['run:run-1'], ttlMs: 30_000 },
        ownerId: 'victim',
      }),
    ).toThrow()
  })

  it('accepts only versioned responses with declared statuses and JSON payloads', () => {
    for (const status of ['ok', 'denied', 'invalid', 'unavailable'] as const) {
      expect(validateProtocolResponse({ version: 1, status, payload: null })).toEqual({
        version: 1,
        status,
        payload: null,
      })
    }
    expect(() => validateProtocolResponse({ version: 1, status: 'success', payload: null })).toThrow()
    expect(() => validateProtocolResponse({ version: 1, status: 'ok', payload: undefined })).toThrow()
  })
})
