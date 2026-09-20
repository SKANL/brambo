import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runBrambo } from '../src'

/**
 * A USAGE ERROR NAMES A VERB THE USER CAN ACTUALLY RUN.
 *
 * `brambo project add` with no type answered `brambo add needs an entry type`.
 * The verb is right and the grammar is not: at project scope `brambo add` is a
 * different command against a different registry. The sharpest of these was
 * `brambo add mcp-server <id> --command <c>`, printed as "updates this entry in
 * place" — run at project scope it creates a SECOND entry, in the MACHINE
 * registry.
 *
 * These are not the exits `doctor` prints; there is no state to leave, so a
 * driven "run it and see" has nothing to observe. What is driven here is the
 * message itself: the real argv, at both scopes, reading what the binary
 * actually said. Every row carries its machine twin, because a rule that only
 * checks the project spelling is satisfied by a message that says `brambo
 * project` everywhere — including where it must not.
 */

async function say(argv: readonly string[], projectDir?: string): Promise<string> {
  const lines: string[] = []
  const homeDir = await mkdtemp(join(tmpdir(), 'brambo-scope-home-'))
  await runBrambo(argv, {
    homeDir,
    cwd: projectDir ?? homeDir,
    stdout: (line) => lines.push(line),
    stderr: (line) => lines.push(line),
  })
  return lines.join('\n')
}

describe('a usage error names the grammar the user is in', () => {
  const ROWS: readonly (readonly [string, readonly string[]])[] = [
    ['add with no type', ['add']],
    ['remove with no type', ['remove']],
    ['add with no id', ['add', 'mcp-server']],
    ['remove with no id', ['remove', 'mcp-server']],
    ['swap with no noun', ['swap']],
    ['swap with no id', ['swap', 'executor']],
    ['remediate with no remediation', ['remediate']],
  ]

  /** The one line that is the usage error, not the `usage:` block beneath it. */
  const complaintIn = (said: string): string =>
    said.split('\n').find((line) => line.startsWith('brambo ') && line.includes('needs')) ?? ''

  it.each(ROWS)('%s, at project scope, names the project grammar', async (_label, argv) => {
    const projectDir = await mkdtemp(join(tmpdir(), 'brambo-scope-proj-'))
    // No trailing directory: `brambo project add <dir>` reads the directory as
    // the TYPE and answers a different complaint. The scope comes from `cwd`,
    // which is what a user in that directory has.
    const said = await say(['project', ...argv], projectDir)
    const complaint = complaintIn(said)
    // The row has to find a complaint, or the assertion below passes by reading
    // an empty string.
    expect(complaint, `no usage error for 'brambo project ${argv.join(' ')}':\n${said}`).not.toBe('')
    expect(complaint, `'brambo project ${argv.join(' ')}' answered with the MACHINE grammar`).toMatch(
      new RegExp(`^brambo project ${String(argv[0])}\\b`),
    )
  })

  it.each(ROWS)('%s, at machine scope, still names the machine grammar', async (_label, argv) => {
    // THE CONTROL, one per row. Without it every clause above is satisfied by a
    // build that says `brambo project` unconditionally — the same defect pointing
    // the other way.
    const complaint = complaintIn(await say(argv))
    expect(complaint, `no usage error for 'brambo ${argv.join(' ')}'`).not.toBe('')
    expect(complaint, `'brambo ${argv.join(' ')}' stopped naming its own grammar`).toMatch(
      new RegExp(`^brambo ${String(argv[0])}\\b`),
    )
  })
})
