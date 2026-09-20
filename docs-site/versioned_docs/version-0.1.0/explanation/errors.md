---
title: Errors and result envelopes
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Handle brambo failures without parsing messages
scope: Public error handling
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# Errors and result envelopes

Use the error code or result status as the machine-readable signal. Messages explain failures to people; they are not a stable routing API.

## Two failure surfaces

A session run returns a `ResultEnvelope` for executor outcomes. Its `status` is `ok`, `failed`, or `cancelled`; failed and cancelled envelopes have a non-empty `errors` array. Environment and configuration failures throw `BramboError`.

```ts
import { BRAMBO_ERROR_CODES, BramboError } from '@skanl/brambo-contracts'

try {
  await startHost()
} catch (error) {
  if (error instanceof BramboError && error.code === BRAMBO_ERROR_CODES.configurationUnusable) {
    console.error('Repair the configuration document before retrying')
  }
  throw error
}
```

## Routing table

| Signal | Meaning | Action |
| --- | --- | --- |
| `status: ok` | Successful executor envelope. | Consume `data` and `summary`. |
| `status: failed` | Executor or adapter failure. | Inspect `errors`; do not retry blindly. |
| `status: cancelled` | Caller or timeout stopped the run. | Release caller-owned resources. |
| `BramboError.code` | brambo rejected an input or boundary operation. | Branch on the code and fix that boundary. |

## Common coded errors

- `BRAMBO_EXECUTOR_NOT_FOUND`: no shipped adapter has the selected id.
- `BRAMBO_CONFIGURATION_UNUSABLE`: an existing configuration cannot be used.
- `BRAMBO_CONTRACT_PROVIDER_DISPOSED`: an operation reached a disposed provider.
- `BRAMBO_CONTRACT_WORKSPACE_UNKNOWN_ID`: the provider does not know the id.
- `BRAMBO_CONTRACT_MEMORY_STORE_VERSION_MISMATCH`: the persisted format is unsupported.

The complete catalogue is exported by `@skanl/brambo-contracts`.

## CLI exit codes

For `run`, exit code `0` means an `ok` envelope, `1` means `failed` or `cancelled`, and `2` means usage, request, configuration, or environment failure.

## Next step

Read [Troubleshooting](../reference/troubleshooting) when the code points to configuration, providers, or packaging.
