/**
 * Process exit codes for CLI (CI / scripts)
 */

export const EXIT_CODE = {
  /** Quality checks passed */
  SUCCESS: 0,
  /** Quality checks failed (issues found or verification failed) */
  QUALITY_FAILED: 1,
  /** Configuration error, unexpected exception, or invalid CLI usage */
  ERROR: 2
} as const

export type ExitCode = (typeof EXIT_CODE)[keyof typeof EXIT_CODE]
