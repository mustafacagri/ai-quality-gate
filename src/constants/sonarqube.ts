/**
 * SonarQube Constants
 * Used for Phase 2 server analysis
 */

// ═══════════════════════════════════════════════════════════════════════════
// Severity Mapping
// ═══════════════════════════════════════════════════════════════════════════

/**
 * SonarQube severity levels
 */
export const SONAR_SEVERITY = {
  BLOCKER: 'BLOCKER',
  CRITICAL: 'CRITICAL',
  MAJOR: 'MAJOR',
  MINOR: 'MINOR',
  INFO: 'INFO'
} as const

export type SonarSeverity = (typeof SONAR_SEVERITY)[keyof typeof SONAR_SEVERITY]

// ═══════════════════════════════════════════════════════════════════════════
// Task Status
// ═══════════════════════════════════════════════════════════════════════════

/**
 * SonarQube analysis task status
 */
export const SONAR_TASK_STATUS = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  CANCELED: 'CANCELED'
} as const

export type SonarTaskStatus = (typeof SONAR_TASK_STATUS)[keyof typeof SONAR_TASK_STATUS]
