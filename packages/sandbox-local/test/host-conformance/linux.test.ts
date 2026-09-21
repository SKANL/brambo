import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createLinuxSandboxProvider } from '@brambodev/sandbox-local'

const describeLinuxConformance = process.platform === 'linux' && process.env['BRAMBO_RUN_SANDBOX_CONFORMANCE'] === '1'
  ? describe
  : describe.skip

const wait = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds))

describeLinuxConformance('local Linux sandbox host conformance', () => {
  it('enforces workspace-only writes, secret isolation, network denial, and descendant cleanup', async () => {
    const fixture = await mkdtemp(join(tmpdir(), 'brambo-linux-sandbox-conformance-'))
    const workspace = join(fixture, 'workspace')
    const outside = join(fixture, 'outside.txt')
    const outsideWorkspace = join('/var/tmp', `brambo-linux-sandbox-conformance-${process.pid}-${Date.now()}.txt`)
    const secret = join(fixture, 'secret.txt')
    const written = join(workspace, 'written.txt')
    const orphaned = join(workspace, 'orphaned.txt')
    const policy = {
      version: 1 as const,
      mode: 'workspace-write' as const,
      workspaceRoot: workspace,
      requiredCapabilities: { filesystem: 'full' as const },
    }

    await mkdir(workspace)
    await writeFile(outside, 'host-outside', 'utf8')
    await writeFile(secret, 'not-for-the-sandbox', 'utf8')

    try {
      const provider = await createLinuxSandboxProvider({})
      expect(provider.capabilities.enforcement).toBe('os')
      expect(provider.capabilities.controls.filesystem).toBe('full')
      expect(provider.capabilities.controls.network).toBe('full')
      expect(provider.capabilities.controls.process).toBe('none')
      expect(provider.capabilities.controls.resources).toBe('none')

      const session = await provider.createSession({ policy, snapshots: [] })
      try {
        const insideWrite = await session.execute({
          argv: [process.execPath, '--eval', `require('node:fs').writeFileSync(${JSON.stringify(written)}, 'written')`],
          cwd: workspace,
          environment: {},
          policy,
        })
        expect(insideWrite.status).toBe('ok')
        await expect(readFile(written, 'utf8')).resolves.toBe('written')

        const outsideWrite = await session.execute({
          argv: [process.execPath, '--eval', `require('node:fs').writeFileSync(${JSON.stringify(outside)}, 'escape')`],
          cwd: workspace,
          environment: {},
          policy,
        })
        expect(outsideWrite.status).toBe('ok')
        await expect(readFile(outside, 'utf8')).resolves.toBe('host-outside')

        if (provider.capabilities.enforcement === 'os' && provider.capabilities.controls.filesystem === 'full') {
          const outsideWorkspaceWrite = await session.execute({
            argv: [process.execPath, '--eval', `require('node:fs').writeFileSync(${JSON.stringify(outsideWorkspace)}, 'escape')`],
            cwd: workspace,
            environment: {},
            policy,
          })
          expect(outsideWorkspaceWrite.status).toBe('failed')
          expect(existsSync(outsideWorkspace)).toBe(false)
        }

        const secretRead = await session.execute({
          argv: [process.execPath, '--eval', `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(secret)}, 'utf8'))`],
          cwd: workspace,
          environment: {},
          policy,
        })
        expect(secretRead.status).toBe('failed')
        expect(secretRead.stdout).not.toContain('not-for-the-sandbox')

        const network = await session.execute({
          argv: [process.execPath, '--eval', "require('node:net').connect({ host: '1.1.1.1', port: 53 }).once('connect', () => process.exit(0)).once('error', () => process.exit(1))"],
          cwd: workspace,
          environment: {},
          policy,
        })
        expect(network.status).toBe('failed')

        const descendant = await session.execute({
          argv: [
            process.execPath,
            '--eval',
            "const { spawn } = require('node:child_process'); const child = spawn(process.execPath, ['--eval', \"setTimeout(() => require('node:fs').writeFileSync(process.argv[1], 'orphaned'), 500)\", process.argv[1]], { detached: true, stdio: 'ignore' }); child.unref()",
            orphaned,
          ],
          cwd: workspace,
          environment: {},
          policy,
        })
        expect(descendant.status).toBe('ok')
        await wait(1_000)
        expect(existsSync(orphaned)).toBe(false)
      } finally {
        await session.dispose()
      }
    } finally {
      await rm(outsideWorkspace, { force: true })
      await rm(fixture, { recursive: true, force: true })
    }
  })

  it('rejects read-only workspace writes after behavioral capability discovery', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'brambo-linux-read-only-'))
    const seed = join(workspace, 'seed')
    await writeFile(seed, 'original')
    const policy = { version: 1 as const, mode: 'read-only' as const, workspaceRoot: workspace, requiredCapabilities: { filesystem: 'full' as const } }
    try {
      const provider = await createLinuxSandboxProvider({})
      const session = await provider.createSession({ policy, snapshots: [] })
      try {
        const result = await session.execute({
          argv: [process.execPath, '--eval', "require('node:fs').writeFileSync('seed', 'changed')"],
          cwd: workspace, environment: {}, policy,
        })
        expect(result.status).toBe('failed')
        expect(result.stderr).toContain('EROFS')
        await expect(readFile(seed, 'utf8')).resolves.toBe('original')
      } finally { await session.dispose() }
    } finally { await rm(workspace, { recursive: true, force: true }) }
  })

  it.each(['missing', 'exit 1', 'exit 0'])('fails closed with a real %s helper', async (behavior) => {
    const directory = await mkdtemp(join(tmpdir(), 'brambo-linux-helper-'))
    const originalPath = process.env['PATH']
    try {
      if (behavior !== 'missing') await writeFile(join(directory, 'bwrap'), `#!/bin/sh\n${behavior}\n`, { mode: 0o700 })
      process.env['PATH'] = directory
      const provider = await createLinuxSandboxProvider({})
      expect(provider.capabilities).toMatchObject({
        enforcement: 'partial', controls: { filesystem: 'none', network: 'none', process: 'none', resources: 'none' },
      })
      await expect(provider.createSession({
        policy: { version: 1, mode: 'read-only', workspaceRoot: directory, requiredCapabilities: { filesystem: 'full' } },
        snapshots: [],
      })).rejects.toThrow()
    } finally {
      if (originalPath === undefined) delete process.env['PATH']
      else process.env['PATH'] = originalPath
      await rm(directory, { recursive: true, force: true })
    }
  })
})
