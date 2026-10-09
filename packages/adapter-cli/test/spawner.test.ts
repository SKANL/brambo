import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNodeChildSpawner, routesThroughCmdShim } from '../src/node-child-spawner.ts'
import { createClaudeCodeAdapter } from '../src/index.ts'

// Seam-level proofs that need node:child_process to misbehave on demand: the
// win32 cmd.exe reroute, the capture cap, and the post-exit kill guard. All
// three are process-lifecycle paths a fake ExecutorAdapter spawner cannot reach.

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), execFile: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: mocks.spawn, execFile: mocks.execFile }))

class FakeProcess extends EventEmitter {
  pid = 1234
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly stdin = new PassThrough()
  readonly received: string[] = []
  stdinEnded = false
  readonly kill = vi.fn()

  constructor() {
    super()
    this.stdin.on('data', (chunk: Buffer) => this.received.push(chunk.toString('utf8')))
    this.stdin.on('end', () => {
      this.stdinEnded = true
    })
    // The real stdin is consumed by the child; drain it so `end` fires.
    this.stdin.resume()
  }
}

const originalPlatform = process.platform
function setPlatform(platform: string): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}

function queueProcesses(count: number): FakeProcess[] {
  const processes = Array.from({ length: count }, () => new FakeProcess())
  let index = 0
  mocks.spawn.mockImplementation(() => processes[index++]!)
  return processes
}

beforeEach(() => {
  mocks.spawn.mockReset()
  mocks.execFile.mockReset()
})
afterEach(() => setPlatform(originalPlatform))

describe('routesThroughCmdShim', () => {
  it('flags exactly the win32 shim extensions', () => {
    setPlatform('win32')
    expect(routesThroughCmdShim('opencode.cmd')).toBe(true)
    expect(routesThroughCmdShim('OPENCODE.BAT')).toBe(true)
    expect(routesThroughCmdShim('opencode.exe')).toBe(false)
    setPlatform('linux')
    // No reroute off win32, therefore no shell, therefore nothing to refuse.
    expect(routesThroughCmdShim('opencode.cmd')).toBe(false)
  })
})

