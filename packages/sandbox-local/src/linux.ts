import { spawn } from 'node:child_process'
import { createProvider, DEFAULT_TIMEOUT_MS, probe } from './shared.ts'
import { createCgroupSession, detectCgroupV2 } from './cgroup.ts'
import type { SandboxExecutionRequest } from '@skanl/panda-contracts'
import type { LocalSandboxAuditCallback, LocalSandboxProvider, LocalSandboxProviderOptions } from './shared.ts'

export type LinuxSandboxProviderOptions = LocalSandboxProviderOptions & { readonly audit?: LocalSandboxAuditCallback }

const RUNTIME_DIRECTORIES = ['/usr', '/bin', '/lib', '/lib64', '/etc'] as const

function directoriesToCreate(path: string): string[] {
  const segments = path.split('/').filter(Boolean)
  return segments.map((_, index) => `/${segments.slice(0, index + 1).join('/')}`)
}

/** Builds only bwrap tokens. The target argv is appended after `--` without shell interpretation. */
export function buildBubblewrapArgv(request: SandboxExecutionRequest): readonly [string, ...string[]] {
  const argv: string[] = [
    'bwrap', '--die-with-parent', '--new-session', '--unshare-user', '--unshare-pid', '--unshare-net', '--clearenv',
    '--tmpfs', '/', '--proc', '/proc', '--dev', '/dev',
    '--dir', '/tmp', '--tmpfs', '/tmp',
  ]
  for (const directory of RUNTIME_DIRECTORIES) argv.push('--dir', directory, '--ro-bind', directory, directory)
  for (const directory of directoriesToCreate(request.policy.workspaceRoot)) {
    if (!RUNTIME_DIRECTORIES.includes(directory as (typeof RUNTIME_DIRECTORIES)[number]) && directory !== '/tmp') argv.push('--dir', directory)
  }
  argv.push(request.policy.mode === 'workspace-write' ? '--bind' : '--ro-bind', request.policy.workspaceRoot, request.policy.workspaceRoot)
  for (const directory of directoriesToCreate(request.cwd)) {
    if (directory !== request.policy.workspaceRoot) argv.push('--dir', directory)
  }
  argv.push('--chdir', request.cwd)
  for (const [key, value] of Object.entries(request.environment)) {
    if (!/(?:token|secret|password|credential|api[_-]?key|authorization|cookie)/i.test(key)) argv.push('--setenv', key, value)
  }
  argv.push('--', ...request.argv)
  return argv as [string, ...string[]]
}

async function functionalBubblewrap(): Promise<boolean> {
  const argv = buildBubblewrapArgv({
    argv: ['/bin/true'], cwd: '/tmp', environment: {},
    policy: { version: 1, mode: 'read-only', workspaceRoot: '/tmp', requiredCapabilities: { filesystem: 'full' } },
  })
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), { shell: false, stdio: 'ignore', windowsHide: true })
    const timer = setTimeout(() => child.kill('SIGKILL'), 3_000)
    child.once('error', () => { clearTimeout(timer); resolve(false) })
    child.once('close', (code) => { clearTimeout(timer); resolve(code === 0) })
  })
}

async function functionalPrlimit(options: LinuxSandboxProviderOptions): Promise<boolean> {
  const argv = ['/usr/bin/prlimit', '--version'] as const
  if (options.inspect !== undefined) return options.inspect(argv)
  return new Promise((resolve) => {
    const child = spawn(argv[0], [argv[1]], { shell: false, stdio: 'ignore', windowsHide: true })
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(false) }, 3_000)
    child.once('error', () => { clearTimeout(timer); resolve(false) })
    child.once('close', (code) => { clearTimeout(timer); resolve(code === 0) })
  })
}

export function buildPrlimitArgv(request: SandboxExecutionRequest, baseArgv: readonly [string, ...string[]]): readonly [string, ...string[]] {
  const fileSizeBytes = request.policy.resourceLimits?.fileSizeBytes
  if (fileSizeBytes === undefined) return baseArgv
  return ['/usr/bin/prlimit', `--fsize=${fileSizeBytes}`, '--', ...baseArgv] as [string, ...string[]]
}

export async function createLinuxSandboxProvider(options: LinuxSandboxProviderOptions): Promise<LocalSandboxProvider> {
  const isLinux = (options.platform ?? process.platform) === 'linux'
  const bubblewrap = isLinux && await functionalBubblewrap()
  const prlimit = isLinux && await functionalPrlimit(options)
  const landlock = isLinux && (await probe(options, ['landlock', '--version']))
  const cgroup = isLinux && await detectCgroupV2(options.cgroupFilesystem, options.cgroupRoot)
  return createProvider(
    'local-linux',
    { bubblewrap, landlock, cgroup, seatbelt: false, windowsSandboxBroker: false, jobObjectHelper: false },
    bubblewrap ? 'full' : 'none',
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    (request) => buildPrlimitArgv(request, bubblewrap ? buildBubblewrapArgv(request) : request.argv),
    options.runner,
    options.audit,
    {
      network: bubblewrap ? 'full' : 'none',
      process: bubblewrap ? 'full' : 'none',
      resources: cgroup ? 'full' : 'none',
    },
    async (policy) => {
      const limits = policy.resourceLimits
      if (limits === undefined || (
        limits.memoryBytes === undefined &&
        limits.processCount === undefined &&
        limits.cpuQuotaMicros === undefined &&
        limits.cpuPeriodMicros === undefined
      )) return undefined
      if (!cgroup) throw new Error(
        limits.memoryBytes !== undefined || limits.processCount !== undefined
          ? 'requested resource limits require cgroup v2 memory/pids enforcement'
          : 'requested CPU limits require cgroup v2 CPU enforcement',
      )
      return createCgroupSession(options.cgroupFilesystem, options.cgroupRoot, limits)
    },
    prlimit ? ['fileSizeBytes'] : [],
  )
}
