import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  validateArtifactManifest,
  validateCommand,
  validateCommandReceipt,
  validateLease,
  validateProtocolRequest,
  validateRunSnapshot,
} from '@brambodev/contracts'
import type {
  ArtifactManifest,
  ArtifactProvider,
  Command,
  CommitInput,
  JsonValue,
  Lease,
  Principal,
  ProtocolRequest,
  RunKey,
  RunStore,
  RunSnapshot,
  WorkflowProtocolOperation,
  WorkspaceRef,
} from '@brambodev/contracts'
import { ownsLease } from './authorization.ts'

const MAX_PAGE_SIZE = 256
const MAX_UPLOAD_FILES = 10_000

export class InvalidProtocolPayload extends Error {
  constructor(message = 'invalid protocol payload') {
    super(message)
    this.name = 'InvalidProtocolPayload'
  }
}

export type OperationResult = {
  readonly status?: 'ok' | 'denied' | 'invalid' | 'unavailable'
  readonly payload?: JsonValue
  readonly code?: string
}

export interface OperationPlan {
  readonly operation: WorkflowProtocolOperation
  readonly resource: JsonValue
  readonly inScope: boolean
  execute(): Promise<OperationResult>
}

type StagedFile = { readonly path: string; readonly bytes: Buffer; readonly executable: boolean }

function invalid(): never {
  throw new InvalidProtocolPayload()
}

function object(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid()
  const allowed = new Set([...required, ...optional])
  const keys = Reflect.ownKeys(value)
  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const key of keys) {
    if (typeof key !== 'string' || !allowed.has(key)) invalid()
    const descriptor = descriptors[key]
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) invalid()
  }
  for (const key of required) if (!Object.hasOwn(value, key)) invalid()
  return value as Record<string, unknown>
}

function string(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') invalid()
  return value
}

function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) invalid()
  return value
}

function runKey(value: unknown): RunKey {
  const candidate = object(value, ['namespace', 'runId'])
  const key = { namespace: string(candidate['namespace']), runId: string(candidate['runId']) }
  validateCommand({ key, clientId: 'protocol', idempotencyKey: 'protocol', kind: 'start', payload: null })
  return key
}

function namespace(value: unknown): string {
  const valueString = string(value)
  validateCommand({ key: { namespace: valueString, runId: 'protocol' }, clientId: 'protocol', idempotencyKey: 'protocol', kind: 'start', payload: null })
  return valueString
}

function workspaceRef(value: unknown): WorkspaceRef {
  const candidate = object(value, ['namespace', 'workspaceId', 'revision'])
  const ref = {
    namespace: namespace(candidate['namespace']),
    workspaceId: string(candidate['workspaceId']),
    revision: string(candidate['revision']),
  }
  validateCommand({ key: { namespace: ref.namespace, runId: ref.workspaceId }, clientId: 'protocol', idempotencyKey: 'protocol', kind: 'start', payload: null })
  validateArtifactManifest({ revision: ref.revision, entries: [] })
  return ref
}

function artifactPath(value: unknown): string {
  const path = string(value)
  validateArtifactManifest({
    revision: 'path-validation',
    entries: [{ path, digest: 'sha256:0', size: 0, executable: false }],
  })
  return path
}

function positivePage(value: unknown): number {
  return integer(value, 1, MAX_PAGE_SIZE)
}

function lease(value: unknown): Lease {
  try { return validateLease(value) } catch { return invalid() }
}

function command(value: unknown): Command {
  try { return validateCommand(value) } catch { return invalid() }
}

function snapshot(value: unknown): RunSnapshot {
  try { return validateRunSnapshot(value) } catch { return invalid() }
}

function manifest(value: unknown): ArtifactManifest {
  try { return validateArtifactManifest(value) } catch { return invalid() }
}

function commitInput(value: unknown): CommitInput {
  const candidate = object(value, ['snapshot', 'expectedRevision', 'lease', 'events'], ['receipt'])
  const nextSnapshot = snapshot(candidate['snapshot'])
  const authority = lease(candidate['lease'])
  const expectedRevision = integer(candidate['expectedRevision'])
  if (!Array.isArray(candidate['events']) || candidate['events'].length > MAX_PAGE_SIZE) invalid()
  const events = candidate['events'].map((event) => {
    const item = object(event, ['type', 'payload'])
    return { type: string(item['type']), payload: item['payload'] as JsonValue }
  })
  let receipt
  if (Object.hasOwn(candidate, 'receipt')) {
    try { receipt = validateCommandReceipt(candidate['receipt']) } catch { return invalid() }
    if (receipt.command.key.namespace !== nextSnapshot.key.namespace || receipt.command.key.runId !== nextSnapshot.key.runId) invalid()
  }
  if (nextSnapshot.revision !== expectedRevision + 1) invalid()
  return { snapshot: nextSnapshot, expectedRevision, lease: authority, events, ...(receipt ? { receipt } : {}) }
}

