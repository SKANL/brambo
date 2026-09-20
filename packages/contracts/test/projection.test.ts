import { describe, expect, it } from 'vitest'
import {
  BRAMBO_ERROR_CODES,
  BramboError,
  PROJECTION_LEDGER_VERSION,
} from '../src'
import type { DriftEntry, ProjectionLedgerRecord } from '../src'

describe('projection ownership vocabulary', () => {
  it('carries NO reserved namespace, marker or grammar version', async () => {
    // The corrected model owns nothing inside a vendor's file, so there is
    // nothing here to write into one. This assertion is what keeps the
    // invalidated vocabulary from creeping back as a "compatibility" export.
    const contracts = (await import('../src')) as Record<string, unknown>
    for (const retired of [
      'PROJECTION_RESERVED_ROOT_KEY',
      'PROJECTION_GRAMMAR_VERSION',
      'BRAMBO_MANAGED_BLOCK_BEGIN',
      'BRAMBO_MANAGED_BLOCK_END',
      'classifyOwnedMarker',
    ]) {
      expect(contracts[retired], `${retired} must not be re-exported`).toBeUndefined()
    }
  })

  it('versions the ledger document, not anything written into a vendor file', () => {
    expect(PROJECTION_LEDGER_VERSION).toBe(1)
  })

  it('names a ledger record by target, file and native location', () => {
    const record: ProjectionLedgerRecord = {
      targetId: 'claude-mcp',
      filePath: '/home/u/.claude.json',
      nativeLocation: 'mcpServers.context7',
      entryId: 'context7',
      contentHash: 'abc',
    }
    // All five fields are load-bearing authority: a record only licenses an
    // action at its own target, file, location and id, and only while the
    // content still hashes to what brambo wrote.
    expect(Object.keys(record).sort()).toEqual([
      'contentHash',
      'entryId',
      'filePath',
      'nativeLocation',
      'targetId',
    ])
  })

  it('types every drift verdict as REPORTED, never as a repair instruction', () => {
    // A marker inside a vendor file could only ever say "present" or "absent";
    // these three verdicts are why ownership moved to the ledger. Typed
    // exhaustively, so adding a fourth kind without deciding what brambo does
    // about it fails to compile.
    const reported: Record<DriftEntry['kind'], string> = {
      edited: 'brambo will not overwrite it',
      'removed-by-user': 'brambo will not re-add it',
      'foreign-collision': 'brambo will not resolve it',
    }
    expect(Object.keys(reported)).toHaveLength(3)
  })
})

describe('projection error codes', () => {
  it.each([
    ['projectionNativeMalformed', 'BRAMBO_PROJECTION_NATIVE_MALFORMED'],
    ['projectionNativeUnclaimable', 'BRAMBO_PROJECTION_NATIVE_UNCLAIMABLE'],
    ['projectionTargetFailed', 'BRAMBO_PROJECTION_TARGET_FAILED'],
    ['projectionTraitsInvalid', 'BRAMBO_PROJECTION_TRAITS_INVALID'],
    ['projectionLedgerUnavailable', 'BRAMBO_PROJECTION_LEDGER_UNAVAILABLE'],
  ])('exposes %s canonically', (key, literal) => {
    const code = BRAMBO_ERROR_CODES[key as keyof typeof BRAMBO_ERROR_CODES]
    // Dual assertion: canonical constant AND verbatim literal, so either side
    // drifting independently fails here before consumers see a renamed code.
    expect(new BramboError(code, 'x').code).toBe(code)
    expect(code).toBe(literal)
  })

  it('keeps BRAMBO_REGISTRY_* codes out of the projection surface (AD-7)', () => {
    // The ledger borrowed @brambodev/registry's lock once; it leaked registry
    // contention codes out of a projection API along with the dependency.
    const projectionErrors = Object.entries(BRAMBO_ERROR_CODES).filter(([key]) =>
      key.startsWith('projection'),
    )
    expect(projectionErrors.length).toBeGreaterThan(0)
    for (const [, code] of projectionErrors) expect(code.startsWith('BRAMBO_PROJECTION_')).toBe(true)
  })
})
