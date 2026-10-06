import { describe, expect, it } from 'vitest'
import {
  createLogSink,
  inspectLocalWorkspaces,
  inspectWorktrees,
  readExecutorConfigLayers,
  readUsageReports,
  recordUsageObservation,
  removeLocalWorkspace,
  removeWorktree,
  resolveExecutor,
  resolveMethod,
  runSession,
  worktreeStateDir,
} from '@brambodev/session/cli'

describe('@brambodev/session/cli', () => {
  it('provides the existing session helpers used by the CLI', () => {
    expect([
      createLogSink,
      inspectLocalWorkspaces,
      inspectWorktrees,
      readExecutorConfigLayers,
      readUsageReports,
      recordUsageObservation,
      removeLocalWorkspace,
      removeWorktree,
      resolveExecutor,
      resolveMethod,
      runSession,
      worktreeStateDir,
    ].every((value) => typeof value === 'function')).toBe(true)
  })
})
