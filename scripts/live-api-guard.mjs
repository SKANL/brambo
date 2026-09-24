const integer = (value, min, max) => /^\d+$/.test(value ?? '') && Number(value) >= min && Number(value) <= max

/** Refuse before importing providers or launching a child process. */
export function planLiveApiRun(env) {
  if (env.BRAMBO_RUN_LIVE_API_TESTS !== '1') return { run: false, reason: 'Skipped: set BRAMBO_RUN_LIVE_API_TESTS=1 to authorize live API calls.' }
  for (const name of ['OPENAI_API_KEY', 'OPENAI_MODEL', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL']) {
    if (!env[name]?.trim()) return { run: false, reason: `Skipped: ${name} is required for both-provider live coverage.` }
  }
  if (!integer(env.BRAMBO_LIVE_API_MAX_REQUESTS, 2, 4)) return { run: false, reason: 'Skipped: BRAMBO_LIVE_API_MAX_REQUESTS must be an integer from 2 to 4.' }
  if (!integer(env.BRAMBO_LIVE_API_TIMEOUT_MS, 1000, 60000)) return { run: false, reason: 'Skipped: BRAMBO_LIVE_API_TIMEOUT_MS must be an integer from 1000 to 60000.' }
  return { run: true, maxRequests: Number(env.BRAMBO_LIVE_API_MAX_REQUESTS), timeoutMs: Number(env.BRAMBO_LIVE_API_TIMEOUT_MS) }
}

export function redactLiveOutput(value, env) {
  let text = String(value)
  for (const key of [env.OPENAI_API_KEY, env.ANTHROPIC_API_KEY]) if (key) text = text.replaceAll(key, '[REDACTED]')
  return text
}
