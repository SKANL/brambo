import { lstat, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { uniqueBytes, type FileMeasure } from './measure.ts'

/** A tree that was walked. `uniqueBytes` already charges hardlink shares. */
export interface ScanMeasurement {
  readonly kind: 'measured'
  /** The root as it was given. */
  readonly root: string
  /** Names counted; a hardlinked inode reached through two names counts twice. */
  readonly files: number
  /** Sum of every name's size, the number a naive report shows. */
  readonly logicalBytes: number
  /** What the tree actually occupies, hardlinks charged their share. */
  readonly uniqueBytes: number
  /** Reparse points (symlinks, junctions) and revisited directories, not followed. */
  readonly skippedReparse: number
}

/** The root was not there. Absence is an answer, not a failure. */
export interface ScanAbsence {
  readonly kind: 'absent'
  readonly root: string
}

export type ScanOutcome = ScanMeasurement | ScanAbsence

interface Counters {
  files: number
  logicalBytes: number
  skippedReparse: number
}

/**
 * Measures one directory tree without ever following a link out of it.
 *
 * Two independent guards stop a loop, because either alone has a hole:
 *
 * 1. `lstat` marks a symlink or a Windows junction (a directory reparse point),
 *    and those are counted as skipped rather than entered. This is the guard that
 *    keeps a pnpm `node_modules` from being walked forever: its `esbuild`,
 *    `typescript` and `vitest` entries are reparse points.
 * 2. A directory already visited, identified by `dev:ino`, is skipped. A link
 *    whose reparse bit a platform reports differently still cannot make the walk
 *    revisit a directory it has already listed.
 *
 * Hardlinks are NOT deduplicated here. Each name reports the inode's real
 * `nlink`, so `uniqueBytes` charges it `size / nlink` at every name and the tree
 * totals the inode once. That is also what makes two trees summing correctly:
 * the same store inode in ten worktrees contributes a tenth in each.
 */
export async function scanTree(root: string): Promise<ScanOutcome> {
  const counters: Counters = { files: 0, logicalBytes: 0, skippedReparse: 0 }
  const entries: FileMeasure[] = []

  let rootStats
  try {
    rootStats = await lstat(root)
  } catch (error) {
    if (isMissing(error)) return { kind: 'absent', root }
    throw error
  }
  if (rootStats.isSymbolicLink()) {
    return { kind: 'measured', root, files: 0, logicalBytes: 0, uniqueBytes: 0, skippedReparse: 1 }
  }
  if (!rootStats.isDirectory()) {
    if (!rootStats.isFile()) {
      return { kind: 'measured', root, files: 0, logicalBytes: 0, uniqueBytes: 0, skippedReparse: 0 }
    }
    entries.push({ size: rootStats.size, linkCount: rootStats.nlink })
    counters.files += 1
    counters.logicalBytes += rootStats.size
    return {
      kind: 'measured',
      root,
      files: counters.files,
      logicalBytes: counters.logicalBytes,
      uniqueBytes: uniqueBytes(entries),
      skippedReparse: counters.skippedReparse,
    }
  }

  const visited = new Set<string>([directoryKey(rootStats.dev, rootStats.ino)])
  const stack: string[] = [root]
  while (stack.length > 0) {
    const directory = stack.pop() as string
    let names: string[]
    try {
      names = await readdir(directory)
    } catch (error) {
      if (isMissing(error)) continue
      throw error
    }
    for (const name of names) {
      const full = join(directory, name)
      let stats
      try {
        stats = await lstat(full)
      } catch (error) {
        // A name removed between the listing and the stat is not a failure: the
        // tree changed underneath a measurement, which a scan must survive.
        if (isMissing(error)) continue
        throw error
      }
      if (stats.isSymbolicLink()) {
        counters.skippedReparse += 1
        continue
      }
      if (stats.isDirectory()) {
        const key = directoryKey(stats.dev, stats.ino)
        if (visited.has(key)) {
          counters.skippedReparse += 1
          continue
        }
        visited.add(key)
        stack.push(full)
        continue
      }
      // Anything that is neither a file nor a directory (device, socket, FIFO)
      // carries no reclaimable bytes and is not counted as one.
      if (!stats.isFile()) continue
      counters.files += 1
      counters.logicalBytes += stats.size
      entries.push({ size: stats.size, linkCount: stats.nlink })
    }
  }

  return {
    kind: 'measured',
    root,
    files: counters.files,
    logicalBytes: counters.logicalBytes,
    uniqueBytes: uniqueBytes(entries),
    skippedReparse: counters.skippedReparse,
  }
}

function directoryKey(dev: number, ino: number): string {
  return `${dev}:${ino}`
}

function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}
