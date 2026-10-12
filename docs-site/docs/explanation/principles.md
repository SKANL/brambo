---
title: Design principles
audience: Developers evaluating brambo and port authors
prerequisites: Node.js >=20
outcome: Predict how any brambo package behaves at its edges
scope: Cross-cutting rules enforced in 0.5.x source and tests
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# Design principles

Five rules recur in every package. Knowing them lets you predict how an unfamiliar part of brambo behaves when something is missing, malformed, concurrent or old. Each rule below names where it is enforced, because a principle that is not tested is a preference.

## Fail closed

When brambo cannot prove something is safe or valid, it refuses with a coded error instead of guessing a default.

| Example | Behavior |
|---|---|
| Kernel budget caps | A `NaN` or negative cap is rejected (`BRAMBO_KERNEL_ACTION_INVALID`) because it would silently disable the cap. |
| Projection `mode` | Anything other than `apply`, `inspect` or omitted throws `BRAMBO_PROJECTION_MODE_INVALID`; it is never defaulted, because the mode decides whether brambo writes files it does not own. |
| Sandbox capabilities | A provider that cannot show evidence for every required control is rejected before a session exists (`BRAMBO_SANDBOX_CAPABILITY_UNAVAILABLE`). |
| Permission audit | If the audit sink fails, an `ask` decision stays `ask`; nothing is auto-approved. |
| Review delivery | In `provenance`, a blocker finding whose causality is `unknown` blocks delivery. |
| Remote store replies | `workflow-remote` refuses a reply that does not echo the filter it asked for. |
| Durable recovery | No effect evidence is not proof of no effects: an unproven attempt becomes `blocked`, not retried. |

## Defensive snapshot and freeze

Inputs are read once, validated, and copied; the copy is what brambo operates on. Outputs that cross a boundary are frozen.

- `runSession` reads every option field once before its first `await`, so an accessor cannot answer with one value at validation and another at use.
- The kernel reads each action definition field once with `Object.hasOwn`, closing prototype-pollution and time-of-check/time-of-use gaps, and freezes stage contexts, handles and log records.
- Sandbox policies, capability facts, permission grants and driver registrations are frozen copies.
- `workflow-remote` and the coordinator worker `structuredClone` arguments at call time.

The practical consequence: mutating an object after you passed it to brambo has no effect on the run, and mutating an object brambo returned throws in strict mode.

## Ownership ledger

brambo records what it writes so it can reverse only its own output.

- Projection writes the vendor's native file first and records the claim in `~/.brambo/projection-ledger.json` second, so a crash under-claims. Drift (`edited`, `removed-by-user`, `foreign-collision`) is reported, never resolved by writing.
- Workspaces carry an ownership record (`.brambo-workspace.json` for local, a ledger under the worktree state directory for git). Removal helpers delete only directories with a matching record, and git worktree removal refuses a dirty tree or a commit no ref contains.
- An unreadable ledger is reported and left alone; it is never overwritten.

## Version by reject

Every persisted format and every contract carries a version. A mismatch is refused with a coded error; brambo never partially reads or migrates.

| Format | Version check |
|---|---|
| Registry store | `STORE_VERSION = 1`; a newer store raises `BRAMBO_REGISTRY_STORE_VERSION_MISMATCH`. |
| Memory stores | Format stamp; mismatch raises `BRAMBO_CONTRACT_MEMORY_STORE_VERSION_MISMATCH`. Published as a clause in the memory contract suite. |
| SQLite run store | Schema version 1; unknown schemas raise `BRAMBO_WORKFLOW_SCHEMA_UNSUPPORTED`. |
| Executor providers | `manifest.contractVersion` must be `'1'`. |
| Wire and records | `WORKFLOW_PROTOCOL_VERSION`, `SANDBOX_POLICY_VERSION`, `LOG_RECORD_VERSION`, `PROJECTION_LEDGER_VERSION`. |

An absent store is not a mismatch: it is stamped and served. Upgrading across a format change means installing a build at least as new as the one that wrote the data.

## Typed absence

Information brambo could not observe is reported as an explicit absence or a coded error, never as `0`, `''` or a bare `null`. A kernel service that is not provided is `{ kind: 'absent' }`. Usage that a vendor does not publish is reported with a reason (`BRAMBO_USAGE_NO_SURFACE`, `BRAMBO_USAGE_NOT_OBSERVED`), not as zero tokens.

## Architecture as a test

The dependency direction between packages is enforced by `topology.test.ts` and `eslint.config.js`, not by a diagram. See [Architecture and topology](./architecture).
