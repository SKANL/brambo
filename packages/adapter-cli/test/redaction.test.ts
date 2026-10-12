import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RunRequest } from '@brambodev/contracts'
import { createClaudeCodeAdapter } from '../src/index.ts'
import { FakeSpawner } from './fake-spawner.ts'

const request: RunRequest = {
  prompt: 'do a thing',
  workspace: { id: 'probe', rootPath: join(tmpdir(), 'brambo-probe'), capabilities: ['read', 'write'] },
}

describe('CLI executor failure text redaction', () => {
  it('redacts secret-looking env values and credential patterns from stderr-derived errors', async () => {
    const stderr = 'auth failed with key hunter2-super-secret; Authorization: Bearer abc.def-ghi; token ghp_abcdefghijklmnopqrstuvwxyz0123456789'
    const spawner = new FakeSpawner({ exitCode: 1, stdout: '', stderr })
    const envelope = await createClaudeCodeAdapter({
      spawner,
      env: { ANTHROPIC_API_KEY: 'hunter2-super-secret', LOG_LEVEL: 'debug' },
    }).run(request)

    const text = JSON.stringify(envelope)
    expect(envelope.status).toBe('failed')
    expect(text).not.toContain('hunter2-super-secret')
    expect(text).not.toContain('abc.def-ghi')
    expect(text).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789')
    expect(envelope.errors?.[0]?.message).toContain('auth failed')
    expect(envelope.errors?.[0]?.message).toContain('[REDACTED]')
  })

  it('keeps non-secret env values readable and redacts vendor-reported failure text', async () => {
    const stdout = `${JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'denied for sk-live-abcdefghijklmnop1234 in debug mode' })}\n`
    const spawner = new FakeSpawner({ exitCode: 1, stdout, stderr: '' })
    const envelope = await createClaudeCodeAdapter({ spawner, env: { LOG_LEVEL: 'debug' } }).run(request)

    const text = JSON.stringify(envelope)
    expect(text).not.toContain('sk-live-abcdefghijklmnop1234')
    expect(text).toContain('debug mode')
  })
})
