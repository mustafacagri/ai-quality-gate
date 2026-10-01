/**
 * Verification Types - TypeCheck and Lint results
 */

import type { CheckStatus } from '@/constants/verification'
import type { Issue, QualityError } from './issue'
import type { FixSummary } from './mcp'

// ═══════════════════════════════════════════════════════════════════════════
// Phase Results
// ═══════════════════════════════════════════════════════════════════════════

export interface LocalResult {
  phaseError?: QualityError
  checks?: VerificationChecks
  passed: boolean
  fixed: FixSummary
  issues: Issue[]
}

export interface ServerResult {
  passed: boolean
  issues: Issue[]
  /** Set when Phase 2 failed due to SonarQube tooling/API/network (not code issues). */
  phaseError?: QualityError
}

// ═══════════════════════════════════════════════════════════════════════════
// Verification Results
// ═══════════════════════════════════════════════════════════════════════════

export interface TypeCheckResult {
  status?: CheckStatus
  checkedProjects?: string[]
  passed: boolean
  errors: Issue[]
}

export interface LintResult {
  status?: CheckStatus
  scannedFiles?: string[]
  passed: boolean
  hasErrors: boolean
  fixedCount: number
  errors: Issue[]
}

export interface VerificationChecks {
  typecheck: TypeCheckResult
  lint?: LintResult
}
