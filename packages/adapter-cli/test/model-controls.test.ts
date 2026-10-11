import { describe, expect, it } from 'vitest'
import { defineStandardSchema } from '@brambodev/contracts'
import type { EffectiveExecutionConfiguration, RunRequest, JsonObject, JsonValue } from '@brambodev/contracts'
import * as cli from '../src/index.ts'
import { FakeSpawner } from './fake-spawner.ts'

const request: RunRequest = { prompt: '-synthetic prompt & untouched', workspace: {
  id: 'controls-probe', rootPath: 'C:/synthetic/workspace', capabilities: ['read'],
} }
const fixtures = [
  { id: 'codex', version: '0.162.1', key: 'reasoningEffort', value: 'high', model: 'fixture-model',
    create: cli.createCodexAdapter, traits: cli.CODEX_TRAITS, contract: 'CODEX_CONTROL_CONTRACT',
    stdout: '{"type":"item.completed","item":{"type":"agent_message","text":"ok"}}',
    args: ['exec', '--json', '--skip-git-repo-check', '--model', 'fixture-model', '--config', 'model_reasoning_effort="high"'],
    baseline: ['exec', '--json', '--skip-git-repo-check'], raw: ['--config=model_reasoning_effort="low"'] },
  { id: 'claude-code', version: '2.1.111', key: 'effort', value: 'xhigh', model: 'fixture-model',
    create: cli.createClaudeCodeAdapter, traits: cli.CLAUDE_CODE_TRAITS, contract: 'CLAUDE_CODE_CONTROL_CONTRACT',
    stdout: '{"type":"result","subtype":"success","is_error":false,"result":"ok"}',
    args: ['--print', '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--dangerously-skip-permissions', '--model', 'fixture-model', '--effort', 'xhigh'],
    baseline: ['--print', '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--dangerously-skip-permissions'], raw: ['--effort=low'] },
  { id: 'opencode', version: '1.18.35', key: 'variant', value: 'custom-native', model: 'fixture-provider/fixture-model',
    create: cli.createOpenCodeAdapter, traits: cli.OPENCODE_TRAITS, contract: 'OPENCODE_CONTROL_CONTRACT',
    stdout: '{"type":"text","part":{"type":"text","text":"ok"}}',
    args: ['run', '--format', 'json', '--model', 'fixture-provider/fixture-model', '--variant', 'custom-native'],
    baseline: ['run', '--format', 'json'], raw: ['-mfixture-provider/other-model'] },
] as const
function effective(fixture: typeof fixtures[number], overrides: Partial<EffectiveExecutionConfiguration> = {}): EffectiveExecutionConfiguration {
  return { version: 1, providerId: fixture.id, executorVersion: fixture.version, model: fixture.model,
    configuration: { [fixture.key]: fixture.value }, extensions: [],
    support: [{ id: `${fixture.id}:${fixture.key}`, status: 'supported', version: 'host-model-evidence-v1' }], ...overrides }
}
function fake(fixture: typeof fixtures[number]): FakeSpawner {
  return new FakeSpawner({ exitCode: 0, stdout: fixture.stdout, stderr: '' })
}

it('public CLI builder accepts explicit undefined issues in a successful custom configuration schema', () => {
  const fixture = fixtures[0]
  const contract = { ...cli.CODEX_CONTROL_CONTRACT,
    configurationSchema: defineStandardSchema<JsonObject>(value => ({ value: value as JsonObject, issues: undefined })) }
  const traits = { ...fixture.traits, modelControls: { ...fixture.traits.modelControls!, contract } }
  expect(cli.buildCliModelArguments(traits, effective(fixture), fixture.version)).toEqual(fixture.args)
})

it('public CLI builder rejects malformed and accessor schema successes without evaluating them', () => {
  const fixture = fixtures[0]
  for (const field of ['value', 'issues'] as const) {
    let calls = 0
    const contract = { ...cli.CODEX_CONTROL_CONTRACT, configurationSchema: defineStandardSchema<JsonObject>(value =>
      Object.defineProperty({ value: value as JsonObject }, field, { enumerable: true, get: () => { calls++; throw new Error('synthetic-secret') } })) }
    const traits = { ...fixture.traits, modelControls: { ...fixture.traits.modelControls!, contract } }
    expect(() => cli.buildCliModelArguments(traits, effective(fixture), fixture.version)).toThrow()
    expect(calls).toBe(0)
  }
})

