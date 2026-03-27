/**
 * Severity Levels
 * Used for categorizing issues
 */

export const SEVERITY = {
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
} as const

export type Severity = (typeof SEVERITY)[keyof typeof SEVERITY]
