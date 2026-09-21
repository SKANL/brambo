import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProvider, DEFAULT_TIMEOUT_MS, probe } from './shared.ts'
import { createCgroupSession, detectCgroupV2 } from './cgroup.ts'
import type { SandboxExecutionRequest } from '@brambodev/contracts'
import type { LocalSandboxAuditCallback, LocalSandboxProvider, LocalSandboxProviderOptions } from './shared.ts'

export type LinuxSandboxProviderOptions = LocalSandboxProviderOptions & { readonly audit?: LocalSandboxAuditCallback }

const RUNTIME_DIRECTORIES = ['/usr', '/bin', '/lib', '/lib64', '/etc'] as const

function directoriesToCreate(path: string): string[] {
  const segments = path.split('/').filter(Boolean)
  return segments.map((_, index) => `/${segments.slice(0, index + 1).join('/')}`)
}

/** Builds only bwrap tokens. The target argv is appended after `--` without shell interpretation. */
export function buildBubblewrapArgv(request: SandboxExecutionRequest): readonly [string, ...string[]] {
  if (request.policy.networkMode === 'allowlist') {
    throw new Error('bubblewrap backend cannot enforce network allowlists')
  }
  const argv: string[] = [
    'bwrap', '--die-with-parent', '--new-session', '--unshare-user', '--unshare-pid',
    ...(request.policy.networkMode === 'unrestricted' ? [] : ['--unshare-net']), '--clearenv',
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

async function provesControl(request: SandboxExecutionRequest, marker: string): Promise<boolean> {
  const [command, ...args] = buildBubblewrapArgv(request)
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: false, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
    let stdout = ''
    let expired = false
    const timer = setTimeout(() => { expired = true; child.kill('SIGKILL') }, 3_000)
    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length + chunk.length > 4096) { expired = true; child.kill('SIGKILL') }
      else stdout += chunk.toString('utf8')
    })
    child.once('error', () => { clearTimeout(timer); resolve(false) })
    child.once('close', (code) => { clearTimeout(timer); resolve(!expired && code === 0 && stdout === `${marker}\n`) })
  })
}

/** Discovery is not evidence: exercise the same mounts and namespaces used by executions. */
async function bubblewrapEvidence(): Promise<{ filesystem: boolean; network: boolean }> {
  let fixture: string | undefined
  let filesystem = false
  const server = createServer((socket) => socket.end())
  try {
    fixture = await mkdtemp(join(tmpdir(), 'brambo-bwrap-probe-'))
    const workspace = join(fixture, 'workspace')
    const secret = join(fixture, 'secret')
    const marker = randomUUID()
    await mkdir(workspace)
    await writeFile(secret, marker)
    await writeFile(join(workspace, 'seed'), marker)
    await symlink(secret, join(workspace, 'escape'))
    const request = (script: string, mode: 'read-only' | 'workspace-write', networkMode: 'deny' | 'unrestricted' = 'deny'): SandboxExecutionRequest => ({
      argv: [process.execPath, '--eval', script], cwd: workspace,
      environment: { BRAMBO_PROBE_SECRET: marker },
      policy: { version: 1, mode, workspaceRoot: workspace, networkMode, requiredCapabilities: {} },
    })
    const prelude = `const fs = require('node:fs'), assert = require('node:assert/strict');
      assert.equal(fs.readFileSync('seed', 'utf8'), ${JSON.stringify(marker)});
      assert.equal(process.env.BRAMBO_PROBE_SECRET, undefined);
      for (const path of [${JSON.stringify(secret)}, 'escape']) assert.throws(() => fs.readFileSync(path), { code: 'ENOENT' });`
    const report = `console.log(${JSON.stringify(marker)})`
    const writable = await provesControl(request(`${prelude}
      fs.writeFileSync('written', ${JSON.stringify(marker)});
      fs.writeFileSync(${JSON.stringify(secret)}, 'private-tmp'); ${report}`, 'workspace-write'), marker)
    const readonly = await provesControl(request(`${prelude}
      assert.throws(() => fs.writeFileSync('seed', 'changed'), { code: 'EROFS' }); ${report}`, 'read-only'), marker)
    filesystem = writable && readonly &&
      await readFile(join(workspace, 'written'), 'utf8') === marker &&
      await readFile(join(workspace, 'seed'), 'utf8') === marker && await readFile(secret, 'utf8') === marker
    if (!filesystem) return { filesystem: false, network: false }

    // A reachable host listener is the positive control; no external DNS or Internet dependency.
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const address = server.address()
    if (address === null || typeof address === 'string') return { filesystem, network: false }
    const connection = `const socket = require('node:net').connect({ host: '127.0.0.1', port: ${address.port} });
      socket.setTimeout(1000, () => process.exit(2));`
    const reachable = await provesControl(request(`${connection}
      socket.once('connect', () => { socket.destroy(); ${report} });
      socket.once('error', () => process.exit(1));`, 'read-only', 'unrestricted'), marker)
    const denied = await provesControl(request(`${connection}
      socket.once('connect', () => process.exit(1));
      socket.once('error', (error) => { if (error.code !== 'ECONNREFUSED') process.exit(2); ${report} });`, 'read-only'), marker)
    return { filesystem, network: reachable && denied }
  } catch {
    return { filesystem, network: false }
  } finally {
    server.close()
    if (fixture !== undefined) await rm(fixture, { recursive: true, force: true })
  }
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
  const evidence = bubblewrap ? await bubblewrapEvidence() : { filesystem: false, network: false }
  const prlimit = isLinux && await functionalPrlimit(options)
  const landlock = isLinux && (await probe(options, ['landlock', '--version']))
  const cgroup = isLinux && await detectCgroupV2(options.cgroupFilesystem, options.cgroupRoot)
  return createProvider(
    'local-linux',
    { bubblewrap, landlock, cgroup, seatbelt: false, windowsSandboxBroker: false, jobObjectHelper: false },
    evidence.filesystem ? 'full' : 'none',
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    (request) => buildPrlimitArgv(request, bubblewrap ? buildBubblewrapArgv(request) : request.argv),
    options.runner,
    options.audit,
    {
      network: evidence.network ? 'full' : 'none',
      process: 'none',
      resources: 'none',
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
    bubblewrap ? ['unrestricted'] : [],
  )
}
