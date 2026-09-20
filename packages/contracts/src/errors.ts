export const BRAMBO_ERROR_CODES = {
  kernelManifestInvalid: 'BRAMBO_KERNEL_MANIFEST_INVALID',
  kernelCycleDetected: 'BRAMBO_KERNEL_CYCLE_DETECTED',
  kernelServiceNotProvided: 'BRAMBO_KERNEL_SERVICE_NOT_PROVIDED',
  kernelServiceConflict: 'BRAMBO_KERNEL_SERVICE_CONFLICT',
  kernelPluginInactive: 'BRAMBO_KERNEL_PLUGIN_INACTIVE',
  kernelPluginStartFailed: 'BRAMBO_KERNEL_PLUGIN_START_FAILED',
  kernelSwapRejected: 'BRAMBO_KERNEL_SWAP_REJECTED',
  kernelReemitDuringFanout: 'BRAMBO_KERNEL_REEMIT_DURING_FANOUT',
  kernelInvalidScope: 'BRAMBO_KERNEL_INVALID_SCOPE',
  kernelInvalidLayer: 'BRAMBO_KERNEL_INVALID_LAYER',
  kernelLogRecordInvalid: 'BRAMBO_KERNEL_LOG_RECORD_INVALID',
  kernelActionInvalid: 'BRAMBO_KERNEL_ACTION_INVALID',
  kernelActionDenied: 'BRAMBO_KERNEL_ACTION_DENIED',
  kernelInvocationCapExceeded: 'BRAMBO_KERNEL_INVOCATION_CAP_EXCEEDED',
  kernelCostCapExceeded: 'BRAMBO_KERNEL_COST_CAP_EXCEEDED',
  kernelConcurrencyCapExceeded: 'BRAMBO_KERNEL_CONCURRENCY_CAP_EXCEEDED',
  kernelStageFailed: 'BRAMBO_KERNEL_STAGE_FAILED',
  kernelSettlementInvalid: 'BRAMBO_KERNEL_SETTLEMENT_INVALID',
  kernelSettlementInProgress: 'BRAMBO_KERNEL_SETTLEMENT_IN_PROGRESS',
  contractEnvelopeInvalid: 'BRAMBO_CONTRACT_ENVELOPE_INVALID',
  contractWorkspaceUnknownId: 'BRAMBO_CONTRACT_WORKSPACE_UNKNOWN_ID',
  contractWorkspaceInvalidHandle: 'BRAMBO_CONTRACT_WORKSPACE_INVALID_HANDLE',
  contractWorkspaceDoubleRelease: 'BRAMBO_CONTRACT_WORKSPACE_DOUBLE_RELEASE',
  contractWorkspaceUnavailable: 'BRAMBO_CONTRACT_WORKSPACE_UNAVAILABLE',
  // Brambo looked at a workspace it owns and DECLINED to remove it. Nothing
  // failed and nothing is unavailable: the removal would have destroyed work
  // that exists nowhere else, so brambo stopped. Its own code rather than
  // `contractWorkspaceUnavailable`, for the reason that one's note gives — a
  // caller told a workspace is unavailable goes looking at git or the disk,
  // and here both are fine and the answer is to put the work somewhere a ref
  // names. Every refusal on the removal path arrives under this code, so a
  // caller branches on "brambo would not" without matching message text.
  contractWorkspaceRemovalRefused: 'BRAMBO_CONTRACT_WORKSPACE_REMOVAL_REFUSED',
  // Two removals of ONE workspace at once; the loser gets this, naming the
  // holder as `pid@host`. Deliberately the same rule and the same shape as
  // `registryContention` rather than a second answer to the same question: one
  // winner, a bounded coded refusal for everyone else, and a holder a user can
  // identify. Separate from the refusal above because the fix is different —
  // wait for the other process, versus move the work somewhere a ref names.
  contractWorkspaceContention: 'BRAMBO_CONTRACT_WORKSPACE_CONTENTION',
  contractProviderDisposed: 'BRAMBO_CONTRACT_PROVIDER_DISPOSED',
  // A save request the port will not admit: a non-string payload, or provenance
  // missing or malformed in any of its three mandatory fields (RD-1). ONE code
  // rather than one per field, because the fix is the same class of fix —
  // correct the request — and the message names the field that is wrong. It is
  // separate from `contractMemoryUnknownEntry` below, whose fix is different: the
  // request is well-formed and the store simply does not hold what it points at.
  contractMemorySaveInvalid: 'BRAMBO_CONTRACT_MEMORY_SAVE_INVALID',
  // A `supersedes` pointer naming an entry this store does not hold. Refused
  // rather than stored, because an append-only log has no later opportunity to
  // repair a dangling supersession link.
  contractMemoryUnknownEntry: 'BRAMBO_CONTRACT_MEMORY_UNKNOWN_ENTRY',
  // RD-1's destructive overwrite, refused. The port NAMES the operation so the
  // refusal is coded and identical across providers; an absent method would
  // reach an untyped caller as `provider.overwrite is not a function`, which is
  // exactly the uncoded exit AD-7 exists to close.
  contractMemoryOverwriteUnsupported: 'BRAMBO_CONTRACT_MEMORY_OVERWRITE_UNSUPPORTED',
  // A store stamped with a format version this build does not speak. Version by
  // REJECT, never migrate — the same decision `STORE_VERSION` reached
  // independently in `@brambodev/registry`: a partially-read store is worse than an
  // unopened one, and a migration path is a v1 requirement nobody has.
  contractMemoryStoreVersionMismatch: 'BRAMBO_CONTRACT_MEMORY_STORE_VERSION_MISMATCH',
  // The medium itself cannot be created, opened or read, naming the path.
  // Distinct from an ABSENT store, which is not a failure at all but an empty
  // one (AD-5).
  contractMemoryStoreUnavailable: 'BRAMBO_CONTRACT_MEMORY_STORE_UNAVAILABLE',
  sandboxPolicyInvalid: 'BRAMBO_SANDBOX_POLICY_INVALID',
  sandboxRequestInvalid: 'BRAMBO_SANDBOX_REQUEST_INVALID',
  sandboxResponseInvalid: 'BRAMBO_SANDBOX_RESPONSE_INVALID',
  sandboxSnapshotInvalid: 'BRAMBO_SANDBOX_SNAPSHOT_INVALID',
  sandboxCapabilityUnavailable: 'BRAMBO_SANDBOX_CAPABILITY_UNAVAILABLE',
  sandboxUnavailable: 'BRAMBO_SANDBOX_UNAVAILABLE',
  sandboxDenied: 'BRAMBO_SANDBOX_DENIED',
  // A tool descriptor or its invocation arguments are not executable input.
  // This remains distinct from a sandbox request because callers fix the tool
  // declaration here; the sandbox request is assembled only after it is valid.
  toolInvocationInvalid: 'BRAMBO_TOOL_INVOCATION_INVALID',
  executorUnavailable: 'BRAMBO_EXECUTOR_UNAVAILABLE',
  executorRunFailed: 'BRAMBO_EXECUTOR_RUN_FAILED',
  executorCancelled: 'BRAMBO_EXECUTOR_CANCELLED',
  // Brambo ships no adapter under the name that was asked for. Deliberately NOT
  // `executorUnavailable`: that one means the binary did not spawn, and the two
  // have different fixes — use a name brambo has versus install the tool. A
  // selection that failed because the name was wrong must never be reported as
  // a missing installation, or the user goes looking for the wrong problem.
  executorNotFound: 'BRAMBO_EXECUTOR_NOT_FOUND',
  // Brambo's OWN configuration document exists and cannot be used: unreadable,
  // not valid JSON, not an object, or holding a value of the wrong type. Coded,
  // and separate from `executorNotFound`, because the fix is different again
  // (repair the file versus correct the name) — and separate from the layered
  // config's own `BRAMBO_KERNEL_INVALID_LAYER`, which is what rejects a hostile
  // key once the document has parsed.
  //
  // A document that is ABSENT is not this: it is a layer brambo does not have.
  // Falling back to the default because a configuration could not be read is the
  // exact failure executor selection exists to remove — it runs a DIFFERENT
  // agent than the user configured, silently, wearing the disguise of robustness.
  configurationUnusable: 'BRAMBO_CONFIGURATION_UNUSABLE',
  // `@brambodev/lock`, the portable lockfile protocol, owned by no domain. Its two
  // codes are NEUTRAL on purpose: the lock was extracted out of `@brambodev/registry`
  // so `@brambodev/projection` could serialize its ledger across PROCESSES without
  // the `projection -> registry` edge AD-2 forbids, and a shared leaf that kept
  // raising `BRAMBO_REGISTRY_*` would have leaked one package's vocabulary out of
  // the other's API — the exact AD-7 breach that made the edge unacceptable the
  // first time. Every consumer translates these two at its own boundary.
  //
  // `lockContention`: someone else holds the lock and the bounded wait expired.
  // Nothing was written and nothing is broken — the fix is to wait or to find
  // the holder, which the message names as `pid@host`.
  lockContention: 'BRAMBO_LOCK_CONTENTION',
  // `lockUnavailable`: the lockfile itself could not be created, written, read,
  // stat-ed or released. The medium failed, not the protocol.
  lockUnavailable: 'BRAMBO_LOCK_UNAVAILABLE',
  registryInvalidEntry: 'BRAMBO_REGISTRY_INVALID_ENTRY',
  registryContention: 'BRAMBO_REGISTRY_CONTENTION',
  registryStoreUnavailable: 'BRAMBO_REGISTRY_STORE_UNAVAILABLE',
  // A store document stamped with a format version NEWER than this build reads.
  // Its own code, for the same reason `contractMemoryStoreVersionMismatch` above
  // has one: the document is INTACT and the action is different — install a
  // brambo at least as new as the one that wrote it, versus repair or remove the
  // file. Told only that the store is unavailable, the owner of a perfectly
  // healthy registry follows the repair instruction and destroys it.
  //
  // Version by REJECT, never migrate, is unchanged; only what brambo SAYS about
  // the refusal changes. A version BELOW this build's, a string, a fraction or
  // an absent field is not this — that document is one this build cannot
  // recognise at all, and keeps `registryStoreUnavailable`.
  registryStoreVersionMismatch: 'BRAMBO_REGISTRY_STORE_VERSION_MISMATCH',
  registryInactive: 'BRAMBO_REGISTRY_INACTIVE',
  registryProviderRejected: 'BRAMBO_REGISTRY_PROVIDER_REJECTED',
  registryOriginConflict: 'BRAMBO_REGISTRY_ORIGIN_CONFLICT',
  // A bundle, not the store: the two fail for different reasons at different
  // paths, and a user told their STORE is unavailable while their export
  // destination is what refused would go looking in the wrong place.
  registryBundleUnavailable: 'BRAMBO_REGISTRY_BUNDLE_UNAVAILABLE',
  projectionNativeMalformed: 'BRAMBO_PROJECTION_NATIVE_MALFORMED',
  projectionTargetFailed: 'BRAMBO_PROJECTION_TARGET_FAILED',
  projectionTraitsInvalid: 'BRAMBO_PROJECTION_TRAITS_INVALID',
  projectionLedgerUnavailable: 'BRAMBO_PROJECTION_LEDGER_UNAVAILABLE',
  // Another brambo PROCESS holds the ledger's cross-process lock and the bounded
  // wait expired. Its own code rather than `projectionLedgerUnavailable`,
  // because nothing is unavailable and nothing is damaged: the document is
  // intact, brambo simply did not get its turn, and the fix is to wait or to
  // stop the other run — not to repair a file. A caller told the LEDGER was
  // unavailable goes looking at a healthy document for a fault that is not
  // there.
  projectionLedgerContention: 'BRAMBO_PROJECTION_LEDGER_CONTENTION',
  projectionNativeUnclaimable: 'BRAMBO_PROJECTION_NATIVE_UNCLAIMABLE',
  // `runProjection` was asked to run in a mode it does not have. Coded, and
  // rejected rather than defaulted, because the one thing that mode decides is
  // whether brambo writes into files it does not own: an unrecognised value
  // silently taken as "apply" writes into a user's config on the say-so of a
  // typo, and `runProjection` is on the FR-29 surface, so untyped callers reach it.
  projectionModeInvalid: 'BRAMBO_PROJECTION_MODE_INVALID',
  // A remediation brambo will not perform. Its own code rather than
  // `projectionTargetFailed`, because nothing failed: brambo looked at what was
  // asked, found it outside what it owns or unprovable, and declined — which is
  // a different fact from a projection that broke, and the fix is different too.
  // Every containment refusal on the one path that changes ownership arrives
  // under this code, so a caller can branch on "brambo would not" without
  // matching message text.
  projectionRemediationRefused: 'BRAMBO_PROJECTION_REMEDIATION_REFUSED',
  // The machine or project scope brambo was pointed at cannot be used: a
  // directory that does not exist, a path that is not a directory, an empty
  // string where a home was expected, or brambo's own state directory occupied
  // by a file. Coded because every one of these is reachable from a caller's
  // argv or a consumer's `process.env.HOME ?? ''`, and a raw ENOENT/EEXIST
  // names neither the path nor what brambo wanted from it.
  environmentScopeUnavailable: 'BRAMBO_ENVIRONMENT_SCOPE_UNAVAILABLE',
  // A value offered as a MethodPlugin does not satisfy the published contract.
  // Separate from `kernelManifestInvalid`: that one answers for the kernel's
  // `PluginManifest`, which AD-1 keeps in a package that may never import this
  // one, and a methodology author who conflated the two would go looking for the
  // wrong validator.
  methodInvalidPlugin: 'BRAMBO_METHOD_INVALID_PLUGIN',
  // A method's `onActivate` or `onDeactivate` threw. ONE code, not one per hook:
  // unlike a kernel log record — whose closed shape has nowhere to carry which
  // cap fired, which is why the budget codes are split — a thrown BramboError
  // carries its `cause` and a message naming both the method and the hook, so a
  // consumer can already tell mount from unmount without a second constant.
  methodHookFailed: 'BRAMBO_METHOD_HOOK_FAILED',
} as const

export type BramboErrorCode = (typeof BRAMBO_ERROR_CODES)[keyof typeof BRAMBO_ERROR_CODES]

export class BramboError extends Error {
  readonly code: BramboErrorCode

  constructor(code: BramboErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'BramboError'
    this.code = code
  }
}