function payloadResource(value: JsonValue): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid()
  return value as Record<string, unknown>
}

function routeResource(operation: WorkflowProtocolOperation, data: Record<string, unknown>, principal: Principal): JsonValue {
  switch (operation) {
    case 'create': {
      const key = (data['snapshot'] as RunSnapshot).key
      return { key: { namespace: key.namespace, runId: key.runId } }
    }
    case 'admit': {
      const key = (data['command'] as Command).key
      return { key: { namespace: key.namespace, runId: key.runId } }
    }
    case 'get': {
      const key = data['key'] as RunKey
      return { key: { namespace: key.namespace, runId: key.runId } }
    }
    case 'events': {
      const key = data['key'] as RunKey
      return { key: { namespace: key.namespace, runId: key.runId }, after: data['after'] as number, limit: data['limit'] as number }
    }
    case 'receipt': return { namespace: data['namespace'] as string, id: data['id'] as string }
    case 'pending': return { namespace: data['namespace'] as string, limit: data['limit'] as number }
    case 'commit': {
      const input = data['input'] as CommitInput
      return {
        key: { namespace: input.snapshot.key.namespace, runId: input.snapshot.key.runId },
        lease: { namespace: input.lease.namespace, ownerId: input.lease.ownerId, epochs: { ...input.lease.epochs } },
      }
    }
    case 'claim': return { namespace: principal.namespace, ownerId: principal.subject, resources: data['resources'] as string[], ttlMs: data['ttlMs'] as number }
    case 'renew': case 'release': case 'valid': {
      const authority = data['lease'] as Lease
      return {
        lease: { namespace: authority.namespace, ownerId: authority.ownerId, expiresAt: authority.expiresAt, epochs: { ...authority.epochs } },
        ...(Object.hasOwn(data, 'ttlMs') ? { ttlMs: data['ttlMs'] as number } : {}),
      }
    }
    case 'artifact.manifest': {
      const ref = data['ref'] as WorkspaceRef
      return { ref: { namespace: ref.namespace, workspaceId: ref.workspaceId, revision: ref.revision } }
    }
    case 'artifact.read': {
      const ref = data['ref'] as WorkspaceRef
      return { ref: { namespace: ref.namespace, workspaceId: ref.workspaceId, revision: ref.revision }, path: data['path'] as string }
    }
    case 'artifact.stage': return { namespace: principal.namespace, files: (data['files'] as StagedFile[]).map(({ path, bytes, executable }) => ({ path, size: bytes.byteLength, executable })) }
    case 'artifact.publish': {
      const authority = data['lease'] as Lease
      const ref = data['ref'] as WorkspaceRef
      const artifactManifest = data['manifest'] as ArtifactManifest
      return {
        ref: { namespace: ref.namespace, workspaceId: ref.workspaceId, revision: ref.revision },
        revision: artifactManifest.revision,
        lease: { namespace: authority.namespace, ownerId: authority.ownerId, epochs: { ...authority.epochs } },
      }
    }
  }
}