describe.each(fixtures)('CLI typed $id', (fixture) => {
  it('model controls preserve command scope and policy argv at the spawn seam (wrong-position regression)', async () => {
    const spawner = fake(fixture)
    const result = await fixture.create({ spawner, executorVersion: fixture.version }).run({ ...request, executionConfiguration: effective(fixture) })
    const args = fixture.id === 'opencode' ? [...fixture.args, '--', request.prompt] : [...fixture.args]
    expect(spawner.children[0]?.args).toEqual(args)
    expect(result.status).toBe('ok')
    expect(result.summary).toBe('ok')
    expect(spawner.children[0]?.stdinChunks).toEqual(fixture.id === 'opencode' ? [] : [request.prompt])
    expect(spawner.children[0]?.stdinEnded).toBe(true)
  })
  it('per-run configuration replaces factory controls without contaminating later invocations', async () => {
    const spawner = fake(fixture)
    const defaults = effective(fixture)
    const adapter = fixture.create({ spawner, executorVersion: fixture.version, modelControls: defaults })
    const override = effective(fixture, { model: fixture.id === 'opencode' ? 'custom/override' : 'override', configuration: {}, support: [] })
    await adapter.run({ ...request, executionConfiguration: override })
    await adapter.run(request)
    expect(spawner.children[0]?.args).toContain(override.model)
    expect(spawner.children[0]?.args).not.toContain(fixture.value)
    expect(spawner.children[1]?.args).toContain(fixture.model)
    expect(spawner.children[1]?.args).toContain(fixture.id === 'codex' ? 'model_reasoning_effort="high"' : fixture.value)
  })
  it('public builder returns full documented argv and contract rejects unknown configuration fields', () => {
    const surface = cli as unknown as Record<string, unknown>
    expect(surface['buildCliModelArguments']).toBeTypeOf('function')
    const build = surface['buildCliModelArguments'] as (traits: cli.ExecutorTraits, value: EffectiveExecutionConfiguration, version: string) => readonly string[]
    expect(build(fixture.traits, effective(fixture), fixture.version)).toEqual(fixture.args)
    const contract = surface[fixture.contract] as { configurationSchema: { '~standard': { validate(value: unknown): unknown } } }
    expect(contract.configurationSchema['~standard'].validate({ sandbox: 'synthetic-secret' })).toHaveProperty('issues')
  })
  it('model-only controls and omitted model preserve the native default', async () => {
    const spawner = fake(fixture)
    await fixture.create({ spawner, executorVersion: fixture.version }).run({ ...request,
      executionConfiguration: effective(fixture, { model: undefined, configuration: {}, support: [] }) })
    expect(spawner.children[0]?.args).toEqual(fixture.id === 'opencode' ? [...fixture.baseline, '--', request.prompt] : fixture.baseline)
  })
})

describe.each(fixtures)('CLI invalid $id controls spawn zero children', (fixture) => {
  const cases: readonly [string, Partial<EffectiveExecutionConfiguration>][] = [
    ['unknown/reserved policy field', { configuration: { sandbox: 'synthetic-secret' }, support: [] }],
    ['auth field', { configuration: { auth: 'synthetic-secret' }, support: [] }],
    ['duplicate model configuration', { configuration: { model: 'synthetic-secret' }, support: [] }],
    ['wrong provider', { providerId: 'foreign-provider' }],
    ['unsupported declared version', { executorVersion: '999.0.0' }],
    ['missing effective version', { executorVersion: undefined }],
    ['invalid native value', { configuration: { [fixture.key]: '--synthetic-secret' } }],
    ['unknown extension', { configuration: {}, extensions: [{ id: 'foreign:auth', value: 'synthetic-secret' }], support: [{ id: 'foreign:auth', status: 'supported', version: 'v1' }] }],
    ['missing support receipt', { support: [] }],
    ['unsafe model flag', { model: '--synthetic-secret' }],
  ]
  it.each(cases)('rejects %s before spawn without echoing values', async (_name, overrides) => {
    const spawner = fake(fixture)
    const adapter = fixture.create({ spawner, executorVersion: fixture.version })
    const value = effective(fixture, overrides)
    let error: unknown
    try { await adapter.run({ ...request, executionConfiguration: value }) } catch (caught) { error = caught }
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).not.toContain('synthetic-secret')
    expect(spawner.children).toHaveLength(0)
  })
  it('rejects missing host version', async () => {
    const spawner = fake(fixture)
    await expect(fixture.create({ spawner }).run({ ...request, executionConfiguration: effective(fixture) })).rejects.toThrow()
    expect(spawner.children).toHaveLength(0)
  })
  it('rejects raw conflicting model flags only on the new path (rejected-policy regression)', async () => {
    const spawner = fake(fixture)
    await expect(fixture.create({ spawner, executorVersion: fixture.version, extraArgs: fixture.raw }).run({ ...request,
      executionConfiguration: effective(fixture) })).rejects.toThrow()
    expect(spawner.children).toHaveLength(0)
  })
})

