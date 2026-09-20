import { describe, expect, it } from 'vitest'
import { BramboError, BRAMBO_ERROR_CODES } from '../src'

describe('BramboError', () => {
  it('carries a stable code, name and message', () => {
    const error = new BramboError(BRAMBO_ERROR_CODES.kernelManifestInvalid, 'something broke')
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('BRAMBO_KERNEL_MANIFEST_INVALID')
    expect(error.name).toBe('BramboError')
    expect(error.message).toBe('something broke')
  })

  it('exposes codes following the BRAMBO_<DOMAIN>_<REASON> convention', () => {
    for (const code of Object.values(BRAMBO_ERROR_CODES)) {
      expect(code).toMatch(/^BRAMBO_[A-Z]+(_[A-Z]+)+$/)
    }
  })
})
