/**
 * Every `QualityFixResponse` is assembled here, so the counts, the timing and the shape of an error cannot
 * drift apart between the gate, the MCP handler and the CLI.
 */

import { PHASE } from '@/constants'
import { ERROR_CODE } from '@/constants/errors'
import { RollbackError } from '@/core/TransactionManager'
import type { ErrorCode, FixSummary, Issue, Phase, QualityError, QualityFixResponse, Timing } from '@/types'
import type { VerificationChecks } from '@/types/verification'
import { errorMessage } from '@/utils/errorMessage'
import { countEdits, editsOnly, emptyFixSummary } from '@/utils/fixSummary'

const MS_PER_SECOND = 1000

export const formatDuration = (ms: number): string =>
  ms < MS_PER_SECOND ? `${ms}ms` : `${(ms / MS_PER_SECOND).toFixed(1)}s`

/** Timing of a run that did nothing. */
export const zeroTiming = (): Timing => ({ phase1: formatDuration(0), total: formatDuration(0) })

export interface ResponseInput {
  phase: Phase
  success: boolean
  message: string
  /** Edits on disk after the run. */
  fixed: FixSummary
  remaining: Issue[]
  timing: Timing
  checks?: VerificationChecks | undefined
  error?: QualityError | undefined
  /** Edits made before a rollback. Reported only when there were any. */
  attempted?: FixSummary | undefined
}

export const buildResponse = (input: ResponseInput): QualityFixResponse => {
  const fixedCount = countEdits(input.fixed)
  const response: QualityFixResponse = {
    phase: input.phase,
    success: input.success,
    message: input.message,
    totalIssues: fixedCount + input.remaining.length,
    remainingCount: input.remaining.length,
    fixedCount,
    fixed: input.fixed,
    remaining: input.remaining,
    timing: input.timing
  }

  if (input.checks !== undefined) response.checks = input.checks

  if (input.error !== undefined) response.error = input.error

  const attemptedCount = input.attempted === undefined ? 0 : countEdits(input.attempted)

  if (input.attempted !== undefined && attemptedCount > 0) {
    response.attempted = editsOnly(input.attempted)
    response.attemptedCount = attemptedCount
  }

  return response
}

/** A run with nothing to check. */
export const noFilesResponse = (message: string): QualityFixResponse =>
  buildResponse({
    phase: PHASE.COMPLETE,
    success: true,
    message,
    fixed: emptyFixSummary(),
    remaining: [],
    timing: zeroTiming()
  })

/** A run that ended in an error: nothing is on disk as a fix, whatever was tried is `attempted`. */
export const failureResponse = (input: {
  phase: Phase
  message: string
  remaining: Issue[]
  timing: Timing
  error: QualityError
  attempted?: FixSummary
}): QualityFixResponse => buildResponse({ ...input, success: false, fixed: emptyFixSummary() })

/**
 * A failed rollback says which files it could not restore, so a caller knows where the disk may still hold the
 * edits of a run that was meant to be undone.
 */
export const qualityErrorFrom = (code: ErrorCode, error: unknown): QualityError => {
  const message = errorMessage(error)

  if (!(error instanceof RollbackError)) return { code, message }

  return {
    code,
    message,
    details: { unrestoredFiles: error.failures.map(failure => failure.file), restoredFiles: [...error.restored] }
  }
}

export const errorSummary = (code: ErrorCode): string => {
  if (code !== ERROR_CODE.ROLLBACK_FAILED) return 'An error occurred during quality checks'

  return 'Critical error: rollback failed. Files that were not restored may still contain the edits counted under `attempted`; `error.details.unrestoredFiles` and `error.message` name them. `remaining` is what failed before the rollback, with unknown locations.'
}
