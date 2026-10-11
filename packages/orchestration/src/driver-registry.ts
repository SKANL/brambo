import { BramboError, BRAMBO_ERROR_CODES, validateDriverManifest } from '@brambodev/contracts'
import type { CapabilityId, DriverFactory, DriverManifest, DriverServices, StandardSchemaV1 } from '@brambodev/contracts'

export interface DriverRegistry {
  register(factory: DriverFactory): void
  resolve(id: string): DriverFactory
  list(): readonly DriverManifest[]
}

const refuse = (message: string): BramboError => new BramboError(BRAMBO_ERROR_CODES.orchestrationInvalid, message)

function snapshotManifest(input: DriverManifest): DriverManifest {
  validateDriverManifest(input)
  const standard = input.configurationSchema['~standard']
  // Preserve schema-library receivers, without freezing the host's schema instance.
  const validate = standard.validate.bind(standard)
  const configurationSchema: StandardSchemaV1 = Object.freeze({
    '~standard': Object.freeze({ version: 1 as const, validate }),
  })
  return Object.freeze({
    id: input.id, version: input.version, kind: input.kind,
    capabilities: Object.freeze([...input.capabilities]), configurationSchema,
  })
}

async function validatedConfiguration(schema: StandardSchemaV1, configuration: unknown): Promise<unknown> {
  try {
    const outcome = await schema['~standard'].validate(configuration)
    if (outcome === null || typeof outcome !== 'object' ||
        !Object.hasOwn(outcome, 'value') || outcome.issues !== undefined) {
      throw refuse('invalid driver configuration')
    }
    return outcome.value
  } catch {
    // Validator issues/exceptions can contain raw credentials. Never echo them.
    throw refuse('invalid driver configuration')
  }
}

export function createDriverRegistry(): DriverRegistry {
  const registered = new Map<string, DriverFactory>()
  return {
    register(factory) {
      const manifest = snapshotManifest(factory.manifest)
      if (registered.has(manifest.id)) throw refuse('driver already registered')
      if (typeof factory.create !== 'function') throw refuse('driver factory must expose create')
      const construct = factory.create.bind(factory)
      registered.set(manifest.id, Object.freeze({
        manifest,
        async create(configuration: unknown, services: DriverServices) {
          const validated = await validatedConfiguration(manifest.configurationSchema, configuration)
          const driver = await construct(validated, services)
          const actual = snapshotManifest(driver.manifest)
          if (typeof driver.run !== 'function' || actual.id !== manifest.id ||
              actual.version !== manifest.version || actual.kind !== manifest.kind ||
              actual.capabilities.length !== manifest.capabilities.length ||
              actual.capabilities.some((id) => !manifest.capabilities.includes(id))) {
            throw refuse('constructed driver manifest does not match registration')
          }
          const run = driver.run.bind(driver)
          return Object.freeze({ manifest, run })
        },
      }))
    },
    resolve(id) {
      const factory = registered.get(id)
      if (!factory) throw refuse('driver is not registered')
      return factory
    },
    list: () => Object.freeze([...registered.values()].map((factory) => factory.manifest)),
  }
}

export interface CapabilityNegotiation {
  readonly required: readonly CapabilityId[]
  readonly optional: readonly CapabilityId[]
  readonly driver: DriverManifest
  readonly runtime: readonly CapabilityId[]
  readonly policy: readonly CapabilityId[]
}

export function negotiateCapabilities(input: CapabilityNegotiation): {
  readonly effective: readonly CapabilityId[]
  readonly degraded: readonly CapabilityId[]
} {
  const driver = snapshotManifest(input.driver)
  const runtime = new Set(input.runtime)
  const policy = new Set(input.policy)
  const effective = driver.capabilities.filter((id) => runtime.has(id) && policy.has(id))
  const supported = new Set(effective)
  if (input.required.some((id) => !supported.has(id))) throw refuse('unsupported required capability')
  return Object.freeze({
    effective: Object.freeze(effective),
    degraded: Object.freeze([...new Set(input.optional)].filter((id) => !supported.has(id))),
  })
}
