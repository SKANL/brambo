---
title: FAQ
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Resolve common questions about panda's public boundaries
scope: Frequently asked questions
compatibility: Published packages support Node.js >=20 unless a page states a narrower measured range
translationStatus: original
---
# FAQ

## Is panda an operating-system sandbox?

No. CLI adapters run ordinary child processes. They use the workspace as the working directory, but OS-level isolation is not part of the adapter contract.

## Does panda install Claude Code, Codex, or OpenCode?

No. Vendor executors must be installed and authenticated separately.

## Can a memory entry be overwritten?

No. Memory is append-only. Add a new entry with `supersedes`; the older entry remains readable.

## Why does missing usage not show as zero?

Zero is a measurement. panda reports typed absence when an executor has no usage surface or panda has not observed one.

## Which Node version should I use?

Use Node.js `>=24` for repository development. Published packages are covered from Node.js `>=20`; optional features may have narrower support.

## Why did configuration not fall back to the default?

A missing layer is absent, but an existing unreadable or invalid document is an error. Silent fallback would run a different executor than the document selected.

## Where should I start?

Use `@skanl/panda-session` for SDK composition, `@skanl/panda-cli` for argv/JSON/exit-code binding, and `@skanl/panda-contracts` for a third-party port.
