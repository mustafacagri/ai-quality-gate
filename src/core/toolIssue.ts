import { RULE_NAMES, SEVERITY, UNKNOWN_ISSUE_LINE } from '@/constants'
import type { Issue } from '@/types'
import { errorMessage } from '@/utils/errorMessage'

/** A tool that could not run is an issue of its own, so the run cannot pass as if the tool had found nothing. */
export const toolIssue = (rule: string, file: string, error: unknown): Issue => ({
  rule,
  file,
  line: UNKNOWN_ISSUE_LINE,
  message: `Check execution error: ${errorMessage(error)}`,
  severity: SEVERITY.ERROR
})

/** Files that have no tsconfig, reported once each. */
export const missingTsConfigIssues = (files: readonly string[]): Issue[] =>
  files.map(file => ({
    rule: RULE_NAMES.TYPESCRIPT,
    file,
    line: UNKNOWN_ISSUE_LINE,
    message: 'No tsconfig.json found for this file',
    severity: SEVERITY.ERROR
  }))
