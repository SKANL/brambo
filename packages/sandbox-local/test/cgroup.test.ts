import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { createLinuxSandboxProvider } from '../src/linux.ts'
import { createProvider } from '../src/shared.ts'
import type { CgroupFilesystem, CgroupSession } from '../src/cgroup.ts'

class FakeCgroupFilesystem implements CgroupFilesystem {
  readonly files = new Map<string, string>([
    ['/sys/fs/cgroup/cgroup.controllers', 'memory pids cpu'],
  ])
  readonly directories: string[] = []

  async readFile(path: string): Promise<string> {
    const value = this.files.get(path)
    if (value === undefined) throw new Error(`missing ${path}`)
    return value
  }

  async mkdir(path: string): Promise<void> { this.directories.push(path) }

  async writeFile(path: string, value: string): Promise<void> { this.files.set(path, value) }

  async rm(path: string): Promise<void> { this.directories.splice(this.directories.indexOf(path), 1) }
}

class FailingSetupFilesystem extends FakeCgroupFilesystem {
  override async writeFile(path: string, value: string): Promise<void> {
    if (path.endsWith('/memory.max')) throw new Error('permission denied')
    return super.writeFile(path, value)
  }
}

class FakeChild extends EventEmitter {
  readonly pid = 123
  readonly stdout = Object.assign(new EventEmitter(), { setEncoding: (): void => undefined })
  readonly stderr = new EventEmitter()
  killed = false
  kill = (): boolean => { this.killed = true; return true }
}

class RefusingTerminationChild extends FakeChild {
  override kill = (): boolean => false
}

function safeCgroup(overrides: Partial<CgroupSession> = {}): CgroupSession {
  return {
    containsStartup: true,
    attach: async () => undefined,
    teardown: async () => undefined,
    ...overrides,
  }
}

function providerWithSafeCgroup(cgroup: CgroupSession, runner: () => FakeChild, timeoutMs = 1) {
  return createProvider(
    'local-linux-test',
    { bubblewrap: false, landlock: false, cgroup: true, seatbelt: false, windowsSandboxBroker: false, jobObjectHelper: false },
    'full',
    timeoutMs,
    undefined,
    () => runner() as never,
    undefined,
    { resources: 'full' },
    async () => cgroup,
  )
}

const policy = {
  version: 1 as const,
  mode: 'danger-full-access' as const,
  workspaceRoot: process.cwd(),
  requiredCapabilities: {},
  allowDangerous: true as const,
  resourceLimits: {
    memoryBytes: 1024,
    processCount: 2,
    cpuQuotaMicros: 25_000,
    cpuPeriodMicros: 100_000,
  },
}

