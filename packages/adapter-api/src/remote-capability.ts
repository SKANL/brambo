import type {
  OwnedRemoteResource,
  ObservedRemoteResource,
  RemoteCapabilityGrant,
  RemoteCapabilityPolicy,
  RemoteCapabilityRequest,
  RemoteResourceLedger,
} from './types.ts'

const EGRESS_CAPABILITIES = new Set(['remote-mcp', 'hosted-web-search', 'provider-files'])

function requirePolicy(policy: RemoteCapabilityPolicy, capability: RemoteCapabilityRequest['capability']): void {
  if (!policy.allowedCapabilities.includes(capability)) {
    throw new Error(`remote capability '${capability}' is not granted by host policy`)
  }
  if (EGRESS_CAPABILITIES.has(capability) && !policy.allowEgress) {
    throw new Error(`remote capability '${capability}' requires explicit egress policy`)
  }
  if (capability === 'provider-files' && !policy.allowRetention) {
    throw new Error("remote capability 'provider-files' requires explicit retention policy")
  }
  if (capability === 'provider-files' && !policy.allowDeletion) {
    throw new Error("remote capability 'provider-files' requires explicit deletion policy")
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
  return `${resource.providerId}\u0000${resource.kind}\u0000${resource.id}`
}

/**
 * Tracks ownership synchronously so callers record a provider resource before
 * exposing its handle. Host-observed resources always win ownership conflicts.
 */
export function createRemoteResourceLedger(): RemoteResourceLedger {
  const owned = new Map<string, OwnedRemoteResource>()
  const observed = new Set<string>()
  let disposal: Promise<void> | undefined

  const ensureOpen = (): void => {
    if (disposal !== undefined) throw new Error('remote resource ledger is already disposing')
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

    dispose(remove: (resource: OwnedRemoteResource) => Promise<void>): Promise<void> {
      if (disposal !== undefined) return disposal
      const resources = [...owned.entries()]
        .filter(([key]) => !observed.has(key))
        .map(([, resource]) => resource)
      owned.clear()

      disposal = (async () => {
        const results = await Promise.allSettled(resources.map((resource) => remove(resource)))
        const errors = results.flatMap((result) => result.status === 'rejected' ? [result.reason] : [])
        if (errors.length > 0) throw new AggregateError(errors, 'remote resource cleanup failed')
      })()
      return disposal
    },
  }
}