describe.each(fixtures)('CLI legacy $id', (fixture) => {
  it('preserves arbitrary raw extraArgs and baseline prompt delivery without controls', async () => {
    const spawner = fake(fixture)
    await fixture.create({ spawner, extraArgs: fixture.raw }).run(request)
    const args = [...fixture.baseline, ...fixture.raw]
    expect(spawner.children[0]?.args).toEqual(fixture.id === 'opencode' ? [...args, '--', request.prompt] : args)
  })
})

it('CLI typed factory owns controls before later caller mutation', async () => {
  const spawner = fake(fixtures[0])
  const configuration = { reasoningEffort: 'high' }
  const controls = effective(fixtures[0], { configuration })
  const adapter = cli.createCodexAdapter({ spawner, executorVersion: '0.162.1', modelControls: controls })
  configuration.reasoningEffort = 'low'
  await adapter.run(request)
  expect(spawner.children[0]?.args).toContain('model_reasoning_effort="high"')
  expect(configuration.reasoningEffort).toBe('low')
})

it('CLI typed invocation snapshots trusted extraArgs before asynchronous admission', async () => {
  const spawner = fake(fixtures[0])
  const extraArgs = ['--title', 'synthetic-title']
  const adapter = cli.createCodexAdapter({ spawner, executorVersion: '0.162.1', extraArgs })
  const running = adapter.run({ ...request, executionConfiguration: effective(fixtures[0]) })
  extraArgs.push('--model', 'injected-model')
  await running
  expect(spawner.children[0]?.args).toEqual(['exec', '--json', '--skip-git-repo-check', '--model', 'fixture-model', '--config', 'model_reasoning_effort="high"', '--title', 'synthetic-title'])
})
it('CLI invalid incomplete native control mapping rejects instead of silently dropping a value', async () => {
  const spawner = fake(fixtures[0])
  const traits = { ...cli.CODEX_TRAITS, modelControls: { ...cli.CODEX_TRAITS.modelControls!, controlArguments: [] } }
  let error: unknown
  try {
    const adapter = cli.createCliExecutorAdapter(traits, { spawner, executorVersion: '0.162.1' })
    await adapter.run({ ...request, executionConfiguration: effective(fixtures[0]) })
  } catch (caught) { error = caught }
  expect(error).toBeInstanceOf(Error)
  expect(spawner.children).toHaveLength(0)
})

it('CLI invalid typed model argv refuses Windows cmd shims even for stdin executors', async () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
  try {
    const spawner = fake(fixtures[0])
    const adapter = cli.createCodexAdapter({ spawner, command: 'codex.cmd', executorVersion: '0.162.1' })
    await expect(adapter.run({ ...request, executionConfiguration: effective(fixtures[0], { model: 'fixture&synthetic-secret' }) })).rejects.toThrow()
    expect(spawner.children).toHaveLength(0)
  } finally { Object.defineProperty(process, 'platform', platform) }
})

it('CLI typed custom provider and root-scoped version extension need no engine provider switch', async () => {
  const contract = { providerId: 'custom-host', requiresModel: false,
    configurationSchema: defineStandardSchema<JsonObject>((value) => ({ value: value as JsonObject })),
    controls: [{ id: 'custom:depth', configurationKey: 'depth', schema: defineStandardSchema<JsonValue>((value) => ({ value: value as JsonValue })) }],
  }
  const traits: cli.ExecutorTraits = { executorId: 'custom-binary', command: 'synthetic.exe', args: ['execute', '--json'], promptDelivery: 'stdin', output: { payload: 'single-object', resultPath: ['answer'] },
    modelControls: { contract, executorVersions: ['host-qualified-v1'], modelFlag: '--engine-model', argumentIndex: 0,
      controlArguments: [{ configurationKey: 'depth', flag: '--depth' }], conflictingExtraArgs: ['--engine-model', '--depth'] },
  }
  const spawner = new FakeSpawner({ exitCode: 0, stdout: '{"answer":"custom result"}', stderr: '' })
  const adapter = cli.createCliExecutorAdapter(traits, { spawner, executorVersion: 'host-qualified-v1' })
  await adapter.run({ ...request, executionConfiguration: { version: 1, providerId: 'custom-host', model: 'custom-model', executorVersion: 'host-qualified-v1', configuration: { depth: 'deep' }, extensions: [], support: [{ id: 'custom:depth', status: 'supported', version: 'custom-evidence' }] } })
  expect(spawner.children[0]?.args).toEqual(['--engine-model', 'custom-model', '--depth', 'deep', 'execute', '--json'])
})

it.each(fixtures)('CLI invalid $id unknown matching host/envelope version still rejects', async (fixture) => {
  const spawner = fake(fixture)
  await expect(fixture.create({ spawner, executorVersion: 'unqualified-version' }).run({ ...request,
    executionConfiguration: effective(fixture, { executorVersion: 'unqualified-version' }) })).rejects.toThrow()
  expect(spawner.children).toHaveLength(0)
})