describe('Linux cgroup v2 resource enforcement', () => {
  it('detects controllers from cgroup v2 and does not use executable probes', async () => {
    const filesystem = new FakeCgroupFilesystem()
    const probes: string[] = []
    const provider = await createLinuxSandboxProvider({
      platform: 'linux',
      inspect: async (argv) => { probes.push(argv[0]); return false },
      cgroupFilesystem: filesystem,
    })

    expect(provider.discovery.cgroup).toBe(true)
    expect(probes).not.toContain('systemd-run')
  })

  it('fails closed before spawn when direct cgroup attachment cannot contain startup', async () => {
    const filesystem = new FakeCgroupFilesystem()
    const child = new FakeChild()
    let spawns = 0
    const provider = await createLinuxSandboxProvider({
      platform: 'linux',
      cgroupFilesystem: filesystem,
      runner: () => { spawns += 1; return child as never },
    })
    const session = await provider.createSession({ policy, snapshots: [] })

    await expect(session.execute({ argv: ['/bin/true'], cwd: process.cwd(), environment: {}, policy }))
      .resolves.toMatchObject({ status: 'unavailable', error: { code: 'BRAMBO_SANDBOX_UNAVAILABLE' } })
    expect(spawns).toBe(0)
    const cgroup = filesystem.directories[0]!
    expect(filesystem.files.get(`${cgroup}/memory.max`)).toBe('1024')
    expect(filesystem.files.get(`${cgroup}/pids.max`)).toBe('2')
    expect(filesystem.files.get(`${cgroup}/cpu.max`)).toBe('25000 100000')
    expect(filesystem.files.get(`${cgroup}/cgroup.procs`)).toBeUndefined()

    await session.dispose()
    expect(filesystem.directories).toEqual([])
  })

  it.each([
    ['memory', 'pids'],
    ['pids', 'memory'],
  ])('reports resources unavailable when the %s controller is missing', async (...values: [string, string]) => {
    const available = values[0]
    const filesystem = new FakeCgroupFilesystem()
    filesystem.files.set('/sys/fs/cgroup/cgroup.controllers', available)
    const provider = await createLinuxSandboxProvider({ platform: 'linux', cgroupFilesystem: filesystem })

    expect(provider.discovery.cgroup).toBe(false)
    await expect(provider.createSession({ policy, snapshots: [] })).rejects.toThrow('require cgroup v2 memory/pids enforcement')
    expect(filesystem.directories).toEqual([])
  })

  it('maps cgroup setup failures to the canonical sandbox unavailable error', async () => {
    const filesystem = new FailingSetupFilesystem()
    filesystem.files.set('/sys/fs/cgroup/cgroup.controllers', 'memory pids')
    const provider = await createLinuxSandboxProvider({ platform: 'linux', cgroupFilesystem: filesystem })

    await expect(provider.createSession({ policy, snapshots: [] })).rejects.toMatchObject({ code: 'BRAMBO_SANDBOX_UNAVAILABLE' })
  })

  it('maps a CPU quota and period to cgroup v2 cpu.max', async () => {
    const filesystem = new FakeCgroupFilesystem()
    const session = await import('../src/cgroup.ts').then(({ createCgroupSession }) => createCgroupSession(filesystem, '/sys/fs/cgroup', {
      cpuQuotaMicros: 25_000,
      cpuPeriodMicros: 100_000,
    } as never))

    const cgroup = filesystem.directories[0]!
    expect(filesystem.files.get(`${cgroup}/cpu.max`)).toBe('25000 100000')
    await session.teardown()
    expect(filesystem.directories).toEqual([])
  })

  it('fails closed when a CPU quota is requested without the CPU controller', async () => {
    const filesystem = new FakeCgroupFilesystem()
    filesystem.files.set('/sys/fs/cgroup/cgroup.controllers', 'memory pids')

    const { createCgroupSession } = await import('../src/cgroup.ts')
    await expect(createCgroupSession(filesystem, '/sys/fs/cgroup', {
      cpuQuotaMicros: 25_000,
      cpuPeriodMicros: 100_000,
    } as never)).rejects.toMatchObject({ code: 'BRAMBO_SANDBOX_UNAVAILABLE' })
    expect(filesystem.directories).toEqual([])
  })

  it('returns unavailable and kills a safely precontained child when PID attachment fails', async () => {
    const child = new FakeChild()
    const provider = providerWithSafeCgroup(safeCgroup({ attach: async () => { throw new Error('permission denied') } }), () => child)
    const session = await provider.createSession({ policy, snapshots: [] })

    const resultPromise = session.execute({ argv: ['/bin/true'], cwd: process.cwd(), environment: {}, policy })
    const result = await resultPromise
    expect(result).toMatchObject({ status: 'unavailable', error: { code: 'BRAMBO_SANDBOX_UNAVAILABLE' } })
    expect(child.killed).toBe(true)
    child.emit('close', null)
    await session.dispose()
  })

  it('fails closed before spawning stdio because direct cgroup attachment cannot contain startup', async () => {
    const filesystem = new FakeCgroupFilesystem()
    let spawns = 0
    const provider = await createLinuxSandboxProvider({
      platform: 'linux',
      cgroupFilesystem: filesystem,
      runner: () => { spawns += 1; return new FakeChild() as never },
    })
    const session = await provider.createSession({ policy, snapshots: [] })

    await expect(session.openStdio!({ argv: ['/bin/cat'], cwd: process.cwd(), environment: {}, policy }))
      .rejects.toMatchObject({ code: 'BRAMBO_SANDBOX_UNAVAILABLE' })
    expect(spawns).toBe(0)
  })

  it('invalidates the session and does not return unavailable when attachment failure cannot terminate the child', async () => {
    const child = new RefusingTerminationChild()
    const provider = providerWithSafeCgroup(safeCgroup({ attach: async () => { throw new Error('permission denied') } }), () => child)
    const session = await provider.createSession({ policy, snapshots: [] })

    await expect(session.execute({ argv: ['/bin/true'], cwd: process.cwd(), environment: {}, policy }))
      .resolves.toMatchObject({ status: 'failed', error: { code: 'BRAMBO_SANDBOX_RUNNER_FAILED' } })
    await expect(session.execute({ argv: ['/bin/true'], cwd: process.cwd(), environment: {}, policy }))
      .resolves.toMatchObject({ status: 'unavailable', error: { code: 'BRAMBO_SANDBOX_UNAVAILABLE' } })
  })

  it('rejects stdio when attachment fails and terminates the safely precontained child', async () => {
    const child = new FakeChild()
    const provider = providerWithSafeCgroup(safeCgroup({ attach: async () => { throw new Error('permission denied') } }), () => child)
    const session = await provider.createSession({ policy, snapshots: [] })

    await expect(session.openStdio!({ argv: ['/bin/cat'], cwd: process.cwd(), environment: {}, policy }))
      .rejects.toMatchObject({ code: 'BRAMBO_SANDBOX_UNAVAILABLE' })
    expect(child.killed).toBe(true)
    child.emit('close', null)
    await session.dispose()
  })

  it('tears down the cgroup after child cleanup failure and invalidates the session', async () => {
    const child = new FakeChild()
    let teardowns = 0
    let markStarted!: () => void
    const started = new Promise<void>((resolve) => { markStarted = resolve })
    const provider = providerWithSafeCgroup(safeCgroup({ teardown: async () => { teardowns += 1 } }), () => {
      markStarted()
      return child
    })
    const session = await provider.createSession({ policy, snapshots: [] })
    void session.execute({ argv: ['/bin/true'], cwd: process.cwd(), environment: {}, policy })
    await started

    await expect(session.dispose()).rejects.toMatchObject({ code: 'BRAMBO_SANDBOX_UNAVAILABLE' })
    expect(teardowns).toBe(1)
    await expect(session.execute({ argv: ['/bin/true'], cwd: process.cwd(), environment: {}, policy }))
      .resolves.toMatchObject({ status: 'unavailable' })
  })
})
