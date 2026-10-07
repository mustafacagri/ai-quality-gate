/**
 * Issue Types - Quality issues and errors
 */

import type { ERROR_CODE } from '@/constants/errors'
import type { VERIFICATION_ERROR_CODE } from '@/constants/verification'
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
  | (typeof ERROR_CODE)[keyof typeof ERROR_CODE]
  | (typeof VERIFICATION_ERROR_CODE)[keyof typeof VERIFICATION_ERROR_CODE]

export interface QualityError {
  code: ErrorCode
  message: string
  details?: Record<string, unknown>
}
