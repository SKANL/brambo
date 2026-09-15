import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

type Mapping = Record<string, unknown>
const repoRoot = join(import.meta.dirname, '..', '..', '..')
const workflowsRoot = join(repoRoot, '.github', 'workflows')
const workflowFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name)
  if (entry.isDirectory()) return workflowFiles(path)
  return /\.(yml|yaml)$/i.test(entry.name) ? [path] : []
})
const readWorkflow = (path: string): Mapping => parse(readFileSync(path, 'utf8')) as Mapping
const mapping = (value: unknown): Mapping => (value && typeof value === 'object' ? value as Mapping : {})
const jobsOf = (workflow: Mapping): Mapping => mapping(workflow.jobs)
const stepsOf = (job: Mapping): Mapping[] => Array.isArray(job.steps) ? job.steps.map(mapping) : []
const actionUses = (workflow: Mapping): string[] => Object.values(jobsOf(workflow)).flatMap((job) => [
  String(mapping(job).uses ?? ''),
  ...stepsOf(mapping(job)).map((step) => String(step.uses ?? '')),
].filter(Boolean))

describe('GitHub Actions workflow policy', () => {
  it('pins every external action to a full commit SHA', () => {
    const allUses = workflowFiles(workflowsRoot).flatMap((path) => actionUses(readWorkflow(path)))
    expect(allUses.length).toBeGreaterThan(0)
    expect(allUses.every((value) => /^[^@]+@[0-9a-f]{40}$/i.test(value))).toBe(true)
  })

  it('declares least privilege and bounds every job', () => {
    for (const path of workflowFiles(workflowsRoot)) {
      const workflow = readWorkflow(path)
      const workflowPermissions = mapping(workflow.permissions)
      expect(workflowPermissions.contents).toBe('read')
      for (const [permission, value] of Object.entries(workflowPermissions)) {
        if (value === 'write') expect(path.endsWith(join('.github', 'workflows', 'release.yml')) && permission === 'id-token').toBe(true)
      }
      for (const job of Object.values(jobsOf(workflow))) {
        const jobPermissions = mapping(mapping(job).permissions)
        expect(jobPermissions.contents).toBe('read')
        expect(mapping(job)['timeout-minutes']).toEqual(expect.any(Number))
        for (const [permission, value] of Object.entries(jobPermissions)) {
          if (value === 'write') expect(path.endsWith(join('.github', 'workflows', 'release.yml')) && permission === 'id-token').toBe(true)
        }
      }
    }
    expect(mapping(readWorkflow(join(workflowsRoot, 'release.yml')).permissions)['id-token']).toBe('write')
    expect(mapping(mapping(jobsOf(readWorkflow(join(workflowsRoot, 'release.yml'))).publish).permissions)['id-token']).toBe('write')
  })

  it('keeps blocking developer runtimes separate from the informational canary', () => {
    const gates = mapping(jobsOf(readWorkflow(join(workflowsRoot, 'ci.yml'))).gates)
    expect(mapping(mapping(gates.strategy).matrix)['node-version']).toEqual(['22.18.0', '22', '24', '26'])
    expect(gates['continue-on-error']).toBe("${{ matrix.node-version == '26' }}")
  })

  it('cancels only superseded pull-request CI and serializes all releases', () => {
    const ci = readWorkflow(join(workflowsRoot, 'ci.yml'))
    expect(mapping(ci.concurrency).group).toBe("${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}")
    expect(mapping(ci.concurrency)['cancel-in-progress']).toBe("${{ github.event_name == 'pull_request' }}")
    expect(readWorkflow(join(workflowsRoot, 'release.yml')).concurrency).toEqual({ group: 'release', 'cancel-in-progress': false })
  })

  it('binds release publication to npm protection, main ancestry, and provenance', () => {
    const publish = mapping(jobsOf(readWorkflow(join(workflowsRoot, 'release.yml'))).publish)
    expect(publish.environment).toBe('npm')
    const steps = stepsOf(publish)
    const scripts = steps.map((step) => String(step.run ?? '')).join('\n')
    expect(mapping(steps.find((step) => String(step.uses ?? '').startsWith('actions/checkout@'))?.with)['fetch-depth']).toBe(0)
    expect(scripts).toContain('git fetch origin main --no-tags')
    expect(scripts).not.toContain('test "$GITHUB_SHA" = "$(git rev-parse origin/main)"')
    expect(scripts).toContain('git merge-base --is-ancestor "$GITHUB_SHA" origin/main')
    expect(scripts).toContain('--provenance')
    expect(scripts).toContain('assert-provenance.mjs')
  })

  it('names packed artifacts by commit and run, and verifies the identity after download', () => {
    const jobs = jobsOf(readWorkflow(join(workflowsRoot, 'ci.yml')))
    const names = stepsOf(mapping(jobs['build-pack'])).map((step) => String(mapping(step.with).name ?? ''))
    const consumerText = stepsOf(mapping(jobs['consumer-floor'])).map((step) => String(step.run ?? '')).join('\n')
    expect(names).toContain('panda-publishable-tarballs-${{ github.sha }}-${{ github.run_id }}')
    expect(consumerText).toContain('GITHUB_SHA')
    expect(consumerText).toContain('GITHUB_RUN_ID')
  })

  it('runs sandbox conformance automatically only for relevant changes while retaining dispatch', () => {
    const workflow = readWorkflow(join(workflowsRoot, 'sandbox-conformance.yml'))
    const triggers = mapping(workflow.on)
    expect(triggers).toHaveProperty('workflow_dispatch')
    expect(triggers).toHaveProperty('pull_request')
    expect(triggers).toHaveProperty('push')
    const paths = [...((mapping(triggers.pull_request).paths ?? []) as string[]), ...((mapping(triggers.push).paths ?? []) as string[])]
    expect(paths).toContain('packages/sandbox/**')
    expect(paths).toContain('packages/sandbox-local/**')
    expect(stepsOf(mapping(jobsOf(workflow)['host-conformance'])).map((step) => String(step.run ?? '')).join('\n')).toContain('Missing real-host conformance suite')
  })
})
