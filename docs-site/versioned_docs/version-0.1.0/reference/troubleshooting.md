---
title: Troubleshooting
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Diagnose common CLI, provider, and packaging failures
scope: Public troubleshooting guidance
compatibility: Published packages support Node.js >=20 unless a page states a narrower measured range
translationStatus: original
---
# Troubleshooting

Start with the coded error or exit status. Fix the boundary named by the diagnostic instead of editing vendor files by hand.

## The CLI says the executor was not found

Use `claude-code`, `codex`, or `opencode`. Check `--executor` spelling and the resolved configuration layer. The vendor binary still needs separate installation and authentication.

## The CLI reports unusable configuration

Inspect `~/.brambo/config.json` and `<project>/.brambo/config.json`. Confirm readable JSON and a string `executor`. An existing malformed file is not treated as absent.

```bash
brambo run --executor codex "health check"
```

The explicit flag can override a readable value; it does not repair a document brambo cannot read.

## A provider refuses after disposal

Providers are lifecycle-owned. Stop using them after `dispose()` and do not release a handle through a disposed provider. Create a provider for the next owning session.

## A memory store will not open

Check the store format version. Unsupported versions are refused rather than migrated. Confirm the path is usable, then choose a compatible build or a new store according to retention policy.

## A package works in the repository but not in a consumer

Run `pnpm build` and the consumer-install proof. Check exports point to `dist`, the tarball contains declarations, and the consumer does not rely on `brambo-source`.

## The workspace is not isolated

That is expected at the adapter boundary. brambo does not claim OS containment. Restrict vendor permissions and use an OS sandbox when deployment requires one.

## Next step

If behavior still differs from the contract, run the relevant clause suite and report the named violation with package version and environment.
