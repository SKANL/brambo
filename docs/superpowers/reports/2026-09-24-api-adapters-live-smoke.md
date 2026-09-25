# API adapter live smoke evidence — 2026-09-24

## Scope and bounds

Executed only with explicitly authorized disposable credentials injected into child process environments. No credential bytes, headers, provider bodies, or prompts are recorded here. Each official adapter was configured for at most four requests, a 60-second deadline, an 80-token output limit, and no hosted web, MCP, or file capability. The OpenCode path permits one CLI invocation.

## Observed results

| Path | Provider/model | Result | Evidence |
| --- | --- | --- | --- |
| Official API adapter | OpenAI / `gpt-5.6-luna` | PASS | The real streaming local-tool test completed: one approved local tool call, nonempty answer, bounded request count, and disposal passed in Vitest. |
| Official API adapter | Anthropic / `claude-haiku-4-5-20251001` | FAIL | Initial bounded attempts and the omitted-content post-fix attempt returned normalized `protocol`. The final, independently hypothesized zero-argument tool fix completed the real Messages test: approved local tool, nonempty response, bounded request count, and disposal all passed. |
| CLI vendor adapter | OpenCode / `opencode-go/deepseek-v4.1-flash` | INCONCLUSIVE | The single isolated invocation was bounded internally to 60 seconds, but this execution environment terminated the parent command at 30 seconds without a model result. No success claim is made. |

## Deterministic harness checks

- `node --test examples/api-adapters-e2e-smoke/smoke.test.mjs`: PASS (1/1).
- `pnpm --filter @brambodev/adapter-openai typecheck`: PASS.
- `pnpm --filter @brambodev/adapter-anthropic typecheck`: PASS.`n- `pnpm --filter @brambodev/adapter-anthropic test`: PASS (52/52 deterministic tests).`n- Final authorized Anthropic live test: PASS (1/1).
- `pnpm --filter @brambodev/adapter-cli build`: PASS.

## Follow-up

The final root cause was a valid empty `input_json_delta.partial_json` for the zero-argument local tool: the parser accumulated it then rejected `JSON.parse(\"\")`. A regression test now preserves `{}` while malformed nonempty JSON remains rejected. The final bounded Anthropic call passed. OpenCode still needs an execution host whose outer deadline exceeds its 60-second internal deadline; it has not proven an end-to-end answer.