describe('spawn environment and line delivery', () => {
  it('isolates an adapter child to an explicit host-variable allowlist and caller overrides', async () => {
    const originalEnv = Object.getOwnPropertyDescriptor(process, 'env')!
    // Replace the whole environment: never inspect, copy, or assert on real values.
    Object.defineProperty(process, 'env', { value: {
      PATH: '/synthetic/bin', HOME: '/synthetic/home', USERPROFILE: 'C:/synthetic/profile',
      APPDATA: 'C:/synthetic/roaming', LOCALAPPDATA: 'C:/synthetic/local',
      SystemRoot: 'C:/synthetic/windows', TEMP: 'C:/synthetic/temp',
      BRAMBO_UNRELATED_SECRET: 'synthetic-canary', OTHER_API_KEY: 'synthetic-other-key',
      OPENAI_API_KEY: 'synthetic-openai-key', ANTHROPIC_API_KEY: 'synthetic-anthropic-key',
      NODE_OPTIONS: '--require synthetic-injection', PWD: '/synthetic/outside',
    }, configurable: true })
    try {
      const [proc] = queueProcesses(1)
      const adapter = createClaudeCodeAdapter({
        inheritEnv: ['PATH', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SystemRoot', 'TEMP', 'MISSING'],
        env: { OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', CLI_SETTING: 'synthetic-setting', PWD: '/escape' },
      })
      const running = adapter.run({ prompt: 'synthetic prompt', workspace: {
        id: 'environment-probe', rootPath: 'C:/synthetic/workspace', capabilities: ['read'],
      } })
      proc!.stdout.write('{"type":"result","subtype":"success","is_error":false,"result":"synthetic result"}\n')
      proc!.emit('close', 0)
      expect((await running).status).toBe('ok')
      const env = mocks.spawn.mock.calls[0]?.[2]?.env
      expect(env?.BRAMBO_UNRELATED_SECRET).toBeUndefined()
      expect(env?.OTHER_API_KEY).toBeUndefined()
      expect(env?.NODE_OPTIONS).toBeUndefined()
      expect(env).toEqual({
        PATH: '/synthetic/bin', HOME: '/synthetic/home', USERPROFILE: 'C:/synthetic/profile',
        APPDATA: 'C:/synthetic/roaming', LOCALAPPDATA: 'C:/synthetic/local',
        SystemRoot: 'C:/synthetic/windows', TEMP: 'C:/synthetic/temp',
        OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', CLI_SETTING: 'synthetic-setting',
        PWD: resolve('C:/synthetic/workspace'),
      })
    } finally {
      Object.defineProperty(process, 'env', originalEnv)
    }
  })

  it('supports no inheritance while preserving legacy inheritance when the allowlist is omitted', async () => {
    const originalEnv = Object.getOwnPropertyDescriptor(process, 'env')!
    Object.defineProperty(process, 'env', { value: { BRAMBO_CANARY: 'synthetic-canary' }, configurable: true })
    try {
      const processes = queueProcesses(2)
      const spawner = createNodeChildSpawner()
      const isolated = spawner.spawn('synthetic', [], {
        cwd: 'C:/synthetic/workspace', inheritEnv: [], env: { CLI_SETTING: 'synthetic-setting' },
      })
      const inherited = spawner.spawn('synthetic', [], { cwd: 'C:/synthetic/workspace' })
      processes.forEach((proc) => proc.emit('close', 0))
      await Promise.all([isolated.done, inherited.done])
      expect(mocks.spawn.mock.calls[0]?.[2]?.env).toEqual({ CLI_SETTING: 'synthetic-setting', PWD: resolve('C:/synthetic/workspace') })
      expect(mocks.spawn.mock.calls[1]?.[2]?.env?.BRAMBO_CANARY).toBe('synthetic-canary')
    } finally {
      Object.defineProperty(process, 'env', originalEnv)
    }
  })

  it('applies Windows environment overrides case-insensitively without duplicate path or PWD keys', async () => {
    setPlatform('win32')
    const originalEnv = Object.getOwnPropertyDescriptor(process, 'env')!
    Object.defineProperty(process, 'env', { value: { PATH: 'synthetic-inherited-path' }, configurable: true })
    try {
      const [proc] = queueProcesses(1)
      const child = createNodeChildSpawner().spawn('synthetic.exe', [], {
        cwd: 'C:/synthetic/workspace', inheritEnv: ['PATH'],
        env: { Path: 'synthetic-explicit-path', pwd: '/synthetic/escape' },
      })
      proc!.emit('close', 0)
      await child.done
      expect(mocks.spawn.mock.calls[0]?.[2]?.env).toEqual({ Path: 'synthetic-explicit-path', PWD: resolve('C:/synthetic/workspace') })
    } finally {
      Object.defineProperty(process, 'env', originalEnv)
    }
  })

  it.each([
    { order: 'uppercase first', env: { PWD: '/synthetic/upper', pwd: '/synthetic/lower' } },
    { order: 'lowercase first', env: { pwd: '/synthetic/lower', PWD: '/synthetic/upper' } },
  ])('enforces owned Windows PWD after both caller aliases ($order)', async ({ env }) => {
    setPlatform('win32')
    const originalEnv = Object.getOwnPropertyDescriptor(process, 'env')!
    Object.defineProperty(process, 'env', { value: {}, configurable: true })
    try {
      const [proc] = queueProcesses(1)
      const child = createNodeChildSpawner().spawn('synthetic.exe', [], {
        cwd: 'C:/synthetic/workspace', inheritEnv: [], env,
      })
      proc!.emit('close', 0)
      await child.done
      expect(mocks.spawn.mock.calls[0]?.[2]?.env).toEqual({ PWD: resolve('C:/synthetic/workspace') })
    } finally {
      Object.defineProperty(process, 'env', originalEnv)
    }
  })

  it('merges caller env over inherited values but owns PWD and emits complete lines without awaiting observers', async () => {
    setPlatform('linux')
    const [proc] = queueProcesses(1)
    const lines: string[] = []
    const child = createNodeChildSpawner().spawn('opencode', [], {
      cwd: 'C:/workspace',
      env: { BRAMBO_TEST_VALUE: 'yes', PWD: 'C:/escape' },
      onStdoutLine: (line) => lines.push(line),
    })

    expect(mocks.spawn.mock.calls[0]?.[2]?.env).toMatchObject({ BRAMBO_TEST_VALUE: 'yes' })
    expect(mocks.spawn.mock.calls[0]?.[2]?.env?.PWD).toBe(resolve('C:/workspace'))
    proc!.stdout.write('{"type":"text"}\npartial')
    proc!.stdout.write('-line\n')
    proc!.emit('close', 0)
    await child.done
    expect(lines).toEqual(['{"type":"text"}', 'partial-line'])
  })
})

describe('cmd.exe reroute', () => {
  it('replays buffered stdin onto the rerouted child', async () => {
    setPlatform('win32')
    const [first, second] = queueProcesses(2)

    const child = createNodeChildSpawner().spawn('opencode', ['run'], { cwd: tmpdir() })
    // The caller writes and closes stdin BEFORE the async EINVAL arrives — this
    // is the ordering that used to leave the rerouted child waiting forever.
    child.writeStdin('the prompt')
    child.endStdin()
    first!.emit('error', Object.assign(new Error('spawn EINVAL'), { code: 'EINVAL' }))
    await new Promise((resolve) => setImmediate(resolve))

    expect(mocks.spawn).toHaveBeenCalledTimes(2)
    expect(mocks.spawn.mock.calls[1]?.[0]).toBe('cmd.exe')
    expect(second!.received.join('')).toBe('the prompt')
    expect(second!.stdinEnded).toBe(true)

    second!.emit('close', 0)
    expect((await child.done).exitCode).toBe(0)
  })
})

describe('stream capture cap', () => {
  it('stops retaining output once the cap is reached', async () => {
    setPlatform('linux')
    const [proc] = queueProcesses(1)
    const child = createNodeChildSpawner().spawn('noisy', [], { cwd: tmpdir() })

    // Four times the cap, in chunks: a cap that fails to advance its counter
    // appends another cap-sized slice for every chunk after the first overflow.
    const chunk = Buffer.alloc(512 * 1024, 0x61)
    for (let i = 0; i < 8; i++) proc!.stdout.write(chunk)
    await new Promise((resolve) => setImmediate(resolve))
    proc!.emit('close', 0)

    const outcome = await child.done
    expect(outcome.stdout.length).toBe(1024 * 1024)
    expect(outcome.stdoutTruncated).toBe(true)
  })
})

describe('killTree', () => {
  it('terminates a live child', async () => {
    setPlatform('win32')
    queueProcesses(1)
    const child = createNodeChildSpawner().spawn('running', [], { cwd: tmpdir() })

    child.killTree()
    expect(mocks.execFile).toHaveBeenCalledTimes(1)
    expect(mocks.execFile.mock.calls[0]?.[1]).toEqual(['/pid', '1234', '/T', '/F'])
  })

  it('never signals after the child exited, because that pid may be recycled', async () => {
    setPlatform('win32')
    const [proc] = queueProcesses(1)
    const child = createNodeChildSpawner().spawn('finished', [], { cwd: tmpdir() })

    proc!.emit('close', 0)
    await child.done
    expect(child.settled).toBe(true)

    child.killTree()
    expect(mocks.execFile).not.toHaveBeenCalled()
    expect(proc!.kill).not.toHaveBeenCalled()
  })
})
