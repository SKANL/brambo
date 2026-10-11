import { BramboError, BRAMBO_ERROR_CODES, defineStandardSchema, validateEffectiveExecutionConfiguration,
  validateExecutionControlContract, snapshotExecutionControlSchema } from '@brambodev/contracts'
import type { EffectiveExecutionConfiguration, ExecutionControlContract, JsonObject, JsonValue } from '@brambodev/contracts'
import type { ExecutorTraits } from './traits.ts'

export interface CodexModelConfiguration { readonly reasoningEffort?: string }
export interface ClaudeCodeModelConfiguration { readonly effort?: string }
export interface OpenCodeModelConfiguration { readonly variant?: string }

/** Trusted trait data describes a native surface, not a universal provider/version catalog. */
export interface CliModelControlTraits {
  readonly contract: ExecutionControlContract
  readonly executorVersions: readonly string[]
  readonly modelFlag: string
  readonly modelFormat?: 'provider/model'
  /** Native scope insertion point in fixed argv; omitted appends after fixed args. */
  readonly argumentIndex?: number
  readonly controlArguments: readonly { readonly configurationKey: string; readonly flag: string; readonly assignmentKey?: string }[]
  /** Raw host flags that could override the admitted model/control selection. */
  readonly conflictingExtraArgs: readonly string[]
}

function reject(): never {
  throw new BramboError(BRAMBO_ERROR_CODES.contractEnvelopeInvalid, 'invalid or unsupported CLI model controls')
}
function token(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !value.startsWith('-') && !/\s/u.test(value) && !Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
}
function contract(providerId: string, key: string, values?: readonly string[]): ExecutionControlContract {
  const accepts = (value: unknown): value is string => token(value) && (values === undefined || values.includes(value))
  const valueSchema = defineStandardSchema<JsonValue>((value) => accepts(value)
    ? { value } : { issues: [{ message: 'invalid CLI native control value' }] })
  const configurationSchema = defineStandardSchema<JsonObject>((value) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some((field) => field !== key) ||
      Object.hasOwn(value, key) && !accepts((value as JsonObject)[key])) return { issues: [{ message: 'invalid CLI control fields' }] }
    return { value: value as JsonObject }
  })
  return validateExecutionControlContract({ providerId, requiresModel: false,
    configurationSchema: snapshotExecutionControlSchema(configurationSchema),
    controls: [{ id: `${providerId}:${key}`, configurationKey: key, schema: snapshotExecutionControlSchema(valueSchema) }] })
}
// Native vocabularies only. The host resolver must separately narrow values for its selected model.
export const CODEX_CONTROL_CONTRACT = contract('codex', 'reasoningEffort',
  ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'persistent'])
export const CLAUDE_CODE_CONTROL_CONTRACT = contract('claude-code', 'effort', ['low', 'medium', 'high', 'xhigh'])
export const OPENCODE_CONTROL_CONTRACT = contract('opencode', 'variant')

/** Snapshot trusted schemas and trait arrays once; admitted JSON remains separately owned. */
export function snapshotCliModelControlTraits(input: CliModelControlTraits): CliModelControlTraits {
  const validated = validateExecutionControlContract(input.contract)
  const keys = validated.controls.map((entry) => entry.configurationKey)
  const mapped = input.controlArguments.map((entry) => entry.configurationKey)
  if (keys.some((key) => key === undefined || !mapped.includes(key)) ||
    mapped.length !== keys.length || new Set(mapped).size !== mapped.length) reject()
  return Object.freeze({ ...input,
    contract: Object.freeze({ ...validated,
      configurationSchema: snapshotExecutionControlSchema(validated.configurationSchema),
      controls: Object.freeze(validated.controls.map((entry) => Object.freeze({ ...entry, schema: snapshotExecutionControlSchema(entry.schema) }))),
    }),
    executorVersions: Object.freeze([...input.executorVersions]),
    controlArguments: Object.freeze(input.controlArguments.map((entry) => Object.freeze({ ...entry }))),
    conflictingExtraArgs: Object.freeze([...input.conflictingExtraArgs]),
  })
}

/** Pure synchronous native projection of an admitted effective envelope, including fixed argv.
 * Invocation admission (schemas/receipts) uses validateExecutionConfigurationForContract before this builder.
 */
export function buildCliModelArguments(traits: ExecutorTraits, input: EffectiveExecutionConfiguration, executorVersion: string): readonly string[] {
  try {
    const effective = validateEffectiveExecutionConfiguration(input)
    const native = traits.modelControls
    if (!native || !executorVersion || effective.executorVersion !== executorVersion ||
      !native.executorVersions.includes(executorVersion) || effective.providerId !== native.contract.providerId) reject()
    if (effective.model !== undefined && (!token(effective.model) ||
      native.modelFormat === 'provider/model' && !/^[^/]+\/.+$/u.test(effective.model))) reject()
    const result = native.contract.configurationSchema['~standard'].validate(effective.configuration)
    if (result instanceof Promise || result === null || typeof result !== 'object' || effective.extensions.length > 0) reject()
    const fields = Object.getOwnPropertyDescriptors(result)
    if (!fields['value']?.enumerable || !('value' in fields['value']) ||
        fields['issues'] && (!('value' in fields['issues']) || fields['issues'].value !== undefined)) reject()
    const controls: string[] = effective.model === undefined ? [] : [native.modelFlag, effective.model]
    for (const entry of native.controlArguments) {
      const value = effective.configuration[entry.configurationKey]
      if (value === undefined) continue
      if (!token(value)) reject()
      controls.push(entry.flag, entry.assignmentKey === undefined ? value : `${entry.assignmentKey}=${JSON.stringify(value)}`)
    }
    const index = native.argumentIndex ?? traits.args.length
    if (!Number.isInteger(index) || index < 0 || index > traits.args.length) reject()
    return Object.freeze([...traits.args.slice(0, index), ...controls, ...traits.args.slice(index)])
  } catch { reject() }
}

export function assertNoRawModelOverrides(extraArgs: readonly string[], native: CliModelControlTraits): void {
  for (const argument of extraArgs) {
    if (native.conflictingExtraArgs.some((flag) => argument === flag || argument.startsWith(`${flag}=`) ||
      /^-[^-]$/u.test(flag) && argument.startsWith(flag))) reject()
  }
}
