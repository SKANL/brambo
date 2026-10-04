# @brambodev/orchestration

Provider-agnostic task graph execution for brambo. The package owns deterministic dependency scheduling, bounded concurrency, cancellation, and explicit terminal states. It does not select or invoke a model or vendor.

## Explicit execution drivers

`createDriverRegistry()` accepts host-installed `DriverFactory` objects only.
Configuration selects a registered ID; it never loads a module or discovers a
plugin. Duplicate IDs and unknown IDs refuse. Registry manifests and their
capability arrays are frozen snapshots, not caller-owned mutable declarations.

Always `await registry.resolve(id).create(configuration, services)`. The registry
awaits synchronous or asynchronous Standard Schema v1 validation, supplies only
validated output to the factory, and refuses invalid, throwing or malformed
validation results with a generic error that does not echo configuration or
schema diagnostics. Factories, validators and services are trusted host code;
registration is not a hostile-JavaScript sandbox. Constructed drivers must match
the registered identity, version, kind and capability set.

`negotiateCapabilities({ driver, runtime, policy, required, optional })` returns
the driver/runtime/policy intersection as `effective` and unsupported optional
requests as `degraded`. Unsupported required requests refuse. Arbitrary custom
and namespaced capability IDs remain visible; configuration-specific restrictions
must be reflected in the runtime/policy inputs by the host.

`createCliDriverFactory({ id, createAdapter })` wraps an injected existing
executor for `claude-code`, `codex` or `opencode` without importing an adapter or
changing its argv. Its version identifies the wrapper contract, not the installed
vendor executable. Supply `{}` as configuration and configure the adapter in the
host's factory closure. The wrapper declares structured result envelopes and the
existing executor cancellation contract only. It does not declare streaming,
interception, native continuation or durable context reconstruction. A
`reconstructed` request forwards its already assembled prompt unchanged; durable
context assembly belongs to the continuation composition layer. Native requests
refuse. Neither a native ID in output nor an aborted signal fabricates a binding
or confirmed process termination; publication requires runtime ownership proof.

The public `runDriverContractSuite` from contracts actively probes a supplied
driver/request for manifest, asynchronous result-envelope and advertised
cancellation conformance. Use an isolated safe fixture. Timeouts bound reporting,
not cleanup or termination; the host owns probe resources. This suite does not
prove every vendor-specific capability or authorize execution.
