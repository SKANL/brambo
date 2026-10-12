---
'@brambodev/adapter-api': patch
'@brambodev/environment': patch
---

`ExecutorRegistry.create(selection, options)` now types `options` as `Omit<ExecutorProviderCreateOptions, 'selection'>`, so callers no longer repeat the selection (`registry.create(selection, { credential })`). Passing the full options object still type-checks.
