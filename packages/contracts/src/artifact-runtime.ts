import { BramboError, BRAMBO_ERROR_CODES } from './errors.ts'
import { validateEnvelope } from './executor.ts'
import type { WorkspaceHandle } from './workspace.ts'
import type { CapabilityId, DriverOutcome, DriverRequest, ExecutionDriver } from './execution-driver.ts'
import type { Lease, WorkspaceRef } from './workflow-run.ts'
import { durableBinding, durableInteger, durableJson, durableRecord, durableReject, durableSchema, durableString, durableWorkspace, validateLease } from './workflow-run.ts'

export interface ArtifactManifest {
  readonly revision: string
  readonly entries: readonly { readonly path: string; readonly digest: string; readonly size: number; readonly executable: boolean }[]
}
export interface ArtifactProvider {
  stage(namespace: string, directory: string): Promise<ArtifactManifest>
  manifest(ref: WorkspaceRef): Promise<ArtifactManifest>
  read(ref: WorkspaceRef, path: string): Promise<Uint8Array>
  materialize(ref: WorkspaceRef, directory: string): Promise<WorkspaceHandle>
  /**
   * Check current authority AND the exact scoped workspace epoch. Publication
   * associates immutable data only; the parent's separate CAS advances the run.
   * A check/publication race may leave orphan data, never authoritative progress.
   */
  publish(ref: WorkspaceRef, manifest: ArtifactManifest, lease: Lease): Promise<void>
}
export type RuntimeRequest = Omit<DriverRequest, 'workspace'> & { readonly workspace: WorkspaceRef }
export interface RuntimeOutcome {
  readonly outcome: DriverOutcome
  readonly staged: ArtifactManifest
  readonly workspace: WorkspaceRef
  /** Transient child authority; never copy into persisted records or logs. */
  readonly publicationLease: Lease
}
export interface ExecutionRuntime {
  readonly capabilities: readonly CapabilityId[]
  execute(driver: ExecutionDriver, request: RuntimeRequest, lease: Lease): Promise<RuntimeOutcome>
}

export function validateArtifactManifest(value: unknown): ArtifactManifest {
  durableJson(value)
  const record = durableRecord(value, ['revision', 'entries'])
  durableString(record['revision'])
  if (!Array.isArray(record['entries'])) durableReject('artifact entries must be an array')
  const paths = new Set<string>()
  for (const value of record['entries']) {
    const entry = durableRecord(value, ['path', 'digest', 'size', 'executable'])
    durableString(entry['path']); durableString(entry['digest']); durableInteger(entry['size'])
    const path = entry['path']
    if (/[\\:<>"|?*]/.test(path) || Array.from(path).some((character) =>
      character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) || path.split('/').some((part) =>
      part === '' || part === '.' || part === '..' || /[. ]$/.test(part) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) durableReject('unsafe artifact path')
    if (paths.has(path)) durableReject('duplicate artifact path')
    paths.add(path)
    if (typeof entry['executable'] !== 'boolean') durableReject('executable must be boolean')
  }
  return value as unknown as ArtifactManifest
}
/** Shape/scope checks cannot prove that a lease is currently live; the host does that. */
export function validateRuntimeOutcome(value: unknown): RuntimeOutcome {
  const record = durableRecord(value, ['outcome', 'staged', 'workspace', 'publicationLease'])
  const outcome = durableRecord(record['outcome'], ['result'], ['binding'])
  validateEnvelope(outcome['result'])
  if (Object.hasOwn(outcome, 'binding')) durableBinding(outcome['binding'])
  const staged = validateArtifactManifest(record['staged'])
  const workspace = durableWorkspace(record['workspace'])
  const lease = validateLease(record['publicationLease'])
  if (lease.namespace !== workspace.namespace || !Object.hasOwn(lease.epochs, `workspace:${workspace.workspaceId}`)) {
    // Do not include bearer tokens or raw authority objects in diagnostics.
    throw new BramboError(BRAMBO_ERROR_CODES.contractLeaseScopeInvalid, 'schema violation: publication lease workspace scope mismatch')
  }
  if (staged.revision !== workspace.revision) durableReject('staged/workspace revision mismatch')
  return value as RuntimeOutcome
}
export const ARTIFACT_MANIFEST_SCHEMA = durableSchema(validateArtifactManifest)
export const RUNTIME_OUTCOME_SCHEMA = durableSchema(validateRuntimeOutcome)
