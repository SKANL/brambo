import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { BRAMBO_ERROR_CODES, BramboError } from '@brambodev/contracts'

export interface CgroupFilesystem {
  readFile(path: string): Promise<string>
  mkdir(path: string): Promise<void>
  writeFile(path: string, value: string): Promise<void>
  rm(path: string): Promise<void>
}

export interface CgroupSession {
  /** Whether this session can place a child in the cgroup before it executes. */
  readonly containsStartup: boolean
  attach(pid: number | undefined): Promise<void>
  teardown(): Promise<void>
}

const nativeFilesystem: CgroupFilesystem = { readFile: (path) => readFile(path, 'utf8'), mkdir: (path) => mkdir(path), writeFile: (path, value) => writeFile(path, value), rm: (path) => rm(path, { recursive: true, force: true }) }

function unavailable(message: string, cause: unknown): BramboError {
  return new BramboError(BRAMBO_ERROR_CODES.sandboxUnavailable, message, { cause })
}

export async function detectCgroupV2(filesystem: CgroupFilesystem = nativeFilesystem, root = '/sys/fs/cgroup'): Promise<boolean> {
  try {
    const controllers = (await filesystem.readFile(`${root}/cgroup.controllers`)).split(/\s+/).filter(Boolean)
    return controllers.includes('memory') && controllers.includes('pids')
  } catch {
    return false
  }
}

export async function createCgroupSession(
  filesystem: CgroupFilesystem = nativeFilesystem,
  root = '/sys/fs/cgroup',
  limits: {
    readonly memoryBytes?: number
    readonly processCount?: number
    readonly cpuQuotaMicros?: number
    readonly cpuPeriodMicros?: number
  } = {},
): Promise<CgroupSession> {
  try {
    const controllers = (await filesystem.readFile(`${root}/cgroup.controllers`)).split(/\s+/).filter(Boolean)
    if (limits.memoryBytes !== undefined && !controllers.includes('memory')) throw new Error('cgroup v2 memory controller is unavailable')
    if (limits.processCount !== undefined && !controllers.includes('pids')) throw new Error('cgroup v2 pids controller is unavailable')
    if (limits.cpuQuotaMicros !== undefined && !controllers.includes('cpu')) throw new Error('cgroup v2 cpu controller is unavailable')
    if (limits.cpuQuotaMicros !== undefined && limits.cpuPeriodMicros === undefined) throw new Error('cgroup v2 CPU quota requires a period')
    if (limits.cpuQuotaMicros === undefined && limits.cpuPeriodMicros !== undefined) throw new Error('cgroup v2 CPU period requires a quota')
    const path = `${root}/brambo-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    await filesystem.mkdir(path)
    try {
      if (limits.memoryBytes !== undefined) await filesystem.writeFile(`${path}/memory.max`, String(limits.memoryBytes))
      if (limits.processCount !== undefined) await filesystem.writeFile(`${path}/pids.max`, String(limits.processCount))
      if (limits.cpuQuotaMicros !== undefined && limits.cpuPeriodMicros !== undefined) {
        await filesystem.writeFile(`${path}/cpu.max`, `${limits.cpuQuotaMicros} ${limits.cpuPeriodMicros}`)
      }
    } catch (error) {
      await filesystem.rm(path).catch(() => undefined)
      throw error
    }
    return {
      // Writing a PID after node:child_process.spawn has returned leaves an
      // unbounded execution window. This direct cgroup-v2 implementation has no
      // pre-exec hook, so callers must refuse resource-limited execution.
      containsStartup: false,
      async attach(pid) {
        try {
          if (pid === undefined) throw new Error('sandbox child has no pid for cgroup attachment')
          await filesystem.writeFile(`${path}/cgroup.procs`, String(pid))
        } catch (error) {
          throw unavailable('sandbox cgroup attachment failed', error)
        }
      },
      async teardown() {
        try {
          await filesystem.rm(path)
        } catch (error) {
          throw unavailable('sandbox cgroup teardown failed', error)
        }
      },
    }
  } catch (error) {
    if (error instanceof BramboError) throw error
    throw unavailable('sandbox cgroup setup failed', error)
  }
}
