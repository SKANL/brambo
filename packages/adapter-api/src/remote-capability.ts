import type {
  OwnedRemoteResource,
  ObservedRemoteResource,
  RemoteCapabilityGrant,
  RemoteCapabilityPolicy,
  RemoteCapabilityRequest,
  RemoteResourceLedger,
} from './types.ts'

type RemotePolicyRequirements = Readonly<{
  retention?: true
  deletion?: true
}>

/**
 * Only provider-hosted capabilities belong at this boundary. This map is
 * deliberately closed: a new executor capability cannot be remotely
 * authorized until its egress and remote-state requirements are classified.
 */
const REMOTE_CAPABILITY_REQUIREMENTS: Readonly<Partial<Record<RemoteCapabilityRequest['capability'], RemotePolicyRequirements>>> = {
  'conversation-state': { retention: true, deletion: true },
  'prompt-caching': { retention: true },
  'extended-thinking': {},
  'provider-files': { retention: true, deletion: true },
  'remote-mcp': {},
  'hosted-web-search': {},
}

function requirePolicy(policy: RemoteCapabilityPolicy, capability: RemoteCapabilityRequest['capability']): void {
  const requirements = REMOTE_CAPABILITY_REQUIREMENTS[capability]
  if (requirements === undefined) {
    throw new Error(`executor capability '${capability}' is not provider-hosted and cannot be authorized remotely`)
  }
  if (!policy.allowedCapabilities.includes(capability)) {
    throw new Error(`remote capability '${capability}' is not granted by host policy`)
  }
  if (!policy.allowEgress) {
    throw new Error(`remote capability '${capability}' requires explicit egress policy`)
  }
  if (requirements.retention && !policy.allowRetention) {
    throw new Error(`remote capability '${capability}' requires explicit retention policy`)
  }
  if (requirements.deletion && !policy.allowDeletion) {
    throw new Error(`remote capability '${capability}' requires explicit deletion policy`)
  }
}

/**
 * Fails closed unless the provider advertises, the host selects, and host policy
 * positively grants the requested externally executed capability.
 */
export function authorizeRemoteCapability(request: RemoteCapabilityRequest): RemoteCapabilityGrant {
  if (!request.advertised.includes(request.capability)) {
    throw new Error(`remote capability '${request.capability}' is not advertised by provider`)
  }
  if (!request.selected.includes(request.capability)) {
    throw new Error(`remote capability '${request.capability}' is not selected by host`)
  }
  requirePolicy(request.policy, request.capability)
  return Object.freeze({ capability: request.capability })
}

function resourceKey(resource: OwnedRemoteResource | ObservedRemoteResource): string {
  return JSON.stringify([resource.providerId, resource.kind, resource.id])
}

/**
 * Tracks ownership synchronously so callers record a provider resource before
 * exposing its handle. Host-observed resources always win ownership conflicts.
 */
export function createRemoteResourceLedger(): RemoteResourceLedger {
  const owned = new Map<string, OwnedRemoteResource>()
  const observed = new Set<string>()
  let state: 'open' | 'disposing' | 'disposed' = 'open'
  let disposal: Promise<void> | undefined

  const ensureOpen = (): void => {
    if (state !== 'open') throw new Error(`remote resource ledger is already ${state}`)
  }

  return {
    record(resource: OwnedRemoteResource): void {
      ensureOpen()
      const key = resourceKey(resource)
      if (observed.has(key)) throw new Error('cannot record a host-observed remote resource as adapter-owned')
      owned.set(key, Object.freeze({ ...resource }))
    },

    observe(resource: ObservedRemoteResource): void {
      ensureOpen()
      const key = resourceKey(resource)
      observed.add(key)
      owned.delete(key)
    },

    dispose(remove: (resource: OwnedRemoteResource) => void | Promise<void>): Promise<void> {
      if (disposal !== undefined) return disposal
      const resources = [...owned.entries()]
        .filter(([key]) => !observed.has(key))
        .map(([, resource]) => resource)
      owned.clear()

      state = 'disposing'
      disposal = Promise.allSettled(resources.map((resource) => Promise.resolve().then(() => remove(resource))))
        .then((results) => {
          const errors = results.flatMap((result) => result.status === 'rejected' ? [result.reason] : [])
          if (errors.length > 0) throw new AggregateError(errors, 'remote resource cleanup failed')
        })
        .finally(() => { state = 'disposed' })
      return disposal
    },
  }
}
