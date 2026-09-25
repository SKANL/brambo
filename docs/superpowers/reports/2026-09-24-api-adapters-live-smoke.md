# API adapter live smoke evidence — 2026-09-24

## Scope and bounds

Executed only with explicitly authorized disposable credentials injected into child process environments. No credential bytes, headers, provider bodies, or prompts are recorded here. Each official adapter was configured for at most four requests, a 60-second deadline, an 80-token output limit, and no hosted web, MCP, or file capability. The OpenCode path permits one CLI invocation.

## Observed results

| Path | Provider/model | Result | Evidence |
| --- | --- | --- | --- |
| Official API adapter | OpenAI / `gpt-5.6-luna` | PASS | The real streaming local-tool test completed: one approved local tool call, nonempty answer, bounded request count, and disposal passed in Vitest. |
| Official API adapter | Anthropic / `claude-haiku-4-5-20251001` | PASS | After the empty `input_json_delta.partial_json` fix in `5c549e3`, the real Messages test completed: approved local tool, nonempty response, bounded request count, and disposal passed. Earlier bounded attempts returned normalized `protocol`; they are not the final result. |
| CLI vendor adapter | OpenCode / `opencode-go/deepseek-v4.1-flash` | PASS | A subsequent bounded public-adapter run returned `status=ok` with a nonempty answer in about 55 seconds, within the 60-second internal deadline. An earlier attempt was inconclusive because its outer automation window ended at 30 seconds. |

## Deterministic harness checks

- `node --test examples/api-adapters-e2e-smoke/smoke.test.mjs`: PASS (1/1).
- `pnpm --filter @brambodev/adapter-openai typecheck`: PASS.
- `pnpm --filter @brambodev/adapter-anthropic typecheck`: PASS.
- `pnpm --filter @brambodev/adapter-anthropic test`: PASS (52/52 deterministic tests).
- Final authorized Anthropic live test: PASS (1/1).
- `pnpm --filter @brambodev/adapter-cli build`: PASS.

## Follow-up

The Anthropic failure was caused by a valid empty `input_json_delta.partial_json` for the zero-argument local tool: the parser accumulated it then rejected `JSON.parse(\"\")`. A regression test now preserves `{}` while malformed nonempty JSON remains rejected. The later OpenCode run used an outer window long enough to observe its bounded result.

These are redacted local smoke outcomes, not evidence that the scheduled GitHub workflow executed. The `api-adapters-live` environment's protection, model variables, and isolated secrets still require operator verification. No provider cost or billing amount was observed, and no terminal native review receipt for the final candidate has been recorded.
