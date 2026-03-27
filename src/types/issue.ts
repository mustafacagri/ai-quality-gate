/**
 * Issue Types - Quality issues and errors
 */

import type { Severity } from './core'

export interface Issue {
  rule: string
  file: string
  line: number
  column?: number | undefined
  message: string
  severity: Severity
}

export type ErrorCode =
  | 'CONFIG_INVALID'
  | 'LINT_FAILED'
  | 'PERSISTENT_FAILURE'
  | 'ROLLBACK_FAILED'
  | 'SONAR_API_ERROR'
  | 'SONAR_CONNECTION_FAILED'
  | 'SONAR_SCANNER_NOT_FOUND'
  | 'SONAR_TIMEOUT'
  | 'TRANSFORM_FAILED'
  | 'TSCONFIG_NOT_FOUND'
  | 'TYPECHECK_FAILED'
  | 'UNEXPECTED_ERROR'
  | 'VERIFICATION_FAILED'

export interface QualityError {
  code: ErrorCode
  message: string
  details?: Record<string, unknown>
}
