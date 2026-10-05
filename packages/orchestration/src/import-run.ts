import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { validateArtifactManifest, validateCommand, validateCommandReceipt, validateRunSnapshot, validateToolCall } from '@brambodev/contracts'
import type { ArtifactManifest, ArtifactProvider, Command, JsonValue, Lease, Principal, RunEvent, RunKey, RunSnapshot, RunStore, WorkspaceRef } from '@brambodev/contracts'
import { validateWorkflowDefinition } from './workflow-registry.ts'
import type { WorkflowRegistry } from './workflow-registry.ts'

export interface ImportWorkflowRunOptions {
  readonly source: RunStore
  readonly target: RunStore
  readonly sourceArtifacts: ArtifactProvider
  readonly targetArtifacts: ArtifactProvider
  readonly sourceKey: RunKey
  readonly targetKey: RunKey
  readonly principal: Principal
  readonly definitions: Pick<WorkflowRegistry, 'resolve'>
  readonly authorizeImport: (principal: Principal, source: RunSnapshot, target: RunKey) => Promise<boolean>
  readonly command: Command
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}'
}
const hash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex')
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b)
const refs = (snapshot: RunSnapshot) => [...new Map([snapshot.workspace, ...snapshot.tasks.flatMap(task => task.workspace ? [task.workspace] : [])].map(ref => [canonical(ref), ref])).values()]
function resources(snapshot: RunSnapshot): string[] {
  return [...new Set(['run:' + snapshot.key.runId, ...snapshot.tasks.map(task => `task:${snapshot.key.runId}:${task.taskId}`), ...refs(snapshot).map(ref => 'workspace:' + ref.workspaceId)])].sort()
}
async function history(store: RunStore, key: RunKey): Promise<readonly RunEvent[]> {
  const all: RunEvent[] = []
  let cursor = 0
  while (true) {
    const page = await store.events(key, cursor, 256)
    if (page.status === 'overflow') throw new Error('Import effect history unavailable')
    for (const event of page.events) {
      if (event.cursor !== cursor + 1 || !same(event.key, key)) throw new Error('Import effect history incomplete')
      cursor = event.cursor; all.push(event)
    }
    if (cursor === page.latestCursor) return all
    if (!page.events.length || cursor > page.latestCursor) throw new Error('Import effect history incomplete')
  }
}
function effectHistory(snapshot: RunSnapshot, events: readonly RunEvent[], definition: unknown): readonly { type: string; payload: JsonValue }[] {
  const records = new Map<string, { attempt: number; complete: boolean }>(), admitted = new Set<string>()
  const carried = []
  for (const event of events) {
    if (event.type === 'workflow.definition') {
      if ((event.payload as Record<string, JsonValue>)['fingerprint'] !== hash(definition)) throw new Error('Import workflow compatibility mismatch')
      carried.push({ type: event.type, payload: event.payload }); continue
    }
    if (!['task.effect.started', 'task.effect.completed', 'task.effect.replayed'].includes(event.type)) {
      if (event.type.startsWith('task.effect.')) throw new Error('Import effect version unsupported')
      continue
    }
    validateCommand({ key: snapshot.key, clientId: 'import-evidence', idempotencyKey: 'evidence', kind: 'start', payload: event.payload })
    const payload = event.payload as Record<string, JsonValue>
    const task = snapshot.tasks.find(task => task.taskId === payload?.['taskId'])
    if (!payload || !task || !Number.isSafeInteger(payload['attempt']) || (payload['attempt'] as number) < 1 || (payload['attempt'] as number) > task.attempt) throw new Error('Import effect evidence invalid')
    const taskId = payload['taskId'] as string
    if (event.type === 'task.effect.started') {
      const call = validateToolCall(payload['call'])
      if (!['read-only', 'idempotent', 'non-idempotent'].includes(payload['effect'] as string)) throw new Error('Import effect evidence invalid')
      const id = canonical([taskId, call.id])
      if (records.has(id)) throw new Error('Import contradictory or uncertain effect')
      records.set(id, { attempt: payload['attempt'] as number, complete: false }); admitted.add(canonical([taskId, payload['attempt']]))
    } else {
      const record = records.get(canonical([taskId, payload['callId']]))
      if (!record || event.type === 'task.effect.completed' && (record.complete || record.attempt !== payload['attempt'] || !Object.hasOwn(payload, 'result')) || event.type === 'task.effect.replayed' && !record.complete) throw new Error('Import effect evidence missing')
      if (event.type === 'task.effect.replayed') admitted.add(canonical([taskId, payload['attempt']]))
      record.complete = true
    }
    carried.push({ type: event.type, payload: event.payload })
  }
  if ([...records.values()].some(record => !record.complete) || snapshot.tasks.some(task => task.attempt > 0 && !admitted.has(canonical([task.taskId, task.attempt])))) throw new Error('Import uncertain or missing effect evidence')
  return carried
}
function quiescent(snapshot: RunSnapshot): void {
  if (!['succeeded', 'failed', 'cancelled', 'blocked'].includes(snapshot.status) || snapshot.tasks.some(task => ['running', 'uncertain'].includes(task.phase)) || snapshot.importState?.phase === 'pending') throw new Error('Import source must be quiescent')
}
function checkedManifest(value: ArtifactManifest, ref: WorkspaceRef): ArtifactManifest {
  const manifest = validateArtifactManifest(value), components = new Map<string, string>(), paths = new Set<string>()
  if (manifest.revision !== ref.revision) throw new Error('Import artifact revision mismatch')
  for (const entry of manifest.entries) {
    if (!/^sha256:[a-f0-9]{64}$/.test(entry.digest)) throw new Error('Import artifact digest invalid')
    const parts = entry.path.split('/'), normalized = []
    for (const part of parts) {
      normalized.push(part.normalize('NFC').toLowerCase())
      const key = normalized.join('/'), original = parts.slice(0, normalized.length).join('/')
      if (components.has(key) && components.get(key) !== original) throw new Error('Import artifact path alias')
      components.set(key, original)
    }
    paths.add(normalized.join('/'))
  }
  for (const path of paths) {
    const parts = path.split('/')
    for (let length = 1; length < parts.length; length++) if (paths.has(parts.slice(0, length).join('/'))) throw new Error('Import artifact path conflict')
  }
  return structuredClone(manifest)
}

