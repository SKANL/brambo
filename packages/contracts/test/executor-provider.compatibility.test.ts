import { describe, expect, it } from 'vitest'
import type { ExecutorAdapter, ResultEnvelope, RunRequest } from '../src'

describe('ExecutorAdapter compatibility', () => {
  it('keeps the executor port transport-neutral', async () => {
    const adapter: ExecutorAdapter = {
      run: async (request: RunRequest): Promise<ResultEnvelope> => {
        expect(request.workspace.id).toBe('workspace-1')
        return { status: 'ok', data: null, summary: 'complete' }
      },
    }

    const result = await adapter.run({
      prompt: 'inspect',
      workspace: { id: 'workspace-1', rootPath: '/workspace', capabilities: ['read'] },
    })

    expect(result).toMatchObject({ status: 'ok', summary: 'complete' })
  })
})
