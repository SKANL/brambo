#!/usr/bin/env node
import { runBrambo } from '../src/run.ts'

// `brambo run ... | head` must not crash: a closed stdout pipe surfaces as an
// async EPIPE error on the stream, which we treat as a graceful exit.
process.stdout?.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE') process.exit(0)
})

const argv = process.argv.slice(2)
// This binary is the host: only explicitly wired official packages are registered.
// A configured credential source never becomes part of argv, a profile, or diagnostics.
const apiRequested = argv.some((token) => token === '--executor-profile' || token.startsWith('--executor-profile='))
const apiRegistry = apiRequested
  ? (await import('../src/api-bootstrap.ts')).createOfficialApiExecutorRegistry({
      ...(process.env.OPENAI_API_KEY ? { openai: { credential: () => process.env.OPENAI_API_KEY ?? '' } } : {}),
      ...(process.env.ANTHROPIC_API_KEY ? { anthropic: { credential: () => process.env.ANTHROPIC_API_KEY ?? '' } } : {}),
    })
  : undefined

process.exitCode = await runBrambo(argv, apiRegistry === undefined ? {} : { apiRegistry })
