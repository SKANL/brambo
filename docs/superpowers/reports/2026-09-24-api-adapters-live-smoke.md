# API adapter live smoke evidence — 2026-09-24

## Scope and bounds

Executed only with explicitly authorized disposable credentials injected into child process environments. No credential bytes, headers, provider bodies, or prompts are recorded here. Each official adapter was configured for at most four requests, a 60-second deadline, an 80-token output limit, and no hosted web, MCP, or file capability. The OpenCode path permits one CLI invocation.

## Observed results

| Path | Provider/model | Result | Evidence |
| --- | --- | --- | --- |
| Official API adapter | OpenAI / `gpt-5.6-luna` | PASS | The real streaming local-tool test completed: one approved local tool call, nonempty answer, bounded request count, and disposal passed in Vitest. |
| Official API adapter | Anthropic / `claude-haiku-4-5-20251001` | FAIL | Initial bounded attempts and the one post-fix attempt returned valid Messages SSE sequences but Brambo returned normalized `protocol` before dispatching the local tool. The last sanitized provider request ID was `req_011CfPcxDF1tgJkYKCCnnf6P`. |
| CLI vendor adapter | OpenCode / `opencode-go/deepseek-v4.1-flash` | INCONCLUSIVE | The single authorized invocation produced no model result within the 30-second automation window; only the installed OpenCode plugin warning was observed. No success claim is made. |

## Deterministic harness checks

- `node --test examples/api-adapters-e2e-smoke/smoke.test.mjs`: PASS (1/1).
- `pnpm --filter @brambodev/adapter-openai typecheck`: PASS.
- `pnpm --filter @brambodev/adapter-anthropic typecheck`: PASS.`n- `pnpm --filter @brambodev/adapter-anthropic test`: PASS (51/51 deterministic tests).
- `pnpm --filter @brambodev/adapter-cli build`: PASS.

## Follow-up

A regression test now supports an omitted `message_start.message.content` shape documented by Anthropic, but the single permitted post-fix attempt still failed with `protocol`; that hypothesis was insufficient. No further Anthropic attempt was made. An independent review must trace the remaining parser/normalizer failure from a safely captured fixture. The OpenCode CLI run needs an independently bounded 60-second child-process observation with sanitized lifecycle output; it has not proven an end-to-end answer.