import { describe, expect, it } from 'vitest'
import { normalizeProviderError, redactProviderMetadata } from '../src/index.ts'

describe('provider metadata redaction', () => {
  it('redacts authorization, nested API keys, and configured secrets', () => {
    expect(redactProviderMetadata({ Authorization: 'Bearer sk-secret', nested: { api_key: 'sk-secret' } }, ['sk-secret'])).toEqual({
      Authorization: '[REDACTED]',
      nested: { api_key: '[REDACTED]' },
    })
  })

  it('redacts normalized credential header aliases without configured secrets', () => {
    expect(redactProviderMetadata({
      'x-api-key': 'key-value',
      'X_AUTH_TOKEN': 'token-value',
      token_count: 42,
      nested: { 'X-Access-Token': 'access-value', tokens_used: 7 },
    }, [])).toEqual({
      'x-api-key': '[REDACTED]',
      X_AUTH_TOKEN: '[REDACTED]',
      token_count: 42,
      nested: { 'X-Access-Token': '[REDACTED]', tokens_used: 7 },
    })
  })

  it('never exposes a configured secret in normalized errors or diagnostics', () => {
    const error = normalizeProviderError({
      providerId: 'openai',
      message: 'Bearer sk-live',
      failurePhase: 'transport',
      requestAccepted: false,
      headers: { authorization: 'Bearer sk-live' },
      secrets: ['sk-live'],
    })

    expect(error).toMatchObject({ failurePhase: 'transport', requestAccepted: false })
    expect(JSON.stringify(error)).not.toContain('sk-live')
    expect(error).not.toHaveProperty('headers')
  })

  it('drops unsupported failure phases instead of preserving provider-controlled text', () => {
    const error = normalizeProviderError({ providerId: 'openai', failurePhase: 'provider message with secret' as never })

    expect(error).not.toHaveProperty('failurePhase')
    expect(JSON.stringify(error)).not.toContain('provider message with secret')
  })
})
