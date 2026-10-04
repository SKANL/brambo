import type { ExecutionDriver, DriverRequest } from '../execution-driver.ts'
import { validateDriverManifest } from '../execution-driver.ts'
import { validateEnvelope } from '../executor.ts'
import { failWith, pass, runClauses } from './clause.ts'
import type { Clause, RunOptions, SuiteReport } from './clause.ts'

export const DRIVER_SUITE = 'execution-driver'
export interface DriverContractSubject {
  readonly driver: ExecutionDriver
  readonly request: DriverRequest
}

async function invoke(driver: ExecutionDriver, request: DriverRequest): Promise<unknown> {
  const pending = driver.run(request)
  if (pending === null || typeof (pending as { then?: unknown })?.then !== 'function') {
    throw new Error('driver run must return a promise')
  }
  return pending
}

function checkedResult(outcome: unknown) {
  if (outcome === null || typeof outcome !== 'object' || !Object.hasOwn(outcome, 'result')) {
    throw new Error('driver outcome must carry a result envelope')
  }
  return validateEnvelope((outcome as { result: unknown }).result)
}

export const DRIVER_CLAUSES: readonly Clause<DriverContractSubject>[] = [
  {
    name: 'driver-manifest-conformance',
    check: async ({ driver }) => {
      validateDriverManifest(driver.manifest)
      return pass()
    },
  },
  {
    name: 'driver-outcome-conformance',
    check: async ({ driver, request }) => {
      checkedResult(await invoke(driver, request))
      return pass()
    },
  },
  {
    name: 'driver-cancellation',
    check: async ({ driver, request }) => {
      if (!driver.manifest.capabilities.includes('cancellation')) {
        return { ok: true, detail: 'cancellation not advertised; cancellation was not probed' }
      }
      const controller = new AbortController()
      // Start before aborting so this probes in-flight signal observation too.
      const pending = invoke(driver, { ...request, signal: controller.signal })
      controller.abort()
      const result = checkedResult(await pending)
      return result.status === 'cancelled' ? pass() : failWith('advertised cancellation did not yield a cancelled envelope')
    },
  },
]

/**
 * Executes the supplied driver using a host-owned isolated probe request. This
 * is active conformance testing, not a sandbox or proof of process termination.
 * A clause timeout bounds reporting only; the host must clean up its probe.
 */
export function runDriverContractSuite(driver: ExecutionDriver, request: DriverRequest, options?: RunOptions): Promise<SuiteReport> {
  return runClauses(DRIVER_SUITE, DRIVER_CLAUSES, { driver, request }, options)
}