export function planOperation(
  request: ProtocolRequest,
  principal: Principal,
  store: RunStore,
  artifacts: ArtifactProvider,
  maxBodyBytes: number,
): OperationPlan {
  const { operation } = request
  const payload = payloadResource(request.payload)
  const namespaceInScope = (value: string) => value === principal.namespace

  switch (operation) {
    case 'create': {
      const data = object(payload, ['snapshot', 'command'])
      const next = snapshot(data['snapshot'])
      const cmd = command(data['command'])
      if (next.key.namespace !== cmd.key.namespace || next.key.runId !== cmd.key.runId) invalid()
      return {
        operation, resource: routeResource(operation, { snapshot: next }, principal), inScope: namespaceInScope(next.key.namespace),
        execute: async () => ({ payload: await store.create(next, cmd, principal) as unknown as JsonValue }),
      }
    }
    case 'admit': {
      const data = object(payload, ['command'])
      const cmd = command(data['command'])
      return {
        operation, resource: routeResource(operation, { command: cmd }, principal), inScope: namespaceInScope(cmd.key.namespace),
        execute: async () => ({ payload: await store.admit(cmd, principal) as unknown as JsonValue }),
      }
    }
    case 'get': {
      const data = object(payload, ['key'])
      const key = runKey(data['key'])
      return {
        operation, resource: routeResource(operation, { key }, principal), inScope: namespaceInScope(key.namespace),
        execute: async () => {
          const result = await store.get(key)
          if (!result) return { status: 'denied', code: 'denied' }
          if (result.key.namespace !== key.namespace || result.key.runId !== key.runId) throw new Error('store returned a mismatched run key')
          return { payload: result as unknown as JsonValue }
        },
      }
    }
    case 'receipt': {
      const data = object(payload, ['namespace', 'id'])
      const scope = namespace(data['namespace'])
      const id = string(data['id'])
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) invalid()
      validateCommand({ key: { namespace: scope, runId: 'protocol' }, clientId: 'protocol', idempotencyKey: id, kind: 'start', payload: null })
      return {
        operation, resource: routeResource(operation, { namespace: scope, id }, principal), inScope: namespaceInScope(scope),
        execute: async () => {
          const result = await store.receipt(scope, id)
          if (!result) return { status: 'denied', code: 'denied' }
          const validated = validateCommandReceipt(result)
          if (validated.command.key.namespace !== scope) throw new Error('store returned a mismatched receipt namespace')
          return { payload: validated as unknown as JsonValue }
        },
      }
    }
    case 'pending': {
      const data = object(payload, ['namespace', 'limit'])
      const scope = namespace(data['namespace'])
      const limit = positivePage(data['limit'])
      return {
        operation, resource: routeResource(operation, { namespace: scope, limit }, principal), inScope: namespaceInScope(scope),
        execute: async () => {
          const results = await store.pending(scope, limit)
          const validated = results.map((result) => validateCommandReceipt(result))
          if (validated.some((result) => result.command.key.namespace !== scope)) throw new Error('store returned a mismatched receipt namespace')
          return { payload: validated as unknown as JsonValue }
        },
      }
    }
    case 'commit': {
      const data = object(payload, ['input'])
      const input = commitInput(data['input'])
      const inScope = namespaceInScope(input.snapshot.key.namespace) &&
        input.lease.namespace === input.snapshot.key.namespace && ownsLease(principal, input.lease)
      return {
        operation, resource: routeResource(operation, { input }, principal), inScope,
        execute: async () => ({ payload: await store.commit(input) as unknown as JsonValue }),
      }
    }
    case 'events': {
      const data = object(payload, ['key', 'after', 'limit'])
      const key = runKey(data['key'])
      const after = integer(data['after'])
      const limit = positivePage(data['limit'])
      return {
        operation, resource: routeResource(operation, { key }, principal), inScope: namespaceInScope(key.namespace),
        execute: async () => {
          const result = await store.events(key, after, limit)
          if (result.snapshot && (result.snapshot.key.namespace !== key.namespace || result.snapshot.key.runId !== key.runId)) {
            throw new Error('store returned a mismatched replay snapshot')
          }
          return { payload: result as unknown as JsonValue }
        },
      }
    }
    case 'claim': {
      const data = object(payload, ['resources', 'ttlMs'])
      if (!Array.isArray(data['resources']) || data['resources'].length === 0 || data['resources'].length > MAX_PAGE_SIZE) invalid()
      const resources = data['resources'].map((value) => string(value))
      if (new Set(resources).size !== resources.length) invalid()
      const ttlMs = integer(data['ttlMs'], 1)
      const epochs = Object.fromEntries(resources.map((resource) => [resource, 1]))
      try { validateLease({ namespace: principal.namespace, ownerId: principal.subject, token: 'validation-probe', expiresAt: 1, epochs }) } catch { invalid() }
      return {
        operation, resource: routeResource(operation, { resources, ttlMs }, principal), inScope: true,
        execute: async () => {
          const result = await store.claim(principal.namespace, resources, principal.subject, ttlMs)
          if (result.status === 'acquired') {
            const acquired = validateLease(result.lease)
            if (!ownsLease(principal, acquired) || Object.keys(acquired.epochs).sort().join('\0') !== [...resources].sort().join('\0')) {
              throw new Error('store returned an invalid worker lease')
            }
            return { payload: result as unknown as JsonValue }
          }
          return { payload: result as unknown as JsonValue }
        },
      }
    }
    case 'renew': {
      const data = object(payload, ['lease', 'ttlMs'])
      const authority = lease(data['lease'])
      const ttlMs = integer(data['ttlMs'], 1)
      return {
        operation, resource: routeResource(operation, { lease: authority, ttlMs }, principal), inScope: ownsLease(principal, authority),
        execute: async () => {
          const result = await store.renew(authority, ttlMs)
          if (result.status === 'acquired') {
            const renewed = validateLease(result.lease)
            if (!ownsLease(principal, renewed) || renewed.namespace !== authority.namespace || renewed.ownerId !== authority.ownerId) {
              throw new Error('store returned an invalid renewed lease')
            }
          }
          return { payload: result as unknown as JsonValue }
        },
      }
    }
    case 'release': {
      const data = object(payload, ['lease'])
      const authority = lease(data['lease'])
      return {
        operation, resource: routeResource(operation, { lease: authority }, principal), inScope: ownsLease(principal, authority),
        execute: async () => { await store.release(authority); return { payload: { released: true } } },
      }
    }
    case 'valid': {
      const data = object(payload, ['lease'])
      const authority = lease(data['lease'])
      return {
        operation, resource: routeResource(operation, { lease: authority }, principal), inScope: ownsLease(principal, authority),
        execute: async () => ({ payload: { valid: await store.valid(authority) } }),
      }
    }
    case 'artifact.manifest': {
      const data = object(payload, ['ref'])
      const ref = workspaceRef(data['ref'])
      return {
        operation, resource: routeResource(operation, { ref }, principal), inScope: namespaceInScope(ref.namespace),
        execute: async () => ({ payload: validateArtifactManifest(await artifacts.manifest(ref)) as unknown as JsonValue }),
      }
    }
    case 'artifact.read': {
      const data = object(payload, ['ref', 'path'])
      const ref = workspaceRef(data['ref'])
      const path = artifactPath(data['path'])
      return {
        operation, resource: routeResource(operation, { ref, path }, principal), inScope: namespaceInScope(ref.namespace),
        execute: async () => ({ payload: { contentBase64: Buffer.from(await artifacts.read(ref, path)).toString('base64') } }),
      }
    }
    case 'artifact.stage': {
      const data = object(payload, ['files'])
      if (!Array.isArray(data['files']) || data['files'].length > MAX_UPLOAD_FILES) invalid()
      let totalBytes = 0
      const collisions = new Set<string>()
      const files: StagedFile[] = data['files'].map((item) => {
        const file = object(item, ['path', 'contentBase64', 'executable'])
        const path = artifactPath(file['path'])
        if (typeof file['contentBase64'] !== 'string' || typeof file['executable'] !== 'boolean') invalid()
        const bytes = Buffer.from(file['contentBase64'], 'base64')
        if (bytes.toString('base64') !== file['contentBase64']) invalid()
        totalBytes += bytes.byteLength
        if (totalBytes > maxBodyBytes) invalid()
        const collisionKey = path.normalize('NFC').toLowerCase()
        if (collisions.has(collisionKey)) invalid()
        collisions.add(collisionKey)
        return { path, bytes, executable: file['executable'] }
      })
      const entries = files.map((file) => ({
        path: file.path,
        digest: 'sha256:' + createHash('sha256').update(file.bytes).digest('hex'),
        size: file.bytes.byteLength,
        executable: file.executable,
      }))
      const stagedManifest = validateArtifactManifest({ revision: 'upload-validation', entries })
      return {
        operation, resource: routeResource(operation, { files }, principal), inScope: true,
        execute: async () => {
          const directory = await mkdtemp(join(tmpdir(), 'brambo-workflow-upload-'))
          try {
            for (const file of files) {
              const destination = join(directory, ...file.path.split('/'))
              await mkdir(dirname(destination), { recursive: true, mode: 0o700 })
              await writeFile(destination, file.bytes, { flag: 'wx', mode: file.executable ? 0o700 : 0o600 })
            }
            const result = validateArtifactManifest(await artifacts.stage(principal.namespace, directory))
            const expectedByPath = new Map(stagedManifest.entries.map((entry) => [entry.path, entry]))
            if (result.entries.length !== expectedByPath.size || result.entries.some((entry) => {
              const expected = expectedByPath.get(entry.path)
              return !expected || entry.digest !== expected.digest || entry.size !== expected.size || entry.executable !== expected.executable
            })) throw new Error('artifact provider returned a mismatched staged manifest')
            return { payload: result as unknown as JsonValue }
          } finally {
            await rm(directory, { recursive: true, force: true })
          }
        },
      }
    }
    case 'artifact.publish': {
      const data = object(payload, ['ref', 'manifest', 'lease'])
      const ref = workspaceRef(data['ref'])
      const artifactManifest = manifest(data['manifest'])
      const authority = lease(data['lease'])
      if (artifactManifest.revision !== ref.revision) invalid()
      return {
        operation,
        resource: routeResource(operation, { ref, manifest: artifactManifest, lease: authority }, principal),
        inScope: namespaceInScope(ref.namespace) && ownsLease(principal, authority) && authority.namespace === ref.namespace,
        execute: async () => { await artifacts.publish(ref, artifactManifest, authority); return { payload: { published: true } } },
      }
    }
  }
}

export function parseRequest(value: unknown): ProtocolRequest {
  try { return validateProtocolRequest(value) } catch { return invalid() }
}