/**
 * Explicit same-namespace import; host authorization is required even across subjects.
 * Pending snapshots are admission barriers in both worker and direct engine paths.
 * Interrupted calls reuse the same command; divergent export or payload refuses.
 * Claims expire after 60 seconds and fail closed, never renew in the background.
 * Staged/published orphan artifacts are not progress; only atomic final settlement is.
 * Ports are borrowed. Native binding is dropped; opaque neutral context remains
 * host-owned, so authorizeImport must also enforce its content/export policy.
 */
export async function importWorkflowRun(input: ImportWorkflowRunOptions): Promise<RunSnapshot> {
  // Capture intent before the first await; host callbacks cannot change the identity.
  const options = { ...input, sourceKey: structuredClone(input.sourceKey), targetKey: structuredClone(input.targetKey), principal: structuredClone(input.principal), command: structuredClone(input.command) }
  const { source, target, sourceKey, targetKey, principal, command } = options
  validateCommand(command)
  validateCommandReceipt({ id: 'import-validation', command, actor: principal, phase: 'accepted' })
  if (command.kind !== 'start' || !same(command.key, targetKey) || sourceKey.namespace !== targetKey.namespace || principal.namespace !== targetKey.namespace || same(sourceKey, targetKey)) throw new Error('Import namespace or identity mismatch')
  const initial = await source.get(sourceKey)
  if (!initial) throw new Error('Import source missing')
  const observed = structuredClone(validateRunSnapshot(initial))
  if (!same(observed.key, sourceKey)) throw new Error('Import source identity mismatch')
  if (!await options.authorizeImport(Object.freeze({ ...principal }), structuredClone(observed), Object.freeze({ ...targetKey }))) throw new Error('Import denied')
  quiescent(observed)
  const definition = validateWorkflowDefinition(options.definitions.resolve(observed.workflowId, observed.workflowVersion))
  if (definition.id !== observed.workflowId || definition.version !== observed.workflowVersion || !same(definition.tasks.map(task => task.id).sort(), observed.tasks.map(task => task.taskId).sort())) throw new Error('Import workflow compatibility mismatch')
  const frozen = await source.claim(sourceKey.namespace, resources(observed), principal.subject, 60_000)
  if (frozen.status !== 'acquired') throw new Error('Import source contended')
  const sourceLease = frozen.lease
  let targetLease: Lease | undefined, directory: string | undefined
  async function authority(): Promise<void> {
    if (!await source.valid(sourceLease) || targetLease && !await target.valid(targetLease)) throw new Error('Import stale-lease')
  }
  try {
    const reread = await source.get(sourceKey)
    if (!reread || !same(validateRunSnapshot(reread), observed)) throw new Error('Import source changed')
    quiescent(reread)
    const events = effectHistory(observed, await history(source, sourceKey), definition)
    directory = await mkdtemp(join(tmpdir(), 'brambo-import-')); await chmod(directory, 0o700)
    const exports: { source: WorkspaceRef; directory: string; manifest: ArtifactManifest; target: WorkspaceRef }[] = []
    for (const ref of refs(observed)) {
      await authority()
      const manifest = checkedManifest(await options.sourceArtifacts.manifest(ref), ref), root = join(directory, String(exports.length))
      await mkdir(root, { mode: 0o700 })
      for (const entry of manifest.entries) {
        const bytes = await options.sourceArtifacts.read(ref, entry.path)
        if (bytes.byteLength !== entry.size || 'sha256:' + createHash('sha256').update(bytes).digest('hex') !== entry.digest) throw new Error('Import artifact digest mismatch')
        const path = join(root, ...entry.path.split('/')); await mkdir(dirname(path), { recursive: true, mode: 0o700 })
        await writeFile(path, bytes, { flag: 'wx', mode: 0o600 }); if (entry.executable) await chmod(path, 0o700)
      }
      exports.push({ source: ref, directory: root, manifest, target: { namespace: targetKey.namespace, workspaceId: 'import-pending', revision: ref.revision } })
    }
    const fingerprint = hash({ snapshot: observed, events, definition, command, principal, artifacts: exports.map(item => ({ ref: item.source, manifest: item.manifest })) }), id = 'import-' + hash({ command, principal })
    for (const item of exports) item.target = { ...item.target, workspaceId: 'import-' + hash({ targetKey, fingerprint, ref: item.source }) }
    const map = (ref: WorkspaceRef) => exports.find(item => same(item.source, ref))!.target
    // Native binding is intentionally excluded. Durable session/context are neutral identity.
    const proposed: RunSnapshot = { schemaVersion: 1, key: targetKey, revision: 0, workflowId: observed.workflowId, workflowVersion: observed.workflowVersion, sessionId: observed.sessionId,
      status: 'pending', workspace: map(observed.workspace), tasks: observed.tasks.map(task => ({ ...task, ...(task.workspace ? { workspace: map(task.workspace) } : {}) })), context: observed.context,
      lineage: sourceKey, cancelRequested: observed.cancelRequested, importState: { version: 1, id, sourceKey, sourceRevision: observed.revision, fingerprint, phase: 'pending' } }
    const claim = await target.claim(targetKey.namespace, resources(proposed), principal.subject, 60_000)
    if (claim.status !== 'acquired') throw new Error('Import target contended')
    targetLease = claim.lease; await authority()
    const existing = await target.get(targetKey)
    if (existing && (!existing.importState || !same({ ...validateRunSnapshot(existing).importState!, phase: 'pending' }, proposed.importState))) throw new Error('Import target collision conflict')
    if (existing?.importState?.phase === 'pending' && !same({ ...existing, revision: 0 }, proposed)) throw new Error('Import pending target conflict')
    const admission = await target.create(proposed, command, principal)
    if (admission.status === 'conflict') throw new Error('Import command conflict')
    const receipt = validateCommandReceipt(admission.receipt)
    if (!same(receipt.command, command) || !same(receipt.actor, principal)) throw new Error('Import receipt conflict')
    let current = await target.get(targetKey)
    if (!current || !same({ ...validateRunSnapshot(current).importState!, phase: 'pending' }, proposed.importState)) throw new Error('Import admission conflict')
    if (current.importState!.phase === 'completed') {
      if (receipt.phase !== 'completed') throw new Error('Import settlement conflict')
      return current
    }
    if (!['accepted', 'running'].includes(receipt.phase)) throw new Error('Import receipt conflict')
    if (!same({ ...current, revision: 0 }, proposed)) throw new Error('Import pending target conflict')
    for (const item of exports) {
      await authority()
      const staged = validateArtifactManifest(await options.targetArtifacts.stage(targetKey.namespace, item.directory))
      if (!same([...staged.entries].sort((a, b) => a.path.localeCompare(b.path)), [...item.manifest.entries].sort((a, b) => a.path.localeCompare(b.path)))) throw new Error('Import staged artifact digest mismatch')
      item.target = { ...item.target, revision: staged.revision }
      await authority(); await options.targetArtifacts.publish(item.target, staged, targetLease)
    }
    const prior = (await history(target, targetKey)).map(event => ({ type: event.type, payload: event.payload }))
    if (prior.length > events.length || !same(prior, events.slice(0, prior.length))) throw new Error('Import effect history conflict')
    for (let offset = prior.length; offset < events.length; offset += 256) {
      await authority()
      const committed = await target.commit({ snapshot: { ...current, revision: current.revision + 1 }, expectedRevision: current.revision, lease: targetLease, events: events.slice(offset, offset + 256) })
      if (committed.status !== 'committed') throw new Error('Import ' + committed.status)
      current = committed.snapshot
    }
    await authority()
    const final: RunSnapshot = { ...proposed, revision: current.revision + 1, status: observed.status, workspace: map(observed.workspace), tasks: observed.tasks.map(task => ({ ...task, ...(task.workspace ? { workspace: map(task.workspace) } : {}) })), importState: { ...proposed.importState!, phase: 'completed' } }
    const completed = await target.commit({ snapshot: final, expectedRevision: current.revision, lease: targetLease,
      events: [{ type: 'run.import.completed', payload: { importId: id } }], receipt: { ...receipt, phase: 'completed', outcome: { importId: id, sourceKey: sourceKey as unknown as JsonValue, sourceRevision: observed.revision } } })
    if (completed.status !== 'committed') throw new Error('Import ' + completed.status)
    return completed.snapshot
  } finally {
    // Ports are borrowed. Release exact authority; never close caller connections.
    try { if (targetLease) await target.release(targetLease) } finally {
      try { await source.release(sourceLease) } finally { if (directory) await rm(directory, { recursive: true, force: true }) }
    }
  }
}
