/**
 * One name for a file, as any measurement ever sees it.
 *
 * `linkCount` is the number of names the underlying inode carries on its volume
 * (`nlink`). It belongs to the FILE, not to this name: every name reports the
 * same count. That is what makes charging each name `size / linkCount` count the
 * inode exactly once however many of its names a measurement happens to include.
 */
export interface FileMeasure {
  /** On-disk size of the file in bytes. */
  readonly size: number
  /** Names this inode has on its volume. A file always has at least one. */
  readonly linkCount: number
}

/**
 * The bytes a measurement actually occupies, with hardlinks charged their share.
 *
 * A file with four links contributes a quarter of its size to each name, so one
 * pnpm store inode measured across many worktrees is counted once in total. A
 * logical sum would report that inode once per name instead: in the 2026-11
 * audit the logical total was 180.09 GB against 64.23 GB of real bytes, an
 * overstatement of 2.8x that makes a reclaim plan untrustworthy.
 *
 * `linkCount` is floored to at least one. Zero or negative is impossible on a
 * real volume, and charging such a file in full over-reports it — which a reader
 * can survive — whereas dropping its bytes silently under-reports what a removal
 * would free.
 */
export function uniqueBytes(files: Iterable<FileMeasure>): number {
  let total = 0
  for (const file of files) {
    if (!Number.isFinite(file.size) || file.size < 0) {
      throw new RangeError(`a file size must be finite and non-negative, received ${file.size}`)
    }
    const links = Math.max(1, Math.floor(file.linkCount))
    total += file.size / links
  }
  return Math.round(total)
}
