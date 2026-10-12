---
title: FAQ
audience: Developers evaluating or adopting brambo
prerequisites: None
outcome: Get short, sourced answers to the questions people ask first
scope: Frequently asked questions about the 0.5.x SDK
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# FAQ

## Is brambo an operating-system sandbox?

No. CLI adapters run ordinary child processes with your privileges; Claude Code is launched with its permission prompts disabled. Isolation comes from the environment you run brambo in and from a sandbox provider that can prove its controls. See [Security boundaries](../explanation/security-boundaries).

## Do I need the CLI to use brambo?

No. The SDK is the product; `@brambodev/session` does everything `brambo run` does except argument parsing, JSON output and exit codes. The CLI is a thin binding documented in the [CLI appendix](../how-to/run-cli).

## Does brambo install Claude Code, Codex or OpenCode?

No. Vendor executors are installed and signed in separately. For hosted models, use the OpenAI or Anthropic API providers with a credential your host injects.

## How do I cancel or time out a run?

Pass `onInterrupt` to `runSession` and wire it to your own `AbortSignal`; `runSession` has no `signal` option and sets no timeout. See [Cancellation, timeouts and retries](../guides/cancellation-timeouts-retries).

## Does brambo retry failed runs?

No. CLI runs are never retried and the official API providers make one attempt per request. The durable engine retries a task only when its effect journal proves the attempt was safe.

## Where are workspaces created, and who deletes them?

Under `<cwd>/.brambo/workspaces` by default. They are never deleted automatically; use `removeLocalWorkspace` or `removeWorktree`, which only remove directories brambo holds an ownership record for.

## Can a memory entry be overwritten?

No. Memory is append-only. Add a new entry with `supersedes`; the older entry remains readable. Note that no brambo package consumes the memory providers yet; your host wires them in.

## Why does missing usage not show as zero?

Zero is a measurement. brambo reports typed absence (`BRAMBO_USAGE_NO_SURFACE`, `BRAMBO_USAGE_NOT_OBSERVED`) when an executor has no usage surface or brambo has not observed one.

## Which Node version should I use?

Published packages support Node.js `>=20`, except `@brambodev/workflow-store-sqlite`, which needs `>=24.15.0`. Repository development needs Node.js `>=24`. See [Compatibility](./compatibility).

## Why did configuration not fall back to the default?

A missing layer is absent, but an existing unreadable or invalid document is `BRAMBO_CONFIGURATION_UNUSABLE`. Silent fallback would run a different executor than the document selected.

## Can I run durable workflows across several machines?

Yes, through `workflow-coordinator` and `workflow-remote`, with one authoritative store behind the coordinator. The SQLite store is for one host; shared network mounts and clustering are not claimed.

## Where should I start?

[Your first session](../tutorials/first-session) to embed, [Your first durable workflow](../tutorials/durable-workflow) to orchestrate, [Write an ExecutorProvider](../guides/third-party-executor-providers) to extend.